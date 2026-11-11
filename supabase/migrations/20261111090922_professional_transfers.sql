-- Professional transfers between Accra and Kumasi.
-- A transfer is not an active studio assignment. The source schedule stays
-- operational until the owner activates the transfer. Dates are Africa/Accra
-- calendar dates. This migration does not create bookings or move a professional
-- on page load.
--
-- Booking conflicts: private.transfer_booking_guard is the fail-closed boundary.
-- It does not read the obsolete booking foundation, does not look for appointment
-- tables by name, and does not treat a function signature as proof that bookings
-- were checked. See private.transfer_booking_readiness for the contract the
-- future booking migration must install. Until that row exists, activation fails
-- closed. This migration does not insert a local or production bypass.

do $$
begin
  if to_regclass('public.professional_weekly_schedules') is null
    or to_regclass('public.professional_schedule_exceptions') is null
    or to_regprocedure('private.lock_professional_writes()') is null
    or to_regprocedure('private.professional_studio(uuid)') is null
    or to_regprocedure('private.weekly_schedule_state(uuid)') is null
    or to_regprocedure('private.record_schedule_change(uuid,uuid,text,text,jsonb,jsonb)') is null
    or to_regprocedure('private.require_active_owner()') is null
  then
    raise exception 'professional transfers require professional scheduling';
  end if;
end
$$;

create or replace function private.ghana_today()
returns date
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select (pg_catalog.clock_timestamp() at time zone 'Africa/Accra')::date;
$$;

comment on function private.ghana_today() is
  'Calendar date in Africa/Accra. Transfer effective dates use this date, not the database session time zone.';

create table public.professional_transfers (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals (id),
  source_branch_id text not null references public.branches (id),
  destination_branch_id text not null references public.branches (id),
  effective_on date not null,
  status text not null check (
    status in ('draft', 'pending_preparation', 'ready', 'completed', 'cancelled')
  ),
  requested_by uuid not null references auth.users (id),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  activated_by uuid references auth.users (id),
  activated_at timestamptz,
  cancelled_by uuid references auth.users (id),
  cancelled_at timestamptz,
  cancellation_reason text,
  revision bigint not null check (revision >= 1),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint professional_transfer_studios_differ check (source_branch_id <> destination_branch_id),
  constraint professional_transfer_approval_shape check (
    (approved_by is null) = (approved_at is null)
    and (
      status in ('ready', 'completed') and approved_by is not null
      or status in ('draft', 'pending_preparation') and approved_by is null
      or status = 'cancelled'
    )
  ),
  constraint professional_transfer_activation_shape check (
    (status = 'completed' and activated_by is not null and activated_at is not null)
    or (status <> 'completed' and activated_by is null and activated_at is null)
  ),
  constraint professional_transfer_cancellation_shape check (
    (status = 'cancelled' and cancelled_by is not null and cancelled_at is not null)
    or (status <> 'cancelled' and cancelled_by is null and cancelled_at is null)
  ),
  constraint professional_transfer_reason_length check (
    cancellation_reason is null
    or (
      char_length(cancellation_reason) between 1 and 200
      and cancellation_reason !~ '[[:cntrl:]]'
    )
  )
);

comment on table public.professional_transfers is
  'A move between studios. Draft, pending, and ready rows are not active assignments. Completed and cancelled rows are terminal.';

create unique index professional_transfers_one_open
  on public.professional_transfers (professional_id)
  where status in ('draft', 'pending_preparation', 'ready');

create index professional_transfers_route
  on public.professional_transfers (source_branch_id, destination_branch_id, status);

create table public.professional_transfer_schedules (
  transfer_id uuid primary key references public.professional_transfers (id),
  off_weekday smallint not null check (off_weekday between 1 and 7),
  status text not null check (status in ('draft', 'complete')),
  revision bigint not null check (revision >= 1),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);

comment on table public.professional_transfer_schedules is
  'Destination week prepared before activation. It is not used for availability. off_weekday has no default.';

comment on column public.professional_transfer_schedules.off_weekday is
  'Manager-chosen destination off-day. 1 is Monday and 7 is Sunday.';

create table public.professional_transfer_intervals (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.professional_transfer_schedules (transfer_id),
  weekday smallint not null check (weekday between 1 and 7),
  kind text not null check (kind in ('shift', 'break')),
  starts_at time not null,
  ends_at time not null,
  check (ends_at > starts_at)
);

comment on table public.professional_transfer_intervals is
  'Destination shifts and breaks. Times are Africa/Accra wall-clock times. The off-day has none.';

