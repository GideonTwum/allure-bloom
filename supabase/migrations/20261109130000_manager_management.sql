-- Branch manager administration.
-- Depends on 20261106103000_admin_access.sql.
-- Sorts after the remote service-management version 20261109084046.
-- Not applied to the remote project.
-- Does not create professionals, schedules, transfers, or booking tables.
-- Does not modify an earlier migration file.

set search_path = public;

do $$
begin
  if to_regclass('public.admin_assignments') is null
    or to_regclass('public.manager_branches') is null
    or to_regclass('public.admin_audit_events') is null
    or to_regclass('public.branches') is null
    or to_regclass('auth.users') is null
  then
    raise exception 'admin access and branches must exist before manager management';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'users'
      and column_name = 'email'
  ) then
    raise exception 'auth.users.email is required before manager management';
  end if;

  if exists (
    select 1
    from public.manager_branches membership
    where membership.is_active
    group by membership.user_id
    having count(*) > 1
  ) then
    raise exception 'a manager already has more than one active studio';
  end if;
end $$;

create unique index manager_branches_one_active
  on public.manager_branches (user_id)
  where is_active;

comment on index public.manager_branches_one_active is
  'A manager has at most one active studio. Historical rows stay.';

alter table public.admin_audit_events
  drop constraint admin_audit_events_action,
  drop constraint admin_audit_events_branch;

alter table public.admin_audit_events
  add constraint admin_audit_events_action check (
    action in (
      'owner_provisioned',
      'owner_granted',
      'owner_revoked',
      'manager_granted',
      'manager_reactivated',
      'manager_revoked',
      'branch_assigned',
      'branch_reactivated',
      'branch_revoked',
      'provision_ready',
      'provision_failed',
      'provision_revoked'
    )
  ),
  add constraint admin_audit_events_branch check (
    (
      action in (
        'branch_assigned',
        'branch_reactivated',
        'branch_revoked',
        'provision_ready',
        'provision_failed'
      )
      and branch_id is not null
    )
    or (
      action not in (
        'branch_assigned',
        'branch_reactivated',
        'branch_revoked',
        'provision_ready',
        'provision_failed'
      )
      and branch_id is null
    )
  );

create table public.manager_provisions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  branch_id text not null references public.branches (id),
  invited_by uuid references auth.users (id) on delete set null,
  auth_user_id uuid references auth.users (id) on delete set null,
  status text not null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manager_provisions_email check (
    email = lower(email)
    and char_length(email) between 3 and 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+$'
  ),
  constraint manager_provisions_status check (
    status in (
      'auth_pending',
      'role_pending',
      'branch_pending',
      'ready',
      'revoked',
      'failed'
    )
  ),
  constraint manager_provisions_error check (
    last_error is null or char_length(last_error) between 1 and 160
  )
);

create unique index manager_provisions_email_key
  on public.manager_provisions (email);

comment on table public.manager_provisions is
  'Recoverable owner provisioning log. Auth invitation and these rows do not share one transaction.';

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

  if tg_table_name = 'manager_provisions' and tg_op = 'DELETE' then
    raise exception 'provision records cannot be deleted';
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

  if tg_table_name = 'manager_provisions' and tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.email is distinct from old.email
      or new.created_at is distinct from old.created_at
    then
      raise exception 'a provision identity cannot be changed';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger protect_manager_provisions
  before insert or update or delete on public.manager_provisions
  for each row
  execute function private.protect_admin_tables();

create or replace function private.normalize_manager_email(target_email text)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  normalized text;
begin
  normalized := lower(btrim(coalesce(target_email, '')));
  if char_length(normalized) < 3
    or char_length(normalized) > 254
    or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+$'
  then
    raise exception 'enter a valid email address';
  end if;
  return normalized;
end;
$$;

revoke all on function private.normalize_manager_email(text)
  from public, anon, authenticated, service_role;

create or replace function private.ensure_manager(target_user uuid)
returns void
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

  if assignment_exists and existing.role = 'manager' and existing.is_active then
    return;
  end if;

  if assignment_exists and existing.role = 'manager' and not existing.is_active then
    raise exception 'manager access is revoked';
  end if;

  perform private.allow_admin_write();

  insert into public.admin_assignments (user_id, role, is_active, granted_by)
  values (target_user, 'manager', true, actor);
  perform private.record_admin_event(actor, 'manager_granted', target_user, null);
end;
$$;

