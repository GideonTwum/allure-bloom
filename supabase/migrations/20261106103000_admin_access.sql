-- Admin access. Depends on 20261106100000_branch_configuration.sql.
-- Not deployed to the remote project.
-- Creates no staff accounts and inserts no role rows.
-- The booking foundation migration still defines public.studio_roles.
-- Revise that file before it is deployed so home-service approval uses
-- this schema instead of a global admin role.

set search_path = public;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')
    or not exists (select 1 from pg_roles where rolname = 'authenticated')
    or not exists (select 1 from pg_roles where rolname = 'service_role')
  then
    raise exception 'anon, authenticated, and service_role must exist before this migration';
  end if;

  if to_regclass('auth.users') is null
    or to_regprocedure('auth.uid()') is null
    or to_regprocedure('auth.jwt()') is null
  then
    raise exception 'auth.users, auth.uid(), and auth.jwt() must exist before this migration';
  end if;
end $$;

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon, authenticated, service_role;

comment on schema private is
  'Privileged admin checks. Not an exposed API schema.';

create table public.admin_assignments (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null,
  is_active boolean not null,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint admin_assignments_role check (role in ('owner', 'manager')),
  constraint admin_assignments_revocation check (
    (is_active and revoked_at is null)
    or (not is_active and revoked_at is not null)
  ),
  constraint admin_assignments_not_self_granted check (
    granted_by is null or granted_by <> user_id
  )
);

comment on table public.admin_assignments is
  'Owner and studio-manager access. JWT user_metadata is never consulted.';

create index admin_assignments_active_role_idx
  on public.admin_assignments (role)
  where is_active;

create table public.manager_branches (
  user_id uuid not null references public.admin_assignments (user_id) on delete cascade,
  branch_id text not null references public.branches (id),
  is_active boolean not null,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, branch_id),
  constraint manager_branches_revocation check (
    (is_active and revoked_at is null)
    or (not is_active and revoked_at is not null)
  ),
  constraint manager_branches_not_self_granted check (
    granted_by is null or granted_by <> user_id
  )
);

comment on table public.manager_branches is
  'Studios a manager may operate. Owners are not listed here; the owner role covers every studio.';

create index manager_branches_active_idx
  on public.manager_branches (branch_id)
  where is_active;

create table public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  target_user_id uuid not null,
  branch_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_audit_events_action check (
    action in (
      'owner_provisioned',
      'owner_granted',
      'owner_revoked',
      'manager_granted',
      'manager_reactivated',
      'manager_revoked',
      'branch_assigned',
      'branch_reactivated',
      'branch_revoked'
    )
  ),
  constraint admin_audit_events_branch check (
    (
      action in ('branch_assigned', 'branch_reactivated', 'branch_revoked')
      and branch_id is not null
    )
    or (
      action not in ('branch_assigned', 'branch_reactivated', 'branch_revoked')
      and branch_id is null
    )
  )
);

comment on table public.admin_audit_events is
  'Append-only record of successful staff changes. Written in the same transaction as the change.';

create index admin_audit_events_target_idx
  on public.admin_audit_events (target_user_id, created_at);

create or replace function private.caller_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select case
    when auth.uid() is not null
      and coalesce(auth.jwt() ->> 'role', '') = 'authenticated'
    then auth.uid()
    else null
  end;
$$;

comment on function private.caller_id() is
  'Signed-in user from auth.uid(). The JWT role must be authenticated. user_metadata is ignored.';

create or replace function private.require_active_owner()
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  owner_id uuid;
begin
  owner_id := private.caller_id();

  if owner_id is null or not exists (
    select 1
    from public.admin_assignments assignment
    where assignment.user_id = owner_id
      and assignment.role = 'owner'
      and assignment.is_active
  ) then
    raise exception 'not authorized';
  end if;

  return owner_id;
end;
$$;

create or replace function private.lock_admin_changes()
returns void
language sql
volatile
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.pg_advisory_xact_lock(4811206103000);
$$;

create or replace function private.allow_admin_write()
returns void
language sql
volatile
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.set_config('allure.admin_write', 'authorized', true);
$$;

create or replace function private.record_admin_event(
  actor uuid,
  event_action text,
  target_user uuid,
  event_branch text
)
returns void
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  insert into public.admin_audit_events (actor_id, action, target_user_id, branch_id)
  values (actor, event_action, target_user, event_branch);