create table public.professional_transfer_events (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.professional_transfers (id),
  professional_id uuid not null references public.professionals (id),
  actor_id uuid not null references auth.users (id),
  action text not null check (
    action in (
      'transfer_drafted',
      'transfer_updated',
      'transfer_submitted',
      'destination_schedule_saved',
      'transfer_approved',
      'transfer_cancelled',
      'transfer_activated'
    )
  ),
  previous_state jsonb,
  new_state jsonb,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

comment on table public.professional_transfer_events is
  'Append-only transfer history. Payloads contain studios, dates, schedule hours, and the booking-guard result. No credentials or biographies.';

create index professional_transfer_events_transfer
  on public.professional_transfer_events (transfer_id, created_at);

create table public.professional_schedule_archives (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null unique references public.professional_transfers (id),
  professional_id uuid not null references public.professionals (id),
  branch_id text not null references public.branches (id),
  schedule_state jsonb not null,
  archived_at timestamptz not null default pg_catalog.clock_timestamp(),
  archived_by uuid not null references auth.users (id)
);

comment on table public.professional_schedule_archives is
  'Immutable copy of the source week and its exceptions at activation. The operational schedule is replaced and old exceptions are not left active.';

create or replace function private.protect_transfer_tables()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  table_owner name;
begin
  if tg_table_name in ('professional_transfer_events', 'professional_schedule_archives')
    and tg_op <> 'INSERT'
  then
    raise exception 'audit events are append-only';
  end if;

  if tg_table_name = 'professional_transfers' and tg_op = 'DELETE' then
    raise exception 'a transfer cannot be deleted';
  end if;

  select pg_catalog.pg_get_userbyid(relowner) into table_owner
  from pg_catalog.pg_class
  where oid = tg_relid;

  if table_owner is distinct from current_user
    or pg_catalog.current_setting('allure.admin_write', true) is distinct from 'authorized'
  then
    raise exception 'professional records cannot be changed directly';
  end if;

  if tg_table_name = 'professional_transfers' and tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.professional_id is distinct from old.professional_id
      or new.source_branch_id is distinct from old.source_branch_id
      or new.requested_by is distinct from old.requested_by
      or new.created_at is distinct from old.created_at
    then
      raise exception 'a transfer identity cannot be changed';
    end if;
    if new.destination_branch_id is distinct from old.destination_branch_id
      and old.status is distinct from 'draft'
    then
      raise exception 'the destination studio can be changed only while the transfer is a draft';
    end if;
    if old.status in ('completed', 'cancelled') then
      raise exception 'a finished transfer cannot be changed';
    end if;
    if new.status is distinct from old.status and not (
      (old.status = 'draft' and new.status in ('pending_preparation', 'cancelled'))
      or (old.status = 'pending_preparation' and new.status in ('ready', 'cancelled'))
      or (old.status = 'ready' and new.status in ('pending_preparation', 'completed', 'cancelled'))
    ) then
      raise exception 'that transfer cannot move to the requested status';
    end if;
    new.updated_at := pg_catalog.clock_timestamp();
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function private.validate_transfer_schedule()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  working_day integer;
begin
  if exists (
    select 1
    from public.professional_transfer_intervals slot
    where slot.transfer_id = new.transfer_id
      and slot.weekday = new.off_weekday
  ) then
    raise exception 'the regular off-day has no working hours';
  end if;

  if new.status = 'complete' then
    for working_day in 1..7 loop
      if working_day <> new.off_weekday and not exists (
        select 1
        from public.professional_transfer_intervals slot
        where slot.transfer_id = new.transfer_id
          and slot.weekday = working_day
          and slot.kind = 'shift'
      ) then
        raise exception 'enter working hours for every working day';
      end if;
    end loop;
  end if;

  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

create or replace function private.validate_transfer_interval()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  off_day smallint;
begin
  select schedule.off_weekday into off_day
  from public.professional_transfer_schedules schedule
  where schedule.transfer_id = new.transfer_id;

  if off_day is null then
    raise exception 'choose a regular off-day';
  end if;
  if new.weekday = off_day then
    raise exception 'the regular off-day has no working hours';
  end if;
  if new.kind not in ('shift', 'break') or new.ends_at <= new.starts_at then
    raise exception 'enter valid working hours';
  end if;
  if exists (
    select 1
    from public.professional_transfer_intervals slot
    where slot.transfer_id = new.transfer_id
      and slot.weekday = new.weekday
      and slot.kind = new.kind
      and slot.id is distinct from new.id
      and slot.starts_at < new.ends_at
      and new.starts_at < slot.ends_at
  ) then
    raise exception 'working hours overlap';
  end if;
  if new.kind = 'break' and not exists (
    select 1
    from public.professional_transfer_intervals shift
    where shift.transfer_id = new.transfer_id
      and shift.weekday = new.weekday
      and shift.kind = 'shift'
      and new.starts_at >= shift.starts_at
      and new.ends_at <= shift.ends_at
  ) then
    raise exception 'a break must sit inside a shift';
  end if;
  return new;
end;
$$;

create trigger protect_professional_transfers
  before insert or update or delete on public.professional_transfers
  for each row execute function private.protect_transfer_tables();

create trigger protect_professional_transfer_schedules
  before insert or update or delete on public.professional_transfer_schedules
  for each row execute function private.protect_transfer_tables();

create trigger validate_professional_transfer_schedules
  before insert or update on public.professional_transfer_schedules
  for each row execute function private.validate_transfer_schedule();

create trigger protect_professional_transfer_intervals
  before insert or update or delete on public.professional_transfer_intervals
  for each row execute function private.protect_transfer_tables();

create trigger validate_professional_transfer_intervals
  before insert or update on public.professional_transfer_intervals
  for each row execute function private.validate_transfer_interval();

create trigger protect_professional_transfer_events
  before insert or update or delete on public.professional_transfer_events
  for each row execute function private.protect_transfer_tables();

create trigger protect_professional_schedule_archives
  before insert or update or delete on public.professional_schedule_archives
  for each row execute function private.protect_transfer_tables();

create table private.transfer_booking_readiness (
  singleton boolean primary key default true check (singleton),
  mode text not null check (mode in ('local_pre_booking', 'enforced')),
  integration_id text not null,
  approved_definition text not null,
  constraint transfer_booking_readiness_contract check (
    (
      mode = 'local_pre_booking'
      and integration_id = 'allure_local_pre_booking_v1'
      and approved_definition = 'local-pre-booking-no-ledger'
    )
    or (
      mode = 'enforced'
      and integration_id = 'allure_booking_conflict_v1'
      and approved_definition like '%allure_booking_ledger_query%'
    )
  )
);

comment on table private.transfer_booking_readiness is
  'Database-owned transfer activation contract. No row means activation fails closed. '
  'The only local fixture is mode local_pre_booking, integration_id allure_local_pre_booking_v1, '
  'approved_definition local-pre-booking-no-ledger. That fixture is not inserted here and must not '
  'be inserted by a migration applied to production. It returns local_pre_booking and does not check a ledger. '
  'The booking migration satisfies enforced mode by replacing private.transfer_booking_conflicts'
  '(uuid, text, text, date) as a security-definer function owned by the same role as '
  'private.transfer_booking_guard, with search_path starting at pg_catalog, containing the marker '
  'allure_booking_ledger_query, and returning one appointment_id per real ledger conflict. '
  'That migration then inserts the single row mode enforced, integration_id allure_booking_conflict_v1, '
  'approved_definition equal to pg_get_functiondef of the replaced function. Client parameters and '
  'API roles cannot insert or change this row.';

create or replace function private.protect_transfer_booking_readiness()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  table_owner name;
begin
  select pg_catalog.pg_get_userbyid(relowner) into table_owner
  from pg_catalog.pg_class
  where oid = tg_relid;
  if table_owner is distinct from current_user then
    raise exception 'booking readiness cannot be changed directly';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger protect_transfer_booking_readiness
  before insert or update or delete on private.transfer_booking_readiness
  for each row execute function private.protect_transfer_booking_readiness();

alter table private.transfer_booking_readiness enable row level security;

revoke all on table private.transfer_booking_readiness from public, anon, authenticated, service_role;

create or replace function private.transfer_booking_conflicts(
  person uuid,
  source_branch text,
  destination_branch text,
  effective_on date
)
returns table (appointment_id uuid)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'transfer activation is blocked until booking conflicts can be checked';
end;
$$;

comment on function private.transfer_booking_conflicts(uuid, text, text, date) is
  'Fixed booking integration point. This body fails closed. The booking migration replaces it with the reviewed ledger query and records that definition in private.transfer_booking_readiness. Do not satisfy the contract by creating another function name.';

create or replace function private.transfer_booking_guard(
  person uuid,
  source_branch text,
  destination_branch text,
  effective_on date
)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  readiness private.transfer_booking_readiness%rowtype;
  conflicts_oid oid;
  guard_owner oid;
  installed_owner oid;
  installed_definer boolean;
  installed_config text[];
  installed_definition text;
  conflict_count integer;
begin
  select ready.* into readiness
  from private.transfer_booking_readiness ready
  where ready.singleton
  for share;

  if readiness.mode = 'local_pre_booking'
    and readiness.integration_id = 'allure_local_pre_booking_v1'
    and readiness.approved_definition = 'local-pre-booking-no-ledger'
  then
    return 'local_pre_booking';
  end if;

  if readiness.mode is distinct from 'enforced'
    or readiness.integration_id is distinct from 'allure_booking_conflict_v1'
  then
    raise exception 'transfer activation is blocked until booking conflicts can be checked';
  end if;

  conflicts_oid := pg_catalog.to_regprocedure('private.transfer_booking_conflicts(uuid,text,text,date)');
  select proc.proowner into guard_owner
  from pg_catalog.pg_proc proc
  where proc.oid = 'private.transfer_booking_guard(uuid,text,text,date)'::regprocedure;

  if conflicts_oid is null then
    raise exception 'transfer activation is blocked until booking conflicts can be checked';
  end if;

  select proc.proowner, proc.prosecdef, proc.proconfig, pg_catalog.pg_get_functiondef(proc.oid)
  into installed_owner, installed_definer, installed_config, installed_definition
  from pg_catalog.pg_proc proc
  where proc.oid = conflicts_oid;

  if installed_definer is not true
    or installed_owner is distinct from guard_owner
    or installed_config is null
    or not exists (
      select 1
      from pg_catalog.unnest(installed_config) as setting
      where setting = 'search_path=pg_catalog'
        or setting like 'search_path=pg_catalog,%'
    )
    or installed_definition is distinct from readiness.approved_definition
    or position('allure_booking_ledger_query' in installed_definition) = 0
  then
    raise exception 'transfer activation is blocked until booking conflicts can be checked';
  end if;

  execute
    'select count(*) from private.transfer_booking_conflicts($1, $2, $3, $4)'
    into conflict_count
    using person, source_branch, destination_branch, effective_on;

  if coalesce(conflict_count, 0) > 0 then
    raise exception 'the transfer conflicts with an existing appointment';
  end if;

  return 'booking_conflicts_checked';
end;
$$;

comment on function private.transfer_booking_guard(uuid, text, text, date) is
  'Fail-closed booking boundary inside transfer activation. No readiness row fails closed. '
  'local_pre_booking is an explicit database fixture for local tests and returns local_pre_booking without reading a ledger. '
  'enforced mode calls only private.transfer_booking_conflicts(uuid,text,text,date) after its owner, security definer, search path, marker, and full definition match the readiness row. '
  'A matching signature alone is not enough. This function does not read the obsolete booking foundation.';

create or replace function private.record_transfer_event(
  target_transfer uuid,
  person uuid,
  actor uuid,
  event_action text,
  previous_state jsonb,
  new_state jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.professional_transfer_events (
    transfer_id, professional_id, actor_id, action, previous_state, new_state
  )
  values (target_transfer, person, actor, event_action, previous_state, new_state);
end;
$$;

create or replace function private.transfer_state(target_transfer uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select pg_catalog.jsonb_build_object(
    'status', transfer.status,
    'source_branch_id', transfer.source_branch_id,
    'destination_branch_id', transfer.destination_branch_id,
    'effective_on', transfer.effective_on,
    'revision', transfer.revision,
    'approved_at', transfer.approved_at,
    'activated_at', transfer.activated_at,
    'cancelled_at', transfer.cancelled_at
  )
  from public.professional_transfers transfer
  where transfer.id = target_transfer;
$$;

create or replace function private.transfer_schedule_state(target_transfer uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select pg_catalog.jsonb_build_object(
    'off_weekday', schedule.off_weekday,
    'status', schedule.status,
    'revision', schedule.revision,
    'shifts', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'weekday', slot.weekday,
        'starts', to_char(slot.starts_at, 'HH24:MI'),
        'ends', to_char(slot.ends_at, 'HH24:MI')
      ) order by slot.weekday, slot.starts_at)
      from public.professional_transfer_intervals slot
      where slot.transfer_id = schedule.transfer_id and slot.kind = 'shift'
    ), '[]'::jsonb),
    'breaks', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'weekday', slot.weekday,
        'starts', to_char(slot.starts_at, 'HH24:MI'),
        'ends', to_char(slot.ends_at, 'HH24:MI')
      ) order by slot.weekday, slot.starts_at)
      from public.professional_transfer_intervals slot
      where slot.transfer_id = schedule.transfer_id and slot.kind = 'break'
    ), '[]'::jsonb)
  )
  from public.professional_transfer_schedules schedule
  where schedule.transfer_id = target_transfer;
