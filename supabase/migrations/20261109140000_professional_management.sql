-- Beauty professional records for Accra and Kumasi.
-- Depends on branch configuration, admin access, service management,
-- and 20261109130000_manager_management.sql.
-- Professionals are studio records, not Auth users.
-- This file does not schedule, transfer, book, or take payment.
-- It does not insert professionals.

do $$
begin
  if to_regclass('public.branches') is null
    or to_regclass('public.services') is null
    or to_regclass('public.admin_assignments') is null
    or to_regclass('public.manager_branches') is null
    or to_regclass('public.manager_provisions') is null
    or to_regprocedure('public.manage_branch(text)') is null
    or to_regprocedure('public.admin_deactivate_manager(uuid)') is null
    or to_regprocedure('public.admin_reactivate_manager(uuid, text)') is null
    or to_regprocedure('public.admin_finish_manager_provision(uuid)') is null
    or to_regprocedure('private.require_active_owner()') is null
    or to_regprocedure('private.allow_admin_write()') is null
    or to_regprocedure('private.caller_id()') is null
    or to_regprocedure('private.lock_admin_changes()') is null
    or to_regprocedure('private.normalize_image_ref(text)') is null
    or to_regprocedure('private.protect_admin_tables()') is null
  then
    raise exception 'professional management requires manager management, services, and image checks';
  end if;
end $$;

create table public.professionals (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  full_name text not null,
  display_name text,
  biography text,
  image_url text,
  is_active boolean not null default true,
  is_listed boolean not null default false,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint professionals_listed_requires_active check (not is_listed or is_active),
  constraint professionals_name_length check (char_length(full_name) between 2 and 80),
  constraint professionals_display_length check (
    display_name is null or char_length(display_name) between 2 and 80
  ),
  constraint professionals_biography_length check (
    biography is null or char_length(biography) <= 600
  )
);

comment on table public.professionals is
  'Beauty professionals. These rows are not Supabase Auth users and cannot sign in.';

create table public.professional_branch_assignments (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  professional_id uuid not null references public.professionals (id),
  branch_id text not null references public.branches (id),
  is_active boolean not null,
  effective_on date not null,
  assigned_at timestamptz not null default pg_catalog.clock_timestamp(),
  ended_on date,
  assigned_by uuid references auth.users (id),
  constraint professional_assignment_dates check (
    (is_active and ended_on is null)
    or (not is_active and ended_on is not null)
  )
);

comment on table public.professional_branch_assignments is
  'Studio assignment history. A professional has at most one active studio. History rows are not overwritten.';

create unique index professional_branch_assignments_one_active
  on public.professional_branch_assignments (professional_id)
  where is_active;

create index professional_branch_assignments_branch
  on public.professional_branch_assignments (branch_id)
  where is_active;

create table public.professional_service_qualifications (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  professional_id uuid not null references public.professionals (id),
  service_id text not null references public.services (id),
  is_active boolean not null,
  granted_at timestamptz not null default pg_catalog.clock_timestamp(),
  revoked_at timestamptz,
  granted_by uuid references auth.users (id),
  constraint professional_qualification_revoked check (
    (is_active and revoked_at is null)
    or (not is_active and revoked_at is not null)
  ),
  constraint professional_qualification_pair unique (professional_id, service_id)
);

comment on table public.professional_service_qualifications is
  'Services a professional can perform. A qualification does not make a service bookable or create a branch offering.';

create index professional_service_qualifications_service
  on public.professional_service_qualifications (service_id)
  where is_active;

create table public.professional_audit_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  actor_id uuid not null references auth.users (id),
  action text not null,
  professional_id uuid not null references public.professionals (id),
  branch_id text references public.branches (id),
  service_id text references public.services (id),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint professional_audit_action check (
    action in (
      'professional_created',
      'studio_assigned',
      'profile_updated',
      'qualification_added',
      'qualification_removed',
      'professional_activated',
      'professional_deactivated',
      'listing_enabled',
      'listing_disabled'
    )
  ),
  constraint professional_audit_branch check (branch_id is not null),
  constraint professional_audit_service check (
    (action in ('qualification_added', 'qualification_removed')) = (service_id is not null)
  )
);

comment on table public.professional_audit_events is
  'Append-only professional changes. Rows are never updated or deleted.';