revoke all on function private.ensure_manager(uuid)
  from public, anon, authenticated, service_role;

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

  if exists (
    select 1
    from public.manager_branches membership
    where membership.user_id = target_user
      and membership.is_active
      and membership.branch_id is distinct from target_branch
  ) then
    raise exception 'manager already has an active studio';
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

create or replace function public.reassign_manager_branch(
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
  previous text;
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

  select membership.branch_id into previous
  from public.manager_branches membership
  where membership.user_id = target_user
    and membership.is_active;

  if previous is distinct from target_branch then
    perform private.allow_admin_write();

    if previous is not null then
      update public.manager_branches
      set is_active = false,
          revoked_at = pg_catalog.clock_timestamp()
      where user_id = target_user
        and branch_id = previous
        and is_active;
      perform private.record_admin_event(actor, 'branch_revoked', target_user, previous);
    end if;

    perform public.assign_manager_branch(target_user, target_branch);
  end if;

  perform private.allow_admin_write();
  update public.manager_provisions
  set branch_id = target_branch,
      updated_at = pg_catalog.clock_timestamp()
  where auth_user_id = target_user
    and status is distinct from 'revoked'
    and branch_id is distinct from target_branch;

  return target_user;
end;
$$;

comment on function public.reassign_manager_branch(uuid, text) is
  'Moves a manager to one studio in the same transaction. The previous membership stays as history.';

create or replace function public.admin_list_managers()
returns table (
  user_id uuid,
  email text,
  is_active boolean,
  branch_id text,
  branch_name text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
#variable_conflict use_column
begin
  perform private.require_active_owner();

  return query
  select
    assignment.user_id,
    account.email,
    assignment.is_active,
    membership.branch_id,
    studio.name
  from public.admin_assignments assignment
  join auth.users account on account.id = assignment.user_id
  left join public.manager_branches membership
    on membership.user_id = assignment.user_id
   and membership.is_active
  left join public.branches studio on studio.id = membership.branch_id
  where assignment.role = 'manager'
  order by account.email, assignment.user_id;
end;
$$;

create or replace function public.admin_list_manager_provisions()
returns table (
  id uuid,
  email text,
  branch_id text,
  status text,
  last_error text,
  auth_user_id uuid,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
#variable_conflict use_column
begin
  perform private.require_active_owner();

  return query
  select
    provision.id,
    provision.email,
    provision.branch_id,
    provision.status,
    provision.last_error,
    provision.auth_user_id,
    provision.updated_at
  from public.manager_provisions provision
  order by provision.updated_at desc, provision.email;
end;
$$;

create or replace function public.admin_lookup_manager_user(target_email text)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  normalized text;
  located uuid;
begin
  perform private.require_active_owner();
  normalized := private.normalize_manager_email(target_email);
  select account.id into located
  from auth.users account
  where lower(account.email) = normalized;
  return located;
end;
$$;

create or replace function public.admin_open_manager_provision(
  target_email text,
  target_branch text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
  normalized text;
  existing public.manager_provisions%rowtype;
  row_exists boolean := false;
  provision_id uuid;
  located uuid;
begin
  actor := private.require_active_owner();
  perform private.lock_admin_changes();
  actor := private.require_active_owner();
  normalized := private.normalize_manager_email(target_email);

  if target_branch is null or not exists (
    select 1 from public.branches studio where studio.id = target_branch
  ) then
    raise exception 'unknown studio';
  end if;

  select * into existing
  from public.manager_provisions provision
  where provision.email = normalized;
  row_exists := found;

  if row_exists and existing.status = 'revoked' then
    raise exception 'provision is revoked';
  end if;

  select account.id into located
  from auth.users account
  where lower(account.email) = normalized;

  if located is not null and exists (
    select 1
    from public.admin_assignments assignment
    where assignment.user_id = located
      and assignment.role = 'manager'
      and not assignment.is_active
  ) then
    raise exception 'manager access is revoked';
  end if;

  if row_exists and existing.status = 'ready' then
    return existing.id;
  end if;

  perform private.allow_admin_write();

  if not row_exists then
    insert into public.manager_provisions (email, branch_id, invited_by, status)
    values (normalized, target_branch, actor, 'auth_pending')
    returning id into provision_id;
    return provision_id;
  end if;

  update public.manager_provisions
  set branch_id = target_branch,
      status = case
        when existing.auth_user_id is null then 'auth_pending'
        else 'role_pending'
      end,
      last_error = null,
      invited_by = actor,
      updated_at = pg_catalog.clock_timestamp()
  where id = existing.id
    and status in ('auth_pending', 'role_pending', 'branch_pending', 'failed');

  return existing.id;
end;
$$;

create or replace function public.admin_attach_manager_provision(
  provision_id uuid,
  target_user uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
  provision public.manager_provisions%rowtype;
  account_email text;
begin
  actor := private.require_active_owner();
  perform private.lock_admin_changes();
  perform private.require_active_owner();
  perform private.require_known_user(target_user);

  select * into provision
  from public.manager_provisions
  where id = provision_id
  for update;

  if not found then
    raise exception 'provision does not exist';
  end if;

  if provision.status = 'revoked' then
    raise exception 'provision is revoked';
  end if;

  if exists (
    select 1
    from public.admin_assignments assignment
    where assignment.user_id = target_user
      and assignment.role = 'manager'
      and not assignment.is_active
  ) then
    raise exception 'manager access is revoked';
  end if;

  select lower(account.email) into account_email
  from auth.users account
  where account.id = target_user;

  if account_email is distinct from provision.email then
    raise exception 'the account email does not match';
  end if;

  if provision.status = 'ready' and provision.auth_user_id = target_user then
    return provision.id;
  end if;

  perform private.allow_admin_write();

  update public.manager_provisions
  set auth_user_id = target_user,
      status = 'role_pending',
      last_error = null,
      invited_by = actor,
      updated_at = pg_catalog.clock_timestamp()
  where id = provision.id;

  return provision.id;
end;
$$;

create or replace function public.admin_fail_manager_provision(
  provision_id uuid,
  reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
  provision public.manager_provisions%rowtype;
  safe_reason text;
begin
  actor := private.require_active_owner();
  perform private.lock_admin_changes();
  perform private.require_active_owner();
  safe_reason := left(btrim(coalesce(reason, '')), 160);

  if safe_reason = '' or safe_reason ~ '[[:cntrl:]]' or safe_reason ~* 'service_role|sb_secret|bearer ' then
    raise exception 'enter a provision error';
  end if;

  select * into provision
  from public.manager_provisions
  where id = provision_id
  for update;

  if not found then
    raise exception 'provision does not exist';
  end if;

  if provision.status in ('ready', 'revoked') then
    return provision.id;
  end if;

  perform private.allow_admin_write();

  update public.manager_provisions
  set status = 'failed',
      last_error = safe_reason,
      updated_at = pg_catalog.clock_timestamp()
  where id = provision.id;

  if provision.auth_user_id is not null then
    perform private.record_admin_event(
      actor,
      'provision_failed',
      provision.auth_user_id,
      provision.branch_id
    );
  end if;

  return provision.id;
end;
$$;

create or replace function public.admin_finish_manager_provision(provision_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
  provision public.manager_provisions%rowtype;
  current_branch text;
begin
  actor := private.require_active_owner();
  perform private.lock_admin_changes();
  actor := private.require_active_owner();

  select * into provision
  from public.manager_provisions
  where id = provision_id
  for update;

  if not found then
    raise exception 'provision does not exist';
  end if;

  if provision.status = 'revoked' then
    raise exception 'provision is revoked';
  end if;

  if exists (
    select 1
    from public.admin_assignments assignment
    where assignment.user_id = provision.auth_user_id
      and assignment.role = 'manager'
      and not assignment.is_active
  ) then
    raise exception 'manager access is revoked';
  end if;

  if provision.status = 'ready' then
    return provision.id;
  end if;

  if provision.auth_user_id is null then
    raise exception 'the account is not attached yet';
  end if;

  select membership.branch_id into current_branch
  from public.manager_branches membership
  where membership.user_id = provision.auth_user_id
    and membership.is_active;

  if current_branch is not null and current_branch is distinct from provision.branch_id then
    perform private.allow_admin_write();
    update public.manager_provisions
    set status = 'failed',
        last_error = 'manager already has an active studio',
        updated_at = pg_catalog.clock_timestamp()
    where id = provision.id;
    perform private.record_admin_event(
      actor,
      'provision_failed',
      provision.auth_user_id,
      provision.branch_id
    );
    return provision.id;
  end if;

  begin
    perform private.ensure_manager(provision.auth_user_id);

    if current_branch is null then
      perform public.assign_manager_branch(provision.auth_user_id, provision.branch_id);
    end if;
  exception
    when others then
      if sqlerrm in (
        'an owner cannot be granted manager access',
        'user does not exist',
        'an owner cannot change their own role'
      ) then
        perform private.allow_admin_write();
        update public.manager_provisions
        set status = 'failed',
          last_error = sqlerrm,
          updated_at = pg_catalog.clock_timestamp()
        where id = provision.id;
        perform private.record_admin_event(
          actor,
          'provision_failed',
          provision.auth_user_id,
          provision.branch_id
        );
        return provision.id;
      end if;
      raise;
  end;

  perform private.allow_admin_write();

  update public.manager_provisions
  set status = 'ready',
      last_error = null,
      updated_at = pg_catalog.clock_timestamp()
  where id = provision.id;

  perform private.record_admin_event(
    actor,
    'provision_ready',
    provision.auth_user_id,
    provision.branch_id
  );

  return provision.id;
end;
$$;

create or replace function public.admin_deactivate_manager(target_user uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
  changed integer;
begin
  actor := private.require_active_owner();
  perform private.lock_admin_changes();
  actor := private.require_active_owner();
  perform public.revoke_manager(target_user);
  perform private.allow_admin_write();

  update public.manager_provisions
  set status = 'revoked',
      last_error = null,
      updated_at = pg_catalog.clock_timestamp()
  where auth_user_id = target_user
    and status is distinct from 'revoked';

  get diagnostics changed = row_count;

  if changed > 0 then
    perform private.record_admin_event(actor, 'provision_revoked', target_user, null);
  end if;

  return target_user;
end;
$$;

create or replace function public.admin_reactivate_manager(
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
  existing public.admin_assignments%rowtype;
  assignment_exists boolean := false;
  current_branch text;
begin
  actor := private.require_active_owner();
  perform private.lock_admin_changes();
  actor := private.require_active_owner();
  perform private.require_known_user(target_user);

  if target_user = actor then
    raise exception 'an owner cannot change their own role';
  end if;

  if target_branch is null or not exists (
    select 1 from public.branches studio where studio.id = target_branch
  ) then
    raise exception 'unknown studio';
  end if;

  select * into existing
  from public.admin_assignments assignment
  where assignment.user_id = target_user;
  assignment_exists := found;

  if not assignment_exists or existing.role is distinct from 'manager' then
    raise exception 'manager access is not active';
  end if;

  select membership.branch_id into current_branch
  from public.manager_branches membership
  where membership.user_id = target_user
    and membership.is_active;

  if current_branch is not null and current_branch is distinct from target_branch then
    raise exception 'manager already has an active studio';
  end if;

  if not existing.is_active then
    perform private.allow_admin_write();
    update public.admin_assignments
    set is_active = true,
        revoked_at = null,
        granted_by = actor,
        granted_at = pg_catalog.clock_timestamp()
    where user_id = target_user
      and role = 'manager';
    perform private.record_admin_event(actor, 'manager_reactivated', target_user, null);
  end if;

  if current_branch is null then
    perform public.assign_manager_branch(target_user, target_branch);
  end if;

  perform private.allow_admin_write();

  update public.manager_provisions
  set branch_id = target_branch,
      status = 'ready',
      last_error = null,
      updated_at = pg_catalog.clock_timestamp()
  where auth_user_id = target_user;

  return target_user;
end;
$$;

alter table public.manager_provisions enable row level security;

revoke all on table public.manager_provisions from public, anon, authenticated, service_role;

revoke all on function
  public.reassign_manager_branch(uuid, text),
  public.admin_list_managers(),
  public.admin_list_manager_provisions(),
  public.admin_lookup_manager_user(text),
  public.admin_open_manager_provision(text, text),
  public.admin_attach_manager_provision(uuid, uuid),
  public.admin_fail_manager_provision(uuid, text),
  public.admin_finish_manager_provision(uuid),
  public.admin_deactivate_manager(uuid),
  public.admin_reactivate_manager(uuid, text)
from public, anon, authenticated, service_role;

grant execute on function public.reassign_manager_branch(uuid, text) to authenticated;
grant execute on function public.admin_list_managers() to authenticated;
grant execute on function public.admin_list_manager_provisions() to authenticated;
grant execute on function public.admin_lookup_manager_user(text) to authenticated;
grant execute on function public.admin_open_manager_provision(text, text) to authenticated;
grant execute on function public.admin_attach_manager_provision(uuid, uuid) to authenticated;
grant execute on function public.admin_fail_manager_provision(uuid, text) to authenticated;
grant execute on function public.admin_finish_manager_provision(uuid) to authenticated;
grant execute on function public.admin_deactivate_manager(uuid) to authenticated;
grant execute on function public.admin_reactivate_manager(uuid, text) to authenticated;