$$;

create or replace function private.require_transfer_actor(
  source_branch text,
  destination_branch text,
  needed text
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  caller_role text;
begin
  select assignment.role into caller_role
  from public.admin_assignments assignment
  where assignment.user_id = private.caller_id()
    and assignment.is_active;

  if caller_role = 'owner' then
    return 'owner';
  end if;

  if needed = 'destination' and exists (
    select 1 from public.admin_context() context
    where context.branch_id = destination_branch
  ) then
    return 'destination';
  end if;

  if needed = 'view' and exists (
    select 1 from public.admin_context() context
    where context.branch_id in (source_branch, destination_branch)
  ) then
    return 'view';
  end if;

  raise exception 'not authorized';
end;
$$;

create or replace function private.load_transfer(target_transfer uuid)
returns public.professional_transfers
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  found_row public.professional_transfers%rowtype;
  caller_role text;
begin
  select transfer.* into found_row
  from public.professional_transfers transfer
  where transfer.id = target_transfer;

  select assignment.role into caller_role
  from public.admin_assignments assignment
  where assignment.user_id = private.caller_id()
    and assignment.is_active;

  if found_row.id is null then
    if caller_role = 'owner' then
      raise exception 'that transfer does not exist';
    end if;
    raise exception 'not authorized';
  end if;

  return found_row;
end;
$$;

create or replace function public.admin_create_professional_transfer(
  target_professional uuid,
  destination_branch text,
  effective_on date
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
  source_branch text;
  created uuid;
  active_person boolean;
begin
  perform private.lock_professional_writes();
  actor := private.require_active_owner();
  if effective_on is null then
    raise exception 'choose an effective date';
  end if;
  perform public.manage_branch(destination_branch);

  select person.is_active into active_person
  from public.professionals person
  where person.id = target_professional;
  if active_person is null then
    raise exception 'professional does not exist';
  end if;
  if not active_person then
    raise exception 'an inactive professional cannot be transferred';
  end if;

  source_branch := private.professional_studio(target_professional);
  if source_branch = destination_branch then
    raise exception 'choose a different studio';
  end if;
  if exists (
    select 1 from public.professional_transfers transfer
    where transfer.professional_id = target_professional
      and transfer.status in ('draft', 'pending_preparation', 'ready')
  ) then
    raise exception 'that professional already has an open transfer';
  end if;

  perform private.allow_admin_write();
  begin
    insert into public.professional_transfers (
      professional_id, source_branch_id, destination_branch_id, effective_on,
      status, requested_by, revision
    )
    values (
      target_professional, source_branch, destination_branch, effective_on,
      'draft', actor, 1
    )
    returning id into created;
  exception
    when unique_violation then
      raise exception 'that professional already has an open transfer';
  end;

  perform private.record_transfer_event(
    created, target_professional, actor, 'transfer_drafted', null, private.transfer_state(created)
  );
  return created;
end;
$$;

create or replace function public.admin_update_professional_transfer(
  target_transfer uuid,
  destination_branch text,
  effective_on date,
  expected_revision bigint
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
  current_row public.professional_transfers%rowtype;
  previous_state jsonb;
begin
  perform private.lock_professional_writes();
  actor := private.require_active_owner();
  if effective_on is null then
    raise exception 'choose an effective date';
  end if;
  perform public.manage_branch(destination_branch);

  select transfer.* into current_row
  from public.professional_transfers transfer
  where transfer.id = target_transfer
  for update;
  if current_row.id is null then
    raise exception 'that transfer does not exist';
  end if;
  if expected_revision is null or current_row.revision is distinct from expected_revision then
    raise exception 'this transfer has changed since you opened it';
  end if;
  if current_row.status not in ('draft', 'pending_preparation', 'ready') then
    raise exception 'a finished transfer cannot be changed';
  end if;
  if destination_branch is distinct from current_row.destination_branch_id
    and current_row.status is distinct from 'draft'
  then
    raise exception 'the destination studio can be changed only while the transfer is a draft';
  end if;
  if destination_branch = current_row.source_branch_id then
    raise exception 'choose a different studio';
  end if;

  previous_state := private.transfer_state(target_transfer);
  perform private.allow_admin_write();
  update public.professional_transfers
  set destination_branch_id = destination_branch,
      effective_on = admin_update_professional_transfer.effective_on,
      status = case
        when current_row.status = 'ready'
          and admin_update_professional_transfer.effective_on is distinct from current_row.effective_on
        then 'pending_preparation'
        else status
      end,
      approved_by = case
        when current_row.status = 'ready'
          and admin_update_professional_transfer.effective_on is distinct from current_row.effective_on
        then null
        else approved_by
      end,
      approved_at = case
        when current_row.status = 'ready'
          and admin_update_professional_transfer.effective_on is distinct from current_row.effective_on
        then null
        else approved_at
      end,
      revision = expected_revision + 1
  where id = target_transfer;

  perform private.record_transfer_event(
    target_transfer, current_row.professional_id, actor, 'transfer_updated',
    previous_state, private.transfer_state(target_transfer)
  );
  return target_transfer;
end;
$$;

create or replace function public.admin_submit_professional_transfer(
  target_transfer uuid,
  expected_revision bigint
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
  current_row public.professional_transfers%rowtype;
  previous_state jsonb;
begin
  perform private.lock_professional_writes();
  actor := private.require_active_owner();
  select transfer.* into current_row
  from public.professional_transfers transfer
  where transfer.id = target_transfer
  for update;
  if current_row.id is null then
    raise exception 'that transfer does not exist';
  end if;
  if expected_revision is null or current_row.revision is distinct from expected_revision then
    raise exception 'this transfer has changed since you opened it';
  end if;
  if current_row.status is distinct from 'draft' then
    raise exception 'that transfer cannot move to the requested status';
  end if;

  previous_state := private.transfer_state(target_transfer);
  perform private.allow_admin_write();
  update public.professional_transfers
  set status = 'pending_preparation',
      revision = expected_revision + 1
  where id = target_transfer;
  perform private.record_transfer_event(
    target_transfer, current_row.professional_id, actor, 'transfer_submitted',
    previous_state, private.transfer_state(target_transfer)
  );
  return target_transfer;
end;
$$;

create or replace function public.admin_save_transfer_schedule(
  target_transfer uuid,
  off_day integer,
  schedule_status text,
  intervals jsonb,
  expected_revision bigint
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
  current_row public.professional_transfers%rowtype;
  schedule_revision bigint;
  previous_schedule jsonb;
  item jsonb;
  slot_weekday integer;
  slot_kind text;
  slot_start time;
  slot_end time;
begin
  perform private.lock_professional_writes();
  if private.caller_id() is null or not exists (select 1 from public.admin_context()) then
    raise exception 'not authorized';
  end if;
  if off_day is null or off_day < 1 or off_day > 7 then
    raise exception 'choose a regular off-day';
  end if;
  if schedule_status not in ('draft', 'complete') then
    raise exception 'choose draft or complete';
  end if;
  if jsonb_typeof(coalesce(intervals, '[]'::jsonb)) is distinct from 'array' then
    raise exception 'enter valid working hours';
  end if;
  if expected_revision is null or expected_revision < 0 then
    raise exception 'this schedule has changed since you opened it';
  end if;

  select transfer.* into current_row
  from public.professional_transfers transfer
  where transfer.id = target_transfer
  for update;
  if current_row.id is null then
    perform private.load_transfer(target_transfer);
  end if;
  perform private.require_transfer_actor(
    current_row.source_branch_id, current_row.destination_branch_id, 'destination'
  );
  if current_row.status not in ('pending_preparation', 'ready') then
    raise exception 'the destination schedule is not open for preparation';
  end if;

  select schedule.revision into schedule_revision
  from public.professional_transfer_schedules schedule
  where schedule.transfer_id = target_transfer
  for update;
  if not found then
    if expected_revision <> 0 then
      raise exception 'this schedule has changed since you opened it';
    end if;
  elsif schedule_revision is distinct from expected_revision then
    raise exception 'this schedule has changed since you opened it';
  end if;

  previous_schedule := private.transfer_schedule_state(target_transfer);
  perform private.allow_admin_write();
  delete from public.professional_transfer_intervals slot
  where slot.transfer_id = target_transfer;

  insert into public.professional_transfer_schedules (transfer_id, off_weekday, status, revision)
  values (target_transfer, off_day, 'draft', expected_revision + 1)
  on conflict (transfer_id) do update
  set off_weekday = excluded.off_weekday,
      status = 'draft',
      revision = excluded.revision;

  for item in
    select value
    from pg_catalog.jsonb_array_elements(intervals)
    order by case when value ->> 'kind' = 'shift' then 0 else 1 end, value ->> 'weekday'
  loop
    slot_kind := item ->> 'kind';
    if (item ->> 'weekday') !~ '^[1-7]$'
      or slot_kind not in ('shift', 'break')
      or (item ->> 'starts') !~ '^\d{2}:\d{2}$'
      or (item ->> 'ends') !~ '^\d{2}:\d{2}$'
    then
      raise exception 'enter valid working hours';
    end if;
    slot_weekday := (item ->> 'weekday')::integer;
    slot_start := (item ->> 'starts')::time;
    slot_end := (item ->> 'ends')::time;
    insert into public.professional_transfer_intervals (
      transfer_id, weekday, kind, starts_at, ends_at
    )
    values (target_transfer, slot_weekday, slot_kind, slot_start, slot_end);
  end loop;

  if schedule_status = 'complete' then
    update public.professional_transfer_schedules
    set status = 'complete'
    where transfer_id = target_transfer;
  end if;

  update public.professional_transfers transfer
  set status = case when current_row.status = 'ready' then 'pending_preparation' else transfer.status end,
      approved_by = case when current_row.status = 'ready' then null else transfer.approved_by end,
      approved_at = case when current_row.status = 'ready' then null else transfer.approved_at end,
      revision = current_row.revision + 1
  where transfer.id = target_transfer;

  perform private.record_transfer_event(
    target_transfer,
    current_row.professional_id,
    private.caller_id(),
    'destination_schedule_saved',
    previous_schedule,
    private.transfer_schedule_state(target_transfer)
  );
  return target_transfer;
end;
$$;

create or replace function public.admin_approve_professional_transfer(
  target_transfer uuid,
  expected_revision bigint
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
  current_row public.professional_transfers%rowtype;
  schedule_status text;
  previous_state jsonb;
begin
  perform private.lock_professional_writes();
  actor := private.require_active_owner();
  select transfer.* into current_row
  from public.professional_transfers transfer
  where transfer.id = target_transfer
  for update;
  if current_row.id is null then
    raise exception 'that transfer does not exist';
  end if;
  if expected_revision is null or current_row.revision is distinct from expected_revision then
    raise exception 'this transfer has changed since you opened it';
  end if;
  if current_row.status is distinct from 'pending_preparation' then
    raise exception 'that transfer cannot move to the requested status';
  end if;

  select schedule.status into schedule_status
  from public.professional_transfer_schedules schedule
  where schedule.transfer_id = target_transfer;
  if schedule_status is distinct from 'complete' then
    raise exception 'complete the destination schedule before approval';
  end if;

  previous_state := private.transfer_state(target_transfer);
  perform private.allow_admin_write();
  update public.professional_transfers
  set status = 'ready',
      approved_by = actor,
      approved_at = pg_catalog.clock_timestamp(),
      revision = expected_revision + 1
  where id = target_transfer;
  perform private.record_transfer_event(
    target_transfer, current_row.professional_id, actor, 'transfer_approved',
    previous_state, private.transfer_state(target_transfer)
  );
  return target_transfer;
end;
$$;

create or replace function public.admin_cancel_professional_transfer(
  target_transfer uuid,
  cancellation_reason text,
  expected_revision bigint
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
  current_row public.professional_transfers%rowtype;
  previous_state jsonb;
  reason text;
begin
  perform private.lock_professional_writes();
  actor := private.require_active_owner();
  reason := nullif(btrim(coalesce(cancellation_reason, '')), '');
  if reason is not null and (
    char_length(reason) > 200 or reason ~ '[[:cntrl:]]'
  ) then
    raise exception 'enter a shorter cancellation note';
  end if;

  select transfer.* into current_row
  from public.professional_transfers transfer
  where transfer.id = target_transfer
  for update;
  if current_row.id is null then
    raise exception 'that transfer does not exist';
  end if;
  if expected_revision is null or current_row.revision is distinct from expected_revision then
    raise exception 'this transfer has changed since you opened it';
  end if;
  if current_row.status not in ('draft', 'pending_preparation', 'ready') then
    raise exception 'a finished transfer cannot be changed';
  end if;

  previous_state := private.transfer_state(target_transfer);
  perform private.allow_admin_write();
  update public.professional_transfers
  set status = 'cancelled',
      cancelled_by = actor,
      cancelled_at = pg_catalog.clock_timestamp(),
      cancellation_reason = reason,
      revision = expected_revision + 1
  where id = target_transfer;
  perform private.record_transfer_event(
    target_transfer, current_row.professional_id, actor, 'transfer_cancelled',
    previous_state, private.transfer_state(target_transfer)
  );
  return target_transfer;
end;
$$;

create or replace function private.archive_operational_schedule(
  person uuid,
  target_transfer uuid,
  source_branch text,
  actor uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  archived uuid;
  snapshot jsonb;
begin
  snapshot := pg_catalog.jsonb_build_object(
    'week', private.weekly_schedule_state(person),
    'exceptions', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'kind', existing.kind,
        'date', existing.exception_date,
        'original_off_date', existing.original_off_date,
        'replacement_off_date', existing.replacement_off_date,
        'starts', to_char(existing.starts_at, 'HH24:MI'),
        'ends', to_char(existing.ends_at, 'HH24:MI')
      ) order by existing.created_at)
      from public.professional_schedule_exceptions existing
      where existing.professional_id = person
    ), '[]'::jsonb)
  );

  insert into public.professional_schedule_archives (
    transfer_id, professional_id, branch_id, schedule_state, archived_by
  )
  values (target_transfer, person, source_branch, snapshot, actor)
  returning id into archived;
  return archived;
end;
$$;

create or replace function private.install_destination_schedule(
  person uuid,
  target_transfer uuid,
  actor uuid,
  destination_branch text
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  destination public.professional_transfer_schedules%rowtype;
  previous_state jsonb;
  copied record;
begin
  select schedule.* into destination
  from public.professional_transfer_schedules schedule
  where schedule.transfer_id = target_transfer
  for update;
  if destination.status is distinct from 'complete' then
    raise exception 'complete the destination schedule before activation';
  end if;

  previous_state := private.weekly_schedule_state(person);
  perform private.allow_admin_write();

  delete from public.professional_schedule_exceptions existing
  where existing.professional_id = person and existing.kind = 'partial_absence';
  delete from public.professional_schedule_exceptions existing
  where existing.professional_id = person and existing.kind in ('additional_leave', 'special_hours');
  delete from public.professional_schedule_exceptions existing
  where existing.professional_id = person and existing.kind = 'off_day_work';
  delete from public.professional_schedule_exceptions existing
  where existing.professional_id = person and existing.kind = 'off_day_swap';

  delete from public.professional_weekly_intervals interval_row
  where interval_row.professional_id = person;

  insert into public.professional_weekly_schedules (professional_id, off_weekday, status, revision)
  values (person, destination.off_weekday, 'draft', 1)
  on conflict (professional_id) do update
  set off_weekday = excluded.off_weekday,
      status = 'draft',
      revision = public.professional_weekly_schedules.revision + 1;

  for copied in
    select interval_row.weekday, interval_row.kind, interval_row.starts_at, interval_row.ends_at
    from public.professional_transfer_intervals interval_row
    where interval_row.transfer_id = target_transfer
    order by case when interval_row.kind = 'shift' then 0 else 1 end, interval_row.weekday, interval_row.starts_at
  loop
    insert into public.professional_weekly_intervals (
      professional_id, weekday, kind, starts_at, ends_at
    )
    values (person, copied.weekday, copied.kind, copied.starts_at, copied.ends_at);
  end loop;

  update public.professional_weekly_schedules
  set status = 'complete'
  where professional_id = person;

  perform private.record_schedule_change(
    actor, person, destination_branch, 'weekly_schedule_saved',
    previous_state, private.weekly_schedule_state(person)
  );
end;
$$;

create or replace function public.admin_activate_professional_transfer(
  target_transfer uuid,
  expected_revision bigint
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
  current_row public.professional_transfers%rowtype;
  active_person boolean;
  active_branch text;
  archived uuid;
  booking_guard text;
  previous_state jsonb;
  ended_count integer;
begin
  perform private.lock_professional_writes();
  actor := private.require_active_owner();

  select transfer.* into current_row
  from public.professional_transfers transfer
  where transfer.id = target_transfer
  for update;
  if current_row.id is null then
    raise exception 'that transfer does not exist';
  end if;
  if expected_revision is null or current_row.revision is distinct from expected_revision then
    raise exception 'this transfer has changed since you opened it';
  end if;
  if current_row.status is distinct from 'ready' then
    raise exception 'approve the transfer before activation';
  end if;
  if current_row.effective_on > private.ghana_today() then
    raise exception 'a transfer cannot be activated before its effective date';
  end if;

  select person.is_active into active_person
  from public.professionals person
  where person.id = current_row.professional_id
  for update;
  if active_person is distinct from true then
    raise exception 'an inactive professional cannot be transferred';
  end if;

  select assignment.branch_id into active_branch
  from public.professional_branch_assignments assignment
  where assignment.professional_id = current_row.professional_id
    and assignment.is_active
  for update;
  if active_branch is distinct from current_row.source_branch_id then
    raise exception 'the professional is no longer assigned to the source studio';
  end if;
  if exists (
    select 1 from public.professional_transfers other
    where other.professional_id = current_row.professional_id
      and other.id is distinct from current_row.id
      and other.status in ('draft', 'pending_preparation', 'ready')
  ) then
    raise exception 'that professional already has an open transfer';
  end if;

  perform public.manage_branch(current_row.destination_branch_id);
  booking_guard := private.transfer_booking_guard(
    current_row.professional_id,
    current_row.source_branch_id,
    current_row.destination_branch_id,
    current_row.effective_on
  );

  previous_state := private.transfer_state(target_transfer);
  perform private.allow_admin_write();
  archived := private.archive_operational_schedule(
    current_row.professional_id, target_transfer, current_row.source_branch_id, actor
  );
  perform private.install_destination_schedule(
    current_row.professional_id, target_transfer, actor, current_row.destination_branch_id
  );

  update public.professional_branch_assignments
  set is_active = false,
      ended_on = private.ghana_today()
  where professional_id = current_row.professional_id
    and is_active
    and branch_id = current_row.source_branch_id;
  get diagnostics ended_count = row_count;
  if ended_count <> 1 then
    raise exception 'the professional is no longer assigned to the source studio';
  end if;

  insert into public.professional_branch_assignments (
    professional_id, branch_id, is_active, effective_on, assigned_by
  )
  values (
    current_row.professional_id,
    current_row.destination_branch_id,
    true,
    private.ghana_today(),
    actor
  );

  update public.professional_transfers
  set status = 'completed',
      activated_by = actor,
      activated_at = pg_catalog.clock_timestamp(),
      revision = expected_revision + 1
  where id = target_transfer;

  perform private.record_professional_event(
    actor, 'studio_assigned', current_row.professional_id, current_row.destination_branch_id, null
  );
  perform private.record_transfer_event(
    target_transfer,
    current_row.professional_id,
    actor,
    'transfer_activated',
    previous_state,
    private.transfer_state(target_transfer) || pg_catalog.jsonb_build_object(
      'booking_guard', booking_guard,
      'schedule_archive_id', archived
    )
  );
  return target_transfer;
end;
$$;

comment on function public.admin_activate_professional_transfer(uuid, bigint) is
  'Owner activation. Approval alone does not move the professional. The source assignment ends, public listing is cleared by the existing assignment trigger, and the destination schedule replaces the operational week. Old exceptions are archived and removed. The professional is not listed again.';

create or replace function public.admin_list_professional_transfers(target_branch text default null)
returns table (
  id uuid,
  professional_id uuid,
  source_branch_id text,
  destination_branch_id text,
  effective_on date,
  status text,
  revision bigint,
  cancellation_reason text,
  schedule_off_weekday smallint,
  schedule_status text,
  schedule_revision bigint,
  intervals jsonb,
  archived_schedule jsonb
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if private.caller_id() is null or not exists (select 1 from public.admin_context()) then
    raise exception 'not authorized';
  end if;
  if target_branch is not null then
    perform public.manage_branch(target_branch);
  end if;

  return query
  select
    transfer.id,
    transfer.professional_id,
    transfer.source_branch_id,
    transfer.destination_branch_id,
    transfer.effective_on,
    transfer.status,
    transfer.revision,
    transfer.cancellation_reason,
    schedule.off_weekday,
    schedule.status,
    schedule.revision,
    coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'weekday', slot.weekday,
        'kind', slot.kind,
        'starts', to_char(slot.starts_at, 'HH24:MI'),
        'ends', to_char(slot.ends_at, 'HH24:MI')
      ) order by slot.weekday, slot.kind, slot.starts_at)
      from public.professional_transfer_intervals slot
      where slot.transfer_id = transfer.id
    ), '[]'::jsonb),
    archive.schedule_state
  from public.professional_transfers transfer
  left join public.professional_transfer_schedules schedule
    on schedule.transfer_id = transfer.id
  left join public.professional_schedule_archives archive
    on archive.transfer_id = transfer.id
  where (
      transfer.source_branch_id in (select context.branch_id from public.admin_context() context)
      or transfer.destination_branch_id in (select context.branch_id from public.admin_context() context)
    )
    and (
      target_branch is null
      or transfer.source_branch_id = target_branch
      or transfer.destination_branch_id = target_branch
    )
  order by transfer.created_at desc;
end;
$$;

revoke all on function
  private.ghana_today(),
  private.protect_transfer_tables(),
  private.validate_transfer_schedule(),
  private.validate_transfer_interval(),
  private.transfer_booking_guard(uuid, text, text, date),
  private.transfer_booking_conflicts(uuid, text, text, date),
  private.protect_transfer_booking_readiness(),
  private.record_transfer_event(uuid, uuid, uuid, text, jsonb, jsonb),
  private.transfer_state(uuid),
  private.transfer_schedule_state(uuid),
  private.require_transfer_actor(text, text, text),
  private.load_transfer(uuid),
  private.archive_operational_schedule(uuid, uuid, text, uuid),
  private.install_destination_schedule(uuid, uuid, uuid, text)
from public, anon, authenticated, service_role;

revoke all on function
  public.admin_create_professional_transfer(uuid, text, date),
  public.admin_update_professional_transfer(uuid, text, date, bigint),
  public.admin_submit_professional_transfer(uuid, bigint),
  public.admin_save_transfer_schedule(uuid, integer, text, jsonb, bigint),
  public.admin_approve_professional_transfer(uuid, bigint),
  public.admin_cancel_professional_transfer(uuid, text, bigint),
  public.admin_activate_professional_transfer(uuid, bigint),
  public.admin_list_professional_transfers(text)
from public, anon, authenticated, service_role;

grant execute on function public.admin_create_professional_transfer(uuid, text, date) to authenticated;
grant execute on function public.admin_update_professional_transfer(uuid, text, date, bigint) to authenticated;
grant execute on function public.admin_submit_professional_transfer(uuid, bigint) to authenticated;
grant execute on function public.admin_save_transfer_schedule(uuid, integer, text, jsonb, bigint) to authenticated;
grant execute on function public.admin_approve_professional_transfer(uuid, bigint) to authenticated;
grant execute on function public.admin_cancel_professional_transfer(uuid, text, bigint) to authenticated;
grant execute on function public.admin_activate_professional_transfer(uuid, bigint) to authenticated;
grant execute on function public.admin_list_professional_transfers(text) to authenticated;

alter table public.professional_transfers enable row level security;
alter table public.professional_transfer_schedules enable row level security;
alter table public.professional_transfer_intervals enable row level security;
alter table public.professional_transfer_events enable row level security;
alter table public.professional_schedule_archives enable row level security;

revoke all on table
  public.professional_transfers,
  public.professional_transfer_schedules,
  public.professional_transfer_intervals,
  public.professional_transfer_events,
  public.professional_schedule_archives
from public, anon, authenticated, service_role;