create index professional_audit_events_professional
  on public.professional_audit_events (professional_id, created_at);

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

  if tg_table_name = 'professional_audit_events' and tg_op <> 'INSERT' then
    raise exception 'audit events are append-only';
  end if;

  if tg_table_name = 'manager_provisions' and tg_op = 'DELETE' then
    raise exception 'provision records cannot be deleted';
  end if;

  if tg_table_name in (
    'professionals',
    'professional_branch_assignments',
    'professional_service_qualifications'
  ) and tg_op = 'DELETE' then
    raise exception 'professional records cannot be deleted';
  end if;

  select pg_catalog.pg_get_userbyid(relowner) into table_owner
  from pg_catalog.pg_class
  where oid = tg_relid;

  if table_owner is distinct from current_user
    or pg_catalog.current_setting('allure.admin_write', true) is distinct from 'authorized'
  then
    if tg_table_name in (
      'professionals',
      'professional_branch_assignments',
      'professional_service_qualifications',
      'professional_audit_events'
    ) then
      raise exception 'professional records cannot be changed directly';
    end if;
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

  if tg_table_name = 'professionals' and tg_op in ('INSERT', 'UPDATE') then
    if tg_op = 'UPDATE' and (
      new.id is distinct from old.id or new.created_at is distinct from old.created_at
    ) then
      raise exception 'a professional identity cannot be changed';
    end if;
    if new.is_listed and not new.is_active then
      raise exception 'an inactive professional cannot be publicly listed';
    end if;
    if new.is_listed and not exists (
      select 1
      from public.professional_branch_assignments assignment
      where assignment.professional_id = new.id
        and assignment.is_active
    ) then
      raise exception 'a professional without an active studio cannot be publicly listed';
    end if;
    if tg_op = 'UPDATE' then
      new.updated_at := pg_catalog.clock_timestamp();
    end if;
  end if;

  if tg_table_name = 'professional_branch_assignments' and tg_op in ('INSERT', 'UPDATE') then
    if tg_op = 'UPDATE' and (
      new.id is distinct from old.id
      or new.professional_id is distinct from old.professional_id
      or new.branch_id is distinct from old.branch_id
    ) then
      raise exception 'a studio assignment cannot be rewritten';
    end if;
    if new.is_active then
      new.ended_on := null;
    elsif new.ended_on is null then
      new.ended_on := (pg_catalog.clock_timestamp() at time zone 'Africa/Accra')::date;
    end if;
    if tg_op = 'UPDATE' and old.is_active and not new.is_active then
      if exists (
        select 1
        from public.professionals person
        where person.id = new.professional_id
          and person.is_listed
      ) then
        if private.caller_id() is null then
          raise exception 'a public listing change requires an administrator';
        end if;
        update public.professionals
        set is_listed = false
        where id = new.professional_id
          and is_listed;
        perform private.record_professional_event(
          private.caller_id(),
          'listing_disabled',
          new.professional_id,
          new.branch_id,
          null
        );
      end if;
    end if;
  end if;

  if tg_table_name = 'professional_service_qualifications' and tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.professional_id is distinct from old.professional_id
      or new.service_id is distinct from old.service_id
    then
      raise exception 'a qualification cannot be rewritten';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger protect_professionals
  before insert or update or delete on public.professionals
  for each row
  execute function private.protect_admin_tables();

create trigger protect_professional_branch_assignments
  before insert or update or delete on public.professional_branch_assignments
  for each row
  execute function private.protect_admin_tables();

create trigger protect_professional_service_qualifications
  before insert or update or delete on public.professional_service_qualifications
  for each row
  execute function private.protect_admin_tables();

create trigger protect_professional_audit_events
  before insert or update or delete on public.professional_audit_events
  for each row
  execute function private.protect_admin_tables();

create or replace function private.lock_professional_changes()
returns void
language sql
volatile
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.pg_advisory_xact_lock(4811206104000);
$$;

create or replace function private.lock_professional_writes()
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, private
as $$
begin
  -- Staff administration uses 4811206103000. Take it first, then the
  -- professional lock, and only then recheck the caller. A revocation or
  -- studio move that commits first is visible to that recheck.
  perform private.lock_admin_changes();
  perform private.lock_professional_changes();
end;
$$;

comment on function private.lock_professional_writes() is
  'Serializes a professional write with staff changes. Lock 4811206103000, then 4811206104000.';

create or replace function private.clean_professional_text(
  value text,
  minimum integer,
  maximum integer,
  empty_message text
)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  cleaned text;
begin
  cleaned := nullif(btrim(coalesce(value, '')), '');
  if cleaned is null then
    if minimum = 0 then
      return null;
    end if;
    raise exception '%', empty_message;
  end if;

  if char_length(cleaned) < minimum
    or char_length(cleaned) > maximum
    or cleaned ~ '[[:cntrl:]]'
  then
    raise exception '%', empty_message;
  end if;

  return cleaned;