$$;

create or replace function private.protect_admin_tables()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  table_owner name;
begin
  if tg_table_name = 'admin_audit_events' and tg_op <> 'INSERT' then
    raise exception 'audit events are append-only';
  end if;

  select pg_catalog.pg_get_userbyid(relowner) into table_owner
  from pg_catalog.pg_class
  where oid = tg_relid;

  if table_owner is distinct from current_user
    or pg_catalog.current_setting('allure.admin_write', true) is distinct from 'authorized'
  then
    raise exception 'staff access cannot be changed directly';
  end if;

  if tg_op = 'UPDATE' and tg_table_name = 'admin_assignments' then
    if new.user_id is distinct from old.user_id or new.role is distinct from old.role then
      raise exception 'an assignment role cannot be changed in place';
    end if;
  end if;

  if tg_table_name = 'manager_branches' and tg_op in ('INSERT', 'UPDATE') then
    if not exists (
      select 1
      from public.admin_assignments assignment
      where assignment.user_id = new.user_id
        and assignment.role = 'manager'
    ) then
      raise exception 'branch membership is only for managers';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger protect_admin_assignments
  before insert or update or delete on public.admin_assignments
  for each row
  execute function private.protect_admin_tables();

create trigger protect_manager_branches
  before insert or update or delete on public.manager_branches
  for each row
  execute function private.protect_admin_tables();

create trigger protect_admin_audit_events
  before insert or update or delete on public.admin_audit_events
  for each row
  execute function private.protect_admin_tables();

create or replace function private.assert_bootstrap_operator()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  owner_name name;
begin
  if session_user in ('anon', 'authenticated', 'service_role', 'authenticator') then
    raise exception 'not authorized';
  end if;

  select pg_catalog.pg_get_userbyid(relowner) into owner_name
  from pg_catalog.pg_class
  where oid = 'public.admin_assignments'::regclass;

  if session_user is distinct from owner_name
    and not coalesce((
      select rolsuper
      from pg_catalog.pg_roles
      where rolname = session_user
    ), false)
  then
    raise exception 'not authorized';
  end if;
end;
$$;