end;
$$;

create or replace function private.professional_studio(person uuid)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  studio text;
begin
  select assignment.branch_id into studio
  from public.professional_branch_assignments assignment
  where assignment.professional_id = person
    and assignment.is_active;

  if studio is not null then
    return studio;
  end if;

  if not exists (select 1 from public.professionals where id = person) then
    raise exception 'professional does not exist';
  end if;

  raise exception 'professional has no active studio';
end;
$$;

create or replace function private.record_professional_event(
  actor uuid,
  event_action text,
  person uuid,
  event_branch text,
  event_service text
)
returns void
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  insert into public.professional_audit_events (
    actor_id,
    action,
    professional_id,
    branch_id,
    service_id
  )
  values (actor, event_action, person, event_branch, event_service);
$$;

create or replace function public.admin_list_professionals(target_branch text default null)
returns table (
  id uuid,
  full_name text,
  display_name text,
  biography text,
  image_url text,
  is_active boolean,
  is_listed boolean,
  branch_id text,
  branch_name text,
  service_ids text[]
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if private.caller_id() is null then
    raise exception 'not authorized';
  end if;

  if target_branch is null then
    if not exists (select 1 from public.admin_context()) then
      raise exception 'not authorized';
    end if;
  else
    perform public.manage_branch(target_branch);
  end if;

  return query
  select
    person.id,
    person.full_name,
    person.display_name,
    person.biography,
    person.image_url,
    person.is_active,
    person.is_listed,
    studio.id,
    studio.name,
    coalesce(
      (
        select pg_catalog.array_agg(qualification.service_id order by qualification.service_id)
        from public.professional_service_qualifications qualification
        where qualification.professional_id = person.id
          and qualification.is_active
      ),
      '{}'::text[]
    )
  from public.professionals person
  join public.professional_branch_assignments assignment
    on assignment.professional_id = person.id
   and assignment.is_active
  join public.branches studio
    on studio.id = assignment.branch_id
  where (
      target_branch is null
      and assignment.branch_id in (select context.branch_id from public.admin_context() context)
    )
    or (
      target_branch is not null
      and assignment.branch_id = target_branch
    )
  order by studio.name, person.full_name;
end;
$$;

create or replace function public.admin_create_professional(
  professional_name text,
  professional_display text,
  professional_biography text,
  image_ref text,
  target_branch text,
  active boolean,
  listed boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
  person uuid;
  stored_name text;
  stored_display text;
  stored_biography text;
  stored_image text;
  wants_active boolean := coalesce(active, false);
  wants_listed boolean := coalesce(listed, false);
begin
  perform private.lock_professional_writes();
  actor := private.require_active_owner();
  perform public.manage_branch(target_branch);

  if wants_listed and not wants_active then
    raise exception 'an inactive professional cannot be publicly listed';
  end if;

  stored_name := private.clean_professional_text(professional_name, 2, 80, 'enter a professional name');
  stored_display := private.clean_professional_text(professional_display, 0, 80, 'enter a display name');
  if stored_display is not null and char_length(stored_display) < 2 then
    raise exception 'enter a display name';
  end if;
  stored_biography := private.clean_professional_text(professional_biography, 0, 600, 'enter a shorter biography');
  stored_image := private.normalize_image_ref(image_ref);

  perform private.allow_admin_write();

  insert into public.professionals (
    full_name,
    display_name,
    biography,
    image_url,
    is_active,
    is_listed
  )
  values (stored_name, stored_display, stored_biography, stored_image, wants_active, false)
  returning professionals.id into person;

  insert into public.professional_branch_assignments (
    professional_id,
    branch_id,
    is_active,
    effective_on,
    assigned_by
  )
  values (
    person,
    target_branch,
    true,
    (pg_catalog.clock_timestamp() at time zone 'Africa/Accra')::date,
    actor
  );

  if wants_listed then
    update public.professionals
    set is_listed = true
    where professionals.id = person;
  end if;

  perform private.record_professional_event(actor, 'professional_created', person, target_branch, null);
  perform private.record_professional_event(actor, 'studio_assigned', person, target_branch, null);
  if wants_listed then
    perform private.record_professional_event(actor, 'listing_enabled', person, target_branch, null);
  end if;

  return person;
end;
$$;

create or replace function public.admin_update_professional_profile(
  target_professional uuid,
  professional_name text,
  professional_display text,
  professional_biography text,
  image_ref text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
  studio text;
  stored_name text;
  stored_display text;
  stored_biography text;
  stored_image text;
  current_row public.professionals%rowtype;
begin
  perform private.lock_professional_writes();
  actor := private.caller_id();
  studio := private.professional_studio(target_professional);
  perform public.manage_branch(studio);

  stored_name := private.clean_professional_text(professional_name, 2, 80, 'enter a professional name');
  stored_display := private.clean_professional_text(professional_display, 0, 80, 'enter a display name');
  if stored_display is not null and char_length(stored_display) < 2 then
    raise exception 'enter a display name';
  end if;
  stored_biography := private.clean_professional_text(professional_biography, 0, 600, 'enter a shorter biography');
  stored_image := private.normalize_image_ref(image_ref);

  select person.* into current_row
  from public.professionals person
  where person.id = target_professional;

  if current_row.full_name is not distinct from stored_name
    and current_row.display_name is not distinct from stored_display
    and current_row.biography is not distinct from stored_biography
    and current_row.image_url is not distinct from stored_image
  then
    return target_professional;
  end if;

  perform private.allow_admin_write();

  update public.professionals
  set full_name = stored_name,
      display_name = stored_display,
      biography = stored_biography,
      image_url = stored_image
  where professionals.id = target_professional;

  perform private.record_professional_event(actor, 'profile_updated', target_professional, studio, null);
  return target_professional;
end;
$$;

create or replace function public.admin_set_professional_active(
  target_professional uuid,
  active boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
  studio text;
  current_active boolean;
  current_listed boolean;
  wants_active boolean := coalesce(active, false);
begin
  perform private.lock_professional_writes();
  actor := private.caller_id();
  studio := private.professional_studio(target_professional);
  perform public.manage_branch(studio);

  select person.is_active, person.is_listed
  into current_active, current_listed
  from public.professionals person
  where person.id = target_professional;

  if current_active = wants_active and (wants_active or not current_listed) then
    return target_professional;
  end if;

  perform private.allow_admin_write();

  update public.professionals
  set is_active = wants_active,
      is_listed = case when wants_active then is_listed else false end
  where professionals.id = target_professional;

  if wants_active then
    perform private.record_professional_event(
      actor,
      'professional_activated',
      target_professional,
      studio,
      null
    );
  else
    perform private.record_professional_event(
      actor,
      'professional_deactivated',
      target_professional,
      studio,
      null
    );
    if current_listed then
      perform private.record_professional_event(
        actor,
        'listing_disabled',
        target_professional,
        studio,
        null
      );
    end if;
  end if;

  return target_professional;
end;
$$;

create or replace function public.admin_set_professional_listed(
  target_professional uuid,
  listed boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
  studio text;
  current_active boolean;
  current_listed boolean;
  wants_listed boolean := coalesce(listed, false);
begin
  perform private.lock_professional_writes();
  actor := private.caller_id();
  studio := private.professional_studio(target_professional);
  perform public.manage_branch(studio);

  select person.is_active, person.is_listed
  into current_active, current_listed
  from public.professionals person
  where person.id = target_professional;

  if current_listed = wants_listed then
    return target_professional;
  end if;

  if wants_listed and not current_active then
    raise exception 'an inactive professional cannot be publicly listed';
  end if;

  perform private.allow_admin_write();

  update public.professionals
  set is_listed = wants_listed
  where professionals.id = target_professional;

  perform private.record_professional_event(
    actor,
    case when wants_listed then 'listing_enabled' else 'listing_disabled' end,
    target_professional,
    studio,
    null
  );

  return target_professional;
end;
$$;

create or replace function public.admin_add_professional_qualification(
  target_professional uuid,
  target_service text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
  studio text;
begin
  perform private.lock_professional_writes();
  actor := private.caller_id();
  studio := private.professional_studio(target_professional);
  perform public.manage_branch(studio);

  if not exists (select 1 from public.services service where service.id = target_service) then
    raise exception 'service does not exist';
  end if;

  if exists (
    select 1
    from public.professional_service_qualifications qualification
    where qualification.professional_id = target_professional
      and qualification.service_id = target_service
      and qualification.is_active
  ) then
    raise exception 'qualification is already active';
  end if;

  perform private.allow_admin_write();

  insert into public.professional_service_qualifications (
    professional_id,
    service_id,
    is_active,
    granted_by
  )
  values (target_professional, target_service, true, actor)
  on conflict (professional_id, service_id) do update
  set is_active = true,
      revoked_at = null,
      granted_at = pg_catalog.clock_timestamp(),
      granted_by = excluded.granted_by;

  perform private.record_professional_event(
    actor,
    'qualification_added',
    target_professional,
    studio,
    target_service
  );

  return target_professional;
end;
$$;

create or replace function public.admin_remove_professional_qualification(
  target_professional uuid,
  target_service text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
  studio text;
begin
  perform private.lock_professional_writes();
  actor := private.caller_id();
  studio := private.professional_studio(target_professional);
  perform public.manage_branch(studio);

  if not exists (
    select 1
    from public.professional_service_qualifications qualification
    where qualification.professional_id = target_professional
      and qualification.service_id = target_service
      and qualification.is_active
  ) then
    raise exception 'qualification is not active';
  end if;

  perform private.allow_admin_write();

  update public.professional_service_qualifications
  set is_active = false,
      revoked_at = pg_catalog.clock_timestamp()
  where professional_id = target_professional
    and service_id = target_service;

  perform private.record_professional_event(
    actor,
    'qualification_removed',
    target_professional,
    studio,
    target_service
  );

  return target_professional;
end;
$$;

create or replace function public.list_public_professionals(
  studio text default null,
  service_id text default null
)
returns table (
  id uuid,
  name text,
  biography text,
  image_url text,
  branch_id text,
  branch_name text,
  service_ids text[]
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    person.id,
    coalesce(nullif(btrim(person.display_name), ''), person.full_name),
    person.biography,
    person.image_url,
    branch.id,
    branch.name,
    coalesce(
      (
        select pg_catalog.array_agg(qualification.service_id order by qualification.service_id)
        from public.professional_service_qualifications qualification
        join public.services service
          on service.id = qualification.service_id
         and service.is_listed
        where qualification.professional_id = person.id
          and qualification.is_active
      ),
      '{}'::text[]
    )
  from public.professionals person
  join public.professional_branch_assignments assignment
    on assignment.professional_id = person.id
   and assignment.is_active
  join public.branches branch
    on branch.id = assignment.branch_id
  where person.is_active
    and person.is_listed
    and (studio is null or assignment.branch_id = studio)
    and (
      service_id is null
      or exists (
        select 1
        from public.professional_service_qualifications qualification
        join public.services service
          on service.id = qualification.service_id
         and service.is_listed
        where qualification.professional_id = person.id
          and qualification.service_id = list_public_professionals.service_id
          and qualification.is_active
      )
    )
  order by branch.name, 2;
$$;

comment on function public.list_public_professionals(text, text) is
  'Public names for active, listed professionals with one active studio. Qualification ids are limited to listed services. Listing is not bookability. Audit, actor, and login fields are omitted.';

alter table public.professionals enable row level security;
alter table public.professional_branch_assignments enable row level security;
alter table public.professional_service_qualifications enable row level security;
alter table public.professional_audit_events enable row level security;

revoke all on table
  public.professionals,
  public.professional_branch_assignments,
  public.professional_service_qualifications,
  public.professional_audit_events
from public, anon, authenticated, service_role;

revoke all on function
  private.lock_professional_changes(),
  private.lock_professional_writes(),
  private.clean_professional_text(text, integer, integer, text),
  private.professional_studio(uuid),
  private.record_professional_event(uuid, text, uuid, text, text)
from public, anon, authenticated, service_role;

revoke all on function
  public.admin_list_professionals(text),
  public.admin_create_professional(text, text, text, text, text, boolean, boolean),
  public.admin_update_professional_profile(uuid, text, text, text, text),
  public.admin_set_professional_active(uuid, boolean),
  public.admin_set_professional_listed(uuid, boolean),
  public.admin_add_professional_qualification(uuid, text),
  public.admin_remove_professional_qualification(uuid, text),
  public.list_public_professionals(text, text)
from public, anon, authenticated, service_role;

grant execute on function public.admin_list_professionals(text) to authenticated;
grant execute on function public.admin_create_professional(text, text, text, text, text, boolean, boolean) to authenticated;
grant execute on function public.admin_update_professional_profile(uuid, text, text, text, text) to authenticated;
grant execute on function public.admin_set_professional_active(uuid, boolean) to authenticated;
grant execute on function public.admin_set_professional_listed(uuid, boolean) to authenticated;
grant execute on function public.admin_add_professional_qualification(uuid, text) to authenticated;
grant execute on function public.admin_remove_professional_qualification(uuid, text) to authenticated;
grant execute on function public.list_public_professionals(text, text) to anon, authenticated;