create or replace function private.provision_owner(target_user uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.assert_bootstrap_operator();
  perform private.lock_admin_changes();

  if target_user is null or not exists (
    select 1 from auth.users account where account.id = target_user
  ) then
    raise exception 'user does not exist';
  end if;

  if exists (
    select 1
    from public.admin_assignments assignment
    where assignment.role = 'owner'
      and assignment.is_active
  ) then
    raise exception 'an active owner already exists';
  end if;

  if exists (
    select 1
    from public.admin_assignments assignment
    where assignment.user_id = target_user
  ) then
    raise exception 'user already has an admin assignment';
  end if;

  perform private.allow_admin_write();

  insert into public.admin_assignments (user_id, role, is_active, granted_by)
  values (target_user, 'owner', true, null);

  perform private.record_admin_event(null, 'owner_provisioned', target_user, null);
  return target_user;
end;
$$;

comment on function private.provision_owner(uuid) is
  'Creates the first owner. Callable by the database operator only. Never granted to API roles.';

create or replace function public.admin_context()
returns table (role text, branch_id text)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select assignment.role, studio.id
  from public.admin_assignments assignment
  join public.branches studio on true
  where assignment.user_id = private.caller_id()
    and assignment.role = 'owner'
    and assignment.is_active
  union all
  select assignment.role, membership.branch_id
  from public.admin_assignments assignment
  join public.manager_branches membership
    on membership.user_id = assignment.user_id
   and membership.is_active
  where assignment.user_id = private.caller_id()
    and assignment.role = 'manager'
    and assignment.is_active;
$$;

comment on function public.admin_context() is
  'Role and permitted studios for the signed-in administrator. An owner receives every studio. Anyone else receives only active manager assignments.';

create or replace function public.manage_branch(target_branch text)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if target_branch is null or not exists (
    select 1 from public.branches studio where studio.id = target_branch
  ) then
    raise exception 'unknown studio';
  end if;

  if exists (
    select 1
    from public.admin_context() context
    where context.branch_id = target_branch
  ) then
    return target_branch;
  end if;

  raise exception 'not authorized';
end;
$$;

comment on function public.manage_branch(text) is
  'Confirms the signed-in administrator may operate this studio. A manager cannot use another studio.';

create or replace function private.require_known_user(target_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
begin
  if target_user is null or not exists (
    select 1 from auth.users account where account.id = target_user
  ) then
    raise exception 'user does not exist';
  end if;
end;
$$;

create or replace function public.grant_owner(target_user uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
begin
  actor := private.require_active_owner();
  perform private.lock_admin_changes();
  actor := private.require_active_owner();
  perform private.require_known_user(target_user);

  if target_user = actor then
    raise exception 'an owner cannot change their own role';
  end if;

  if exists (
    select 1
    from public.admin_assignments assignment
    where assignment.user_id = target_user
  ) then
    raise exception 'user already has an admin assignment';
  end if;

  perform private.allow_admin_write();

  insert into public.admin_assignments (user_id, role, is_active, granted_by)
  values (target_user, 'owner', true, actor);

  perform private.record_admin_event(actor, 'owner_granted', target_user, null);
  return target_user;
end;
$$;

create or replace function public.revoke_owner(target_user uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
  active_owners integer;
begin
  actor := private.require_active_owner();
  perform private.lock_admin_changes();
  actor := private.require_active_owner();

  if not exists (
    select 1
    from public.admin_assignments assignment
    where assignment.user_id = target_user
      and assignment.role = 'owner'
      and assignment.is_active
  ) then
    raise exception 'owner access is not active';
  end if;

  select count(*) into active_owners
  from public.admin_assignments assignment
  where assignment.role = 'owner'
    and assignment.is_active;

  if active_owners <= 1 then
    raise exception 'the last active owner cannot be revoked';
  end if;

  if target_user = actor then
    raise exception 'an owner cannot revoke themselves';
  end if;

  perform private.allow_admin_write();

  update public.admin_assignments
  set is_active = false,
      revoked_at = pg_catalog.clock_timestamp()
  where user_id = target_user
    and role = 'owner'
    and is_active;

  perform private.record_admin_event(actor, 'owner_revoked', target_user, null);
  return target_user;
end;
$$;

create or replace function public.grant_manager(target_user uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
  existing public.admin_assignments%rowtype;
  assignment_exists boolean := false;
begin
  actor := private.require_active_owner();
  perform private.lock_admin_changes();
  actor := private.require_active_owner();
  perform private.require_known_user(target_user);

  if target_user = actor then
    raise exception 'an owner cannot change their own role';
  end if;

  select * into existing
  from public.admin_assignments assignment
  where assignment.user_id = target_user;
  assignment_exists := found;

  if assignment_exists and existing.role = 'owner' then
    raise exception 'an owner cannot be granted manager access';
  end if;

  if assignment_exists and existing.is_active then
    raise exception 'manager access is already active';
  end if;

  perform private.allow_admin_write();

  if not assignment_exists then
    insert into public.admin_assignments (user_id, role, is_active, granted_by)
    values (target_user, 'manager', true, actor);

    perform private.record_admin_event(actor, 'manager_granted', target_user, null);
  else
    update public.admin_assignments
    set is_active = true,
        revoked_at = null,
        granted_by = actor,
        granted_at = pg_catalog.clock_timestamp()
    where user_id = target_user;

    perform private.record_admin_event(actor, 'manager_reactivated', target_user, null);
  end if;

  return target_user;
end;
$$;

create or replace function public.revoke_manager(target_user uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
begin
  actor := private.require_active_owner();
  perform private.lock_admin_changes();
  actor := private.require_active_owner();

  if not exists (
    select 1
    from public.admin_assignments assignment
    where assignment.user_id = target_user
      and assignment.role = 'manager'
      and assignment.is_active
  ) then
    raise exception 'manager access is not active';
  end if;

  perform private.allow_admin_write();

  update public.admin_assignments
  set is_active = false,
      revoked_at = pg_catalog.clock_timestamp()
  where user_id = target_user
    and role = 'manager'
    and is_active;

  update public.manager_branches
  set is_active = false,
      revoked_at = pg_catalog.clock_timestamp()
  where user_id = target_user
    and is_active;

  perform private.record_admin_event(actor, 'manager_revoked', target_user, null);
  return target_user;
end;
$$;

create or replace function private.require_active_manager(target_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1
    from public.admin_assignments assignment
    where assignment.user_id = target_user
      and assignment.role = 'manager'
      and assignment.is_active
  ) then
    raise exception 'manager access is not active';
  end if;
end;
$$;

create or replace function public.assign_manager_branch(
  target_user uuid,
  target_branch text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
  existing public.manager_branches%rowtype;
  membership_exists boolean := false;
begin
  actor := private.require_active_owner();
  perform private.lock_admin_changes();
  actor := private.require_active_owner();
  perform private.require_active_manager(target_user);

  if target_branch is null or not exists (
    select 1 from public.branches studio where studio.id = target_branch
  ) then
    raise exception 'unknown studio';
  end if;

  select * into existing
  from public.manager_branches membership
  where membership.user_id = target_user
    and membership.branch_id = target_branch;
  membership_exists := found;

  if membership_exists and existing.is_active then
    raise exception 'branch assignment is already active';
  end if;

  perform private.allow_admin_write();

  if not membership_exists then
    insert into public.manager_branches (
      user_id,
      branch_id,
      is_active,
      granted_by
    )
    values (target_user, target_branch, true, actor);

    perform private.record_admin_event(actor, 'branch_assigned', target_user, target_branch);
  else
    update public.manager_branches
    set is_active = true,
        revoked_at = null,
        granted_by = actor,
        granted_at = pg_catalog.clock_timestamp()
    where user_id = target_user
      and branch_id = target_branch;

    perform private.record_admin_event(actor, 'branch_reactivated', target_user, target_branch);
  end if;

  return target_user;
end;
$$;

create or replace function public.revoke_manager_branch(
  target_user uuid,
  target_branch text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
begin
  actor := private.require_active_owner();
  perform private.lock_admin_changes();
  actor := private.require_active_owner();

  if not exists (
    select 1
    from public.manager_branches membership
    where membership.user_id = target_user
      and membership.branch_id = target_branch
      and membership.is_active
  ) then
    raise exception 'branch assignment is not active';
  end if;

  perform private.allow_admin_write();

  update public.manager_branches
  set is_active = false,
      revoked_at = pg_catalog.clock_timestamp()
  where user_id = target_user
    and branch_id = target_branch
    and is_active;

  perform private.record_admin_event(actor, 'branch_revoked', target_user, target_branch);
  return target_user;
end;
$$;

alter table public.admin_assignments enable row level security;
alter table public.manager_branches enable row level security;
alter table public.admin_audit_events enable row level security;

revoke all on table
  public.admin_assignments,
  public.manager_branches,
  public.admin_audit_events
from public, anon, authenticated, service_role;

revoke all on function
  private.caller_id(),
  private.require_active_owner(),
  private.lock_admin_changes(),
  private.allow_admin_write(),
  private.record_admin_event(uuid, text, uuid, text),
  private.protect_admin_tables(),
  private.assert_bootstrap_operator(),
  private.provision_owner(uuid),
  private.require_known_user(uuid),
  private.require_active_manager(uuid)
from public, anon, authenticated, service_role;

revoke all on function
  public.admin_context(),
  public.manage_branch(text),
  public.grant_owner(uuid),
  public.revoke_owner(uuid),
  public.grant_manager(uuid),
  public.revoke_manager(uuid),
  public.assign_manager_branch(uuid, text),
  public.revoke_manager_branch(uuid, text)
from public, anon, authenticated, service_role;

grant execute on function public.admin_context() to authenticated;
grant execute on function public.manage_branch(text) to authenticated;
grant execute on function public.grant_owner(uuid) to authenticated;
grant execute on function public.revoke_owner(uuid) to authenticated;
grant execute on function public.grant_manager(uuid) to authenticated;
grant execute on function public.revoke_manager(uuid) to authenticated;
grant execute on function public.assign_manager_branch(uuid, text) to authenticated;
grant execute on function public.revoke_manager_branch(uuid, text) to authenticated;

do $$
declare
  fn regprocedure;
begin
  for fn in
    select pg_proc.oid::regprocedure
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'private'
      and pg_proc.proname in (
        'caller_id',
        'require_active_owner',
        'lock_admin_changes',
        'allow_admin_write',
        'record_admin_event',
        'protect_admin_tables',
        'assert_bootstrap_operator',
        'provision_owner',
        'require_known_user',
        'require_active_manager'
      )
  loop
    execute format('grant execute on function %s to %I', fn, current_user);
  end loop;
end $$;
