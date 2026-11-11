-- Professional weekly schedules. A completed week has exactly one regular
-- off-day, chosen by a branch manager or owner. Nothing in this migration
-- picks that day. Draft weeks are stored and are not availability.
-- Weekly clock times and exception dates are Africa/Accra local values.
-- A future appointment timestamp is (work_date + clock_time) AT TIME ZONE 'Africa/Accra'.
-- Bookings and studio transfers are not part of this migration.

do $$
begin
  if to_regclass('public.professionals') is null
    or to_regclass('public.professional_audit_events') is null
    or to_regprocedure('private.lock_professional_writes()') is null
    or to_regprocedure('private.professional_studio(uuid)') is null
    or to_regprocedure('private.record_professional_event(uuid, text, uuid, text, text)') is null
    or to_regprocedure('public.manage_branch(text)') is null
  then
    raise exception 'weekly schedules require professional management';
  end if;
end
$$;

create table public.professional_weekly_schedules (
  professional_id uuid primary key references public.professionals (id),
  off_weekday smallint not null check (off_weekday between 1 and 7),
  status text not null default 'draft' check (status in ('draft', 'complete')),
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);

comment on table public.professional_weekly_schedules is
  'Monday–Sunday template. off_weekday is the one regular off-day, ISO 1–7, with no default day.';

comment on column public.professional_weekly_schedules.off_weekday is
  'Manager-chosen regular off-day. 1 is Monday and 7 is Sunday. The database never fills this in.';

comment on column public.professional_weekly_schedules.revision is
  'Increments by one on each successful weekly save. A new schedule is saved only when the caller sends 0. A stale revision is rejected and changes nothing.';

create table public.professional_weekly_intervals (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_weekly_schedules (professional_id),
  weekday smallint not null check (weekday between 1 and 7),
  kind text not null check (kind in ('shift', 'break')),
  starts_at time not null,
  ends_at time not null,
  check (ends_at > starts_at)
);

comment on table public.professional_weekly_intervals is
  'Working shifts and breaks for the six regular working days. The regular off-day has none. starts_at and ends_at are Africa/Accra wall-clock times.';

comment on column public.professional_weekly_intervals.starts_at is
  'Africa/Accra wall-clock time. Convert an appointment with (work_date + starts_at) AT TIME ZONE ''Africa/Accra''.';

comment on column public.professional_weekly_intervals.ends_at is
  'Africa/Accra wall-clock time. Convert an appointment with (work_date + ends_at) AT TIME ZONE ''Africa/Accra''.';

create table public.professional_schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_weekly_schedules (professional_id),
  kind text not null check (
    kind in (
      'additional_leave',
      'off_day_swap',
      'special_hours',
      'partial_absence',
      'off_day_work'
    )
  ),
  exception_date date,
  original_off_date date,
  replacement_off_date date,
  starts_at time,
  ends_at time,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (
    (
      kind = 'additional_leave'
      and exception_date is not null
      and original_off_date is null
      and replacement_off_date is null
      and starts_at is null
      and ends_at is null
    )
    or (
      kind = 'off_day_swap'
      and exception_date is null
      and original_off_date is not null
      and replacement_off_date is not null
      and original_off_date <> replacement_off_date
      and starts_at is null
      and ends_at is null
    )
    or (
      kind in ('special_hours', 'partial_absence', 'off_day_work')
      and exception_date is not null
      and original_off_date is null
      and replacement_off_date is null
      and starts_at is not null
      and ends_at > starts_at
    )
  )
);

comment on table public.professional_schedule_exceptions is
  'Date-specific leave, swaps, hours, and absences. Dates are Africa/Accra calendar dates. A row never changes the recurring off-day.';

comment on column public.professional_schedule_exceptions.exception_date is
  'Africa/Accra calendar date. It is not interpreted in the browser time zone.';

comment on column public.professional_schedule_exceptions.starts_at is
  'Africa/Accra wall-clock time on exception_date.';

create table public.professional_schedule_changes (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals (id),
  branch_id text not null references public.branches (id),
  actor_id uuid not null references auth.users (id),
  change_type text not null check (
    change_type in (
      'weekly_schedule_saved',
      'schedule_exception_added',
      'schedule_exception_removed'
    )
  ),
  previous_state jsonb,
  new_state jsonb,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

comment on table public.professional_schedule_changes is
  'Append-only schedule history. Weekly rows store the previous and new off-day, status, shifts, breaks, and revision. Exception rows store the type, dates, and time window. No names or secrets.';

create index professional_schedule_changes_professional
  on public.professional_schedule_changes (professional_id, created_at);

create index professional_schedule_exceptions_professional
  on public.professional_schedule_exceptions (professional_id, kind);

alter table public.professional_audit_events
  drop constraint professional_audit_action;

alter table public.professional_audit_events
  add constraint professional_audit_action check (
    action in (
      'professional_created',
      'studio_assigned',
      'profile_updated',
      'qualification_added',
      'qualification_removed',
      'professional_activated',
      'professional_deactivated',
      'listing_enabled',
      'listing_disabled',
      'weekly_schedule_saved',
      'off_day_changed',
      'schedule_exception_added',
      'schedule_exception_removed'
    )
  );

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

  if tg_table_name = 'professional_schedule_changes' and tg_op <> 'INSERT' then
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

  if tg_table_name = 'professional_weekly_schedules' and tg_op = 'DELETE' then
    raise exception 'a weekly off-day cannot be deleted';
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
      'professional_audit_events',
      'professional_weekly_schedules',
      'professional_weekly_intervals',
      'professional_schedule_exceptions',
      'professional_schedule_changes'
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

  if tg_table_name = 'professional_weekly_schedules' and tg_op = 'UPDATE' then
    if new.professional_id is distinct from old.professional_id then
      raise exception 'a weekly schedule cannot be rewritten';
    end if;
  end if;

  if tg_table_name = 'professional_weekly_intervals' and tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.professional_id is distinct from old.professional_id
    then
      raise exception 'a weekly interval cannot be rewritten';
    end if;
  end if;

  if tg_table_name = 'professional_schedule_exceptions' and tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.professional_id is distinct from old.professional_id
      or new.created_at is distinct from old.created_at
    then
      raise exception 'a schedule exception cannot be rewritten';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function private.validate_weekly_schedule()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  working_day integer;
begin
  if tg_op = 'UPDATE'
    and new.off_weekday is distinct from old.off_weekday
    and exists (
      select 1
      from public.professional_schedule_exceptions swap
      where swap.professional_id = new.professional_id
        and swap.kind = 'off_day_swap'
    )
  then
    raise exception 'remove off-day swaps before changing the regular off-day';
  end if;

  if exists (
    select 1
    from public.professional_weekly_intervals slot
    where slot.professional_id = new.professional_id
      and slot.weekday = new.off_weekday
  ) then
    raise exception 'the regular off-day has no working hours';
  end if;

  if new.status = 'complete' then
    for working_day in 1..7 loop
      if working_day <> new.off_weekday and not exists (
        select 1
        from public.professional_weekly_intervals slot
        where slot.professional_id = new.professional_id
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

create or replace function private.validate_weekly_interval()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  off_day smallint;
begin
  select schedule.off_weekday into off_day
  from public.professional_weekly_schedules schedule
  where schedule.professional_id = new.professional_id;

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
    from public.professional_weekly_intervals slot
    where slot.professional_id = new.professional_id
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
    from public.professional_weekly_intervals shift
    where shift.professional_id = new.professional_id
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

create or replace function private.validate_schedule_exception()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  off_day smallint;
  day_number integer;
begin
  select schedule.off_weekday into off_day
  from public.professional_weekly_schedules schedule
  where schedule.professional_id = new.professional_id;

  if off_day is null then
    raise exception 'choose a regular off-day';
  end if;

  if new.kind = 'off_day_swap' then
    if new.original_off_date is null or new.replacement_off_date is null then
      raise exception 'choose both dates for an off-day swap';
    end if;
    if pg_catalog.date_trunc('week', new.original_off_date)
      is distinct from pg_catalog.date_trunc('week', new.replacement_off_date)
    then
      raise exception 'a swap must stay in the same week';
    end if;
    if pg_catalog.date_part('isodow', new.original_off_date)::integer is distinct from off_day
      or pg_catalog.date_part('isodow', new.replacement_off_date)::integer = off_day
    then
      raise exception 'a swap must move the regular off-day';
    end if;
    if exists (
      select 1
      from public.professional_schedule_exceptions existing
      where existing.professional_id = new.professional_id
        and existing.kind = 'off_day_swap'
        and existing.id is distinct from new.id
        and pg_catalog.date_trunc('week', existing.original_off_date)
          = pg_catalog.date_trunc('week', new.original_off_date)
    ) then
      raise exception 'that week already has an off-day swap';
    end if;
    if exists (
      select 1
      from public.professional_schedule_exceptions existing
      where existing.professional_id = new.professional_id
        and existing.id is distinct from new.id
        and existing.kind = 'off_day_work'
        and existing.exception_date = new.replacement_off_date
    ) then
      raise exception 'an off-day swap cannot remove both off-days';
    end if;
    if exists (
      select 1
      from public.professional_schedule_exceptions existing
      where existing.professional_id = new.professional_id
        and existing.id is distinct from new.id
        and (
          existing.exception_date in (new.original_off_date, new.replacement_off_date)
          or existing.original_off_date in (new.original_off_date, new.replacement_off_date)
          or existing.replacement_off_date in (new.original_off_date, new.replacement_off_date)
        )
    ) then
      raise exception 'an off-day swap conflicts with an exception on that date';
    end if;
    return new;
  end if;

  if new.exception_date is null then
    raise exception 'choose a date';
  end if;

  day_number := pg_catalog.date_part('isodow', new.exception_date)::integer;

  if new.kind = 'additional_leave' then
    if exists (
      select 1
      from public.professional_schedule_exceptions swap
      where swap.professional_id = new.professional_id
        and swap.kind = 'off_day_swap'
        and swap.replacement_off_date = new.exception_date
    ) or (
      day_number = off_day
      and not exists (
        select 1
        from public.professional_schedule_exceptions swap
        where swap.professional_id = new.professional_id
          and swap.kind = 'off_day_swap'
          and swap.original_off_date = new.exception_date
      )
    ) then
      raise exception 'that day is already off';
    end if;
    if exists (
      select 1
      from public.professional_schedule_exceptions existing
      where existing.professional_id = new.professional_id
        and existing.id is distinct from new.id
        and existing.exception_date = new.exception_date
        and existing.kind in ('special_hours', 'partial_absence', 'off_day_work')
    ) then
      raise exception 'additional leave cannot share that date with other exceptions';
    end if;
  elsif new.kind = 'off_day_work' then
    if new.starts_at is null or new.ends_at is null or new.ends_at <= new.starts_at then
      raise exception 'enter valid working hours';
    end if;
    if exists (
      select 1
      from public.professional_schedule_exceptions swap
      where swap.professional_id = new.professional_id
        and swap.kind = 'off_day_swap'
        and swap.replacement_off_date = new.exception_date
    ) then
      raise exception 'an off-day swap cannot remove both off-days';
    end if;
    if day_number is distinct from off_day or exists (
      select 1
      from public.professional_schedule_exceptions swap
      where swap.professional_id = new.professional_id
        and swap.kind = 'off_day_swap'
        and swap.original_off_date = new.exception_date
    ) then
      raise exception 'that day is already a working day';
    end if;
    if exists (
      select 1
      from public.professional_schedule_exceptions existing
      where existing.professional_id = new.professional_id
        and existing.id is distinct from new.id
        and existing.exception_date = new.exception_date
        and existing.kind = 'additional_leave'
    ) then
      raise exception 'additional leave cannot share that date with other exceptions';
    end if;
    if exists (
      select 1
      from public.professional_schedule_exceptions existing
      where existing.professional_id = new.professional_id
        and existing.id is distinct from new.id
        and existing.exception_date = new.exception_date
        and existing.kind = 'special_hours'
    ) then
      raise exception 'special hours cannot share that date with approved off-day work';
    end if;
  elsif new.kind = 'special_hours' then
    if new.starts_at is null or new.ends_at is null or new.ends_at <= new.starts_at then
      raise exception 'enter valid working hours';
    end if;
    if exists (
      select 1
      from public.professional_schedule_exceptions swap
      where swap.professional_id = new.professional_id
        and swap.kind = 'off_day_swap'
        and swap.replacement_off_date = new.exception_date
    ) then
      raise exception 'that day is already off';
    end if;
    if exists (
      select 1
      from public.professional_schedule_exceptions existing
      where existing.professional_id = new.professional_id
        and existing.id is distinct from new.id
        and existing.exception_date = new.exception_date
        and existing.kind = 'additional_leave'
    ) then
      raise exception 'additional leave cannot share that date with other exceptions';
    end if;
    if exists (
      select 1
      from public.professional_schedule_exceptions existing
      where existing.professional_id = new.professional_id
        and existing.id is distinct from new.id
        and existing.exception_date = new.exception_date
        and existing.kind = 'off_day_work'
    ) then
      raise exception 'special hours cannot share that date with approved off-day work';
    end if;
    if day_number = off_day and not exists (
      select 1
      from public.professional_schedule_exceptions swap
      where swap.professional_id = new.professional_id
        and swap.kind = 'off_day_swap'
        and swap.original_off_date = new.exception_date
    ) then
      raise exception 'working the off-day needs an explicit exception';
    end if;
  elsif new.kind = 'partial_absence' then
    if new.starts_at is null or new.ends_at is null or new.ends_at <= new.starts_at then
      raise exception 'enter valid working hours';
    end if;
    if exists (
      select 1
      from public.professional_schedule_exceptions swap
      where swap.professional_id = new.professional_id
        and swap.kind = 'off_day_swap'
        and swap.replacement_off_date = new.exception_date
    ) then
      raise exception 'that day is already off';
    end if;
    if day_number = off_day
      and not exists (
        select 1
        from public.professional_schedule_exceptions swap
        where swap.professional_id = new.professional_id
          and swap.kind = 'off_day_swap'
          and swap.original_off_date = new.exception_date
      )
      and not exists (
        select 1
        from public.professional_schedule_exceptions approved
        where approved.professional_id = new.professional_id
          and approved.kind = 'off_day_work'
          and approved.exception_date = new.exception_date
      )
    then
      raise exception 'working the off-day needs an explicit exception';
    end if;
    if exists (
      select 1
      from public.professional_schedule_exceptions existing
      where existing.professional_id = new.professional_id
        and existing.id is distinct from new.id
        and existing.exception_date = new.exception_date
        and existing.kind = 'additional_leave'
    ) then
      raise exception 'additional leave cannot share that date with other exceptions';
    end if;
  else
    raise exception 'choose an exception type';
  end if;

  if exists (
    select 1
    from public.professional_schedule_exceptions existing
    where existing.professional_id = new.professional_id
      and existing.kind = new.kind
      and existing.id is distinct from new.id
      and existing.exception_date is not distinct from new.exception_date
  ) then
    raise exception 'that date already has this exception';
  end if;

  return new;
end;
$$;

create or replace function private.validate_schedule_exception_removal()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if old.kind = 'off_day_swap' and exists (
    select 1
    from public.professional_schedule_exceptions leave
    where leave.professional_id = old.professional_id
      and leave.kind = 'additional_leave'
      and leave.exception_date = old.original_off_date
  ) then
    raise exception 'remove the additional leave before undoing this swap';
  end if;
  if old.kind = 'off_day_swap' and exists (
    select 1
    from public.professional_schedule_exceptions other
    where other.professional_id = old.professional_id
      and other.kind in ('special_hours', 'partial_absence')
      and other.exception_date = old.original_off_date
  ) then
    raise exception 'remove the other exception before undoing this swap';
  end if;
  if old.kind = 'off_day_work' and exists (
    select 1
    from public.professional_schedule_exceptions absence
    where absence.professional_id = old.professional_id
      and absence.kind = 'partial_absence'
      and absence.exception_date = old.exception_date
  ) then
    raise exception 'remove the partial absence before undoing approved off-day work';
  end if;
  return old;
end;
$$;

create trigger protect_professional_weekly_schedules
  before insert or update or delete on public.professional_weekly_schedules
  for each row
  execute function private.protect_admin_tables();

create trigger validate_professional_weekly_schedules
  before insert or update on public.professional_weekly_schedules
  for each row
  execute function private.validate_weekly_schedule();

create trigger protect_professional_weekly_intervals
  before insert or update or delete on public.professional_weekly_intervals
  for each row
  execute function private.protect_admin_tables();

create trigger validate_professional_weekly_intervals
  before insert or update on public.professional_weekly_intervals
  for each row
  execute function private.validate_weekly_interval();

create trigger protect_professional_schedule_exceptions
  before insert or update or delete on public.professional_schedule_exceptions
  for each row
  execute function private.protect_admin_tables();

create trigger protect_professional_schedule_changes
  before insert or update or delete on public.professional_schedule_changes
  for each row
  execute function private.protect_admin_tables();

create trigger validate_professional_schedule_exceptions
  before insert or update on public.professional_schedule_exceptions
  for each row
  execute function private.validate_schedule_exception();

create trigger validate_schedule_exception_removal
  before delete on public.professional_schedule_exceptions
  for each row
  execute function private.validate_schedule_exception_removal();

create or replace function private.professional_day_availability(
  person uuid,
  work_date date
)
returns table (
  availability text,
  starts_at time,
  ends_at time
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  off_day smallint;
  schedule_status text;
  day_number integer;
  source_weekday integer;
  swapped_to_work boolean := false;
  swapped_to_off boolean := false;
  worked_off_day boolean := false;
  leave_day boolean := false;
  special_start time;
  special_end time;
  absence_start time;
  absence_end time;
  starts time[] := array[]::time[];
  ends time[] := array[]::time[];
  next_starts time[] := array[]::time[];
  next_ends time[] := array[]::time[];
  cut_start time;
  cut_end time;
  index integer;
  slot record;
begin
  select schedule.off_weekday, schedule.status
  into off_day, schedule_status
  from public.professional_weekly_schedules schedule
  where schedule.professional_id = person;

  if off_day is null or schedule_status is distinct from 'complete' then
    availability := 'incomplete';
    starts_at := null;
    ends_at := null;
    return next;
    return;
  end if;

  day_number := pg_catalog.date_part('isodow', work_date)::integer;

  select true into swapped_to_work
  from public.professional_schedule_exceptions swap
  where swap.professional_id = person
    and swap.kind = 'off_day_swap'
    and swap.original_off_date = work_date
    and pg_catalog.date_part('isodow', swap.original_off_date)::integer = off_day;
  swapped_to_work := coalesce(swapped_to_work, false);

  select true into swapped_to_off
  from public.professional_schedule_exceptions swap
  where swap.professional_id = person
    and swap.kind = 'off_day_swap'
    and swap.replacement_off_date = work_date
    and pg_catalog.date_part('isodow', swap.original_off_date)::integer = off_day;
  swapped_to_off := coalesce(swapped_to_off, false);

  select true into leave_day
  from public.professional_schedule_exceptions leave
  where leave.professional_id = person
    and leave.kind = 'additional_leave'
    and leave.exception_date = work_date;
  leave_day := coalesce(leave_day, false);

  if leave_day and not swapped_to_off and (day_number <> off_day or swapped_to_work) then
    availability := 'additional_leave';
    starts_at := null;
    ends_at := null;
    return next;
    return;
  end if;

  if swapped_to_off or (day_number = off_day and not swapped_to_work) then
    select work.starts_at, work.ends_at
    into special_start, special_end
    from public.professional_schedule_exceptions work
    where work.professional_id = person
      and work.kind = 'off_day_work'
      and work.exception_date = work_date
      and day_number = off_day
      and not swapped_to_work
      and not swapped_to_off;

    if special_start is null then
      availability := case when swapped_to_off then 'swap_off' else 'regular_off' end;
      starts_at := null;
      ends_at := null;
      return next;
      return;
    end if;

    starts := array[special_start];
    ends := array[special_end];
    worked_off_day := true;
  else
    select hours.starts_at, hours.ends_at
    into special_start, special_end
    from public.professional_schedule_exceptions hours
    where hours.professional_id = person
      and hours.kind = 'special_hours'
      and hours.exception_date = work_date;

    if special_start is not null then
      starts := array[special_start];
      ends := array[special_end];
    else
      source_weekday := day_number;
      if swapped_to_work then
        select pg_catalog.date_part('isodow', swap.replacement_off_date)::integer
        into source_weekday
        from public.professional_schedule_exceptions swap
        where swap.professional_id = person
          and swap.kind = 'off_day_swap'
          and swap.original_off_date = work_date;
      end if;

      for slot in
        select shift.starts_at, shift.ends_at
        from public.professional_weekly_intervals shift
        where shift.professional_id = person
          and shift.weekday = source_weekday
          and shift.kind = 'shift'
        order by shift.starts_at
      loop
        starts := starts || slot.starts_at;
        ends := ends || slot.ends_at;
      end loop;

      for slot in
        select pause.starts_at, pause.ends_at
        from public.professional_weekly_intervals pause
        where pause.professional_id = person
          and pause.weekday = source_weekday
          and pause.kind = 'break'
        order by pause.starts_at
      loop
        next_starts := array[]::time[];
        next_ends := array[]::time[];
        for index in 1..coalesce(pg_catalog.array_length(starts, 1), 0) loop
          if ends[index] <= slot.starts_at or starts[index] >= slot.ends_at then
            next_starts := next_starts || starts[index];
            next_ends := next_ends || ends[index];
          else
            if starts[index] < slot.starts_at then
              next_starts := next_starts || starts[index];
              next_ends := next_ends || slot.starts_at;
            end if;
            if ends[index] > slot.ends_at then
              next_starts := next_starts || slot.ends_at;
              next_ends := next_ends || ends[index];
            end if;
          end if;
        end loop;
        starts := next_starts;
        ends := next_ends;
      end loop;
    end if;
  end if;

  select absence.starts_at, absence.ends_at
  into absence_start, absence_end
  from public.professional_schedule_exceptions absence
  where absence.professional_id = person
    and absence.kind = 'partial_absence'
    and absence.exception_date = work_date;

  if absence_start is not null then
    cut_start := absence_start;
    cut_end := absence_end;
    next_starts := array[]::time[];
    next_ends := array[]::time[];
    for index in 1..coalesce(pg_catalog.array_length(starts, 1), 0) loop
      if ends[index] <= cut_start or starts[index] >= cut_end then
        next_starts := next_starts || starts[index];
        next_ends := next_ends || ends[index];
      else
        if starts[index] < cut_start then
          next_starts := next_starts || starts[index];
          next_ends := next_ends || cut_start;
        end if;
        if ends[index] > cut_end then
          next_starts := next_starts || cut_end;
          next_ends := next_ends || ends[index];
        end if;
      end if;
    end loop;
    starts := next_starts;
    ends := next_ends;
  end if;

  if coalesce(pg_catalog.array_length(starts, 1), 0) = 0 then
    availability := case when absence_start is not null then 'partial_absence' else 'working' end;
    starts_at := null;
    ends_at := null;
    return next;
    return;
  end if;

  availability := case
    when absence_start is not null then 'partial_absence'
    when worked_off_day then 'off_day_work'
    else 'working'
  end;

  for index in 1..pg_catalog.array_length(starts, 1) loop
    starts_at := starts[index];
    ends_at := ends[index];
    return next;
  end loop;
end;
$$;

comment on function private.professional_day_availability(uuid, date) is
  'Effective day for one professional. work_date is an Africa/Accra calendar date and the returned times are Africa/Accra wall-clock times. An incomplete week returns incomplete and no working intervals. The regular off-day returns regular_off unless an explicit exception applies. Exceptions do not change the stored off-day.';

create or replace function private.schedule_studio(person uuid)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  studio text;
  caller_role text;
begin
  select assignment.role into caller_role
  from public.admin_assignments assignment
  where assignment.user_id = private.caller_id()
    and assignment.is_active;

  if caller_role = 'owner' then
    return private.professional_studio(person);
  end if;

  select branch.branch_id into studio
  from public.professional_branch_assignments branch
  where branch.professional_id = person
    and branch.is_active
    and branch.branch_id in (
      select context.branch_id from public.admin_context() context
    );

  if studio is null then
    raise exception 'not authorized';
  end if;

  return studio;
end;
$$;

comment on function private.schedule_studio(uuid) is
  'Studio for a schedule write. Owners receive the existing professional errors. A manager who cannot operate that studio receives not authorized, including when the professional does not exist.';

create or replace function private.weekly_schedule_state(person uuid)
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
    'shifts', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'weekday', slot.weekday,
            'starts', to_char(slot.starts_at, 'HH24:MI'),
            'ends', to_char(slot.ends_at, 'HH24:MI')
          )
          order by slot.weekday, slot.starts_at
        )
        from public.professional_weekly_intervals slot
        where slot.professional_id = schedule.professional_id
          and slot.kind = 'shift'
      ),
      '[]'::jsonb
    ),
    'breaks', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'weekday', slot.weekday,
            'starts', to_char(slot.starts_at, 'HH24:MI'),
            'ends', to_char(slot.ends_at, 'HH24:MI')
          )
          order by slot.weekday, slot.starts_at
        )
        from public.professional_weekly_intervals slot
        where slot.professional_id = schedule.professional_id
          and slot.kind = 'break'
      ),
      '[]'::jsonb
    )
  )
  from public.professional_weekly_schedules schedule
  where schedule.professional_id = person;
$$;

create or replace function private.exception_state(
  exception_kind text,
  work_date date,
  original_off date,
  replacement_off date,
  window_start time,
  window_end time
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select pg_catalog.jsonb_build_object(
    'kind', exception_kind,
    'date', work_date,
    'original_off_date', original_off,
    'replacement_off_date', replacement_off,
    'starts', to_char(window_start, 'HH24:MI'),
    'ends', to_char(window_end, 'HH24:MI')
  );
$$;

create or replace function private.record_schedule_change(
  actor uuid,
  person uuid,
  studio text,
  change_kind text,
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
  insert into public.professional_schedule_changes (
    professional_id,
    branch_id,
    actor_id,
    change_type,
    previous_state,
    new_state
  )
  values (person, studio, actor, change_kind, previous_state, new_state);
end;
$$;

create or replace function public.admin_save_weekly_schedule(
  target_professional uuid,
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
  studio text;
  previous smallint;
  current_revision bigint;
  previous_state jsonb;
  new_state jsonb;
  item jsonb;
  slot_weekday integer;
  slot_kind text;
  slot_start time;
  slot_end time;
begin
  perform private.lock_professional_writes();
  if private.caller_id() is null
    or not exists (select 1 from public.admin_context())
  then
    raise exception 'not authorized';
  end if;
  studio := private.schedule_studio(target_professional);
  perform public.manage_branch(studio);

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

  select schedule.off_weekday, schedule.revision
  into previous, current_revision
  from public.professional_weekly_schedules schedule
  where schedule.professional_id = target_professional
  for update;

  if not found then
    if expected_revision <> 0 then
      raise exception 'this schedule has changed since you opened it';
    end if;
  elsif current_revision is distinct from expected_revision then
    raise exception 'this schedule has changed since you opened it';
  end if;

  previous_state := private.weekly_schedule_state(target_professional);
  perform private.allow_admin_write();

  delete from public.professional_weekly_intervals slot
  where slot.professional_id = target_professional;

  insert into public.professional_weekly_schedules (
    professional_id, off_weekday, status, revision
  )
  values (target_professional, off_day, 'draft', expected_revision + 1)
  on conflict (professional_id) do update
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
    insert into public.professional_weekly_intervals (
      professional_id, weekday, kind, starts_at, ends_at
    )
    values (target_professional, slot_weekday, slot_kind, slot_start, slot_end);
  end loop;

  if schedule_status = 'complete' then
    update public.professional_weekly_schedules
    set status = 'complete'
    where professional_id = target_professional;
  end if;

  new_state := private.weekly_schedule_state(target_professional);
  perform private.record_schedule_change(
    private.caller_id(),
    target_professional,
    studio,
    'weekly_schedule_saved',
    previous_state,
    new_state
  );
  perform private.record_professional_event(
    private.caller_id(),
    'weekly_schedule_saved',
    target_professional,
    studio,
    null
  );
  if previous is null or previous is distinct from off_day then
    perform private.record_professional_event(
      private.caller_id(),
      'off_day_changed',
      target_professional,
      studio,
      null
    );
  end if;

  return target_professional;
end;
$$;

create or replace function public.admin_add_schedule_exception(
  target_professional uuid,
  exception_kind text,
  work_date date,
  original_off date,
  replacement_off date,
  window_start time,
  window_end time
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  studio text;
  created uuid;
  new_state jsonb;
begin
  perform private.lock_professional_writes();
  if private.caller_id() is null
    or not exists (select 1 from public.admin_context())
  then
    raise exception 'not authorized';
  end if;
  studio := private.schedule_studio(target_professional);
  perform public.manage_branch(studio);
  perform private.allow_admin_write();

  insert into public.professional_schedule_exceptions (
    professional_id,
    kind,
    exception_date,
    original_off_date,
    replacement_off_date,
    starts_at,
    ends_at
  )
  values (
    target_professional,
    exception_kind,
    work_date,
    original_off,
    replacement_off,
    window_start,
    window_end
  )
  returning id into created;

  new_state := private.exception_state(
    exception_kind,
    work_date,
    original_off,
    replacement_off,
    window_start,
    window_end
  );
  perform private.record_schedule_change(
    private.caller_id(),
    target_professional,
    studio,
    'schedule_exception_added',
    null,
    new_state
  );
  perform private.record_professional_event(
    private.caller_id(),
    'schedule_exception_added',
    target_professional,
    studio,
    null
  );
  return created;
end;
$$;

create or replace function public.admin_remove_schedule_exception(exception_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  studio text;
  person uuid;
  previous_state jsonb;
  removed public.professional_schedule_exceptions%rowtype;
begin
  perform private.lock_professional_writes();
  if private.caller_id() is null
    or not exists (select 1 from public.admin_context())
  then
    raise exception 'not authorized';
  end if;

  select existing.professional_id into person
  from public.professional_schedule_exceptions existing
  where existing.id = exception_id
  for update;

  if person is null then
    if exists (
      select 1
      from public.admin_assignments assignment
      where assignment.user_id = private.caller_id()
        and assignment.role = 'owner'
        and assignment.is_active
    ) then
      raise exception 'that exception does not exist';
    end if;
    raise exception 'not authorized';
  end if;

  studio := private.schedule_studio(person);
  perform public.manage_branch(studio);

  select existing.* into removed
  from public.professional_schedule_exceptions existing
  where existing.id = exception_id;
  previous_state := private.exception_state(
    removed.kind,
    removed.exception_date,
    removed.original_off_date,
    removed.replacement_off_date,
    removed.starts_at,
    removed.ends_at
  );

  perform private.allow_admin_write();

  delete from public.professional_schedule_exceptions existing
  where existing.id = exception_id;

  perform private.record_schedule_change(
    private.caller_id(),
    person,
    studio,
    'schedule_exception_removed',
    previous_state,
    null
  );
  perform private.record_professional_event(
    private.caller_id(),
    'schedule_exception_removed',
    person,
    studio,
    null
  );
  return person;
end;
$$;

create or replace function public.admin_list_weekly_schedules(target_branch text default null)
returns table (
  professional_id uuid,
  off_weekday smallint,
  status text,
  revision bigint,
  intervals jsonb,
  exceptions jsonb
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
    schedule.professional_id,
    schedule.off_weekday,
    schedule.status,
    schedule.revision,
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'weekday', slot.weekday,
            'kind', slot.kind,
            'starts', to_char(slot.starts_at, 'HH24:MI'),
            'ends', to_char(slot.ends_at, 'HH24:MI')
          )
          order by slot.weekday, slot.kind, slot.starts_at
        )
        from public.professional_weekly_intervals slot
        where slot.professional_id = schedule.professional_id
      ),
      '[]'::jsonb
    ),
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', existing.id,
            'kind', existing.kind,
            'date', existing.exception_date,
            'originalOffDate', existing.original_off_date,
            'replacementOffDate', existing.replacement_off_date,
            'starts', to_char(existing.starts_at, 'HH24:MI'),
            'ends', to_char(existing.ends_at, 'HH24:MI')
          )
          order by existing.created_at
        )
        from public.professional_schedule_exceptions existing
        where existing.professional_id = schedule.professional_id
      ),
      '[]'::jsonb
    )
  from public.professional_weekly_schedules schedule
  join public.professional_branch_assignments assignment
    on assignment.professional_id = schedule.professional_id
   and assignment.is_active
  where (
      target_branch is null
      and assignment.branch_id in (select context.branch_id from public.admin_context() context)
    )
    or (target_branch is not null and assignment.branch_id = target_branch)
  order by schedule.professional_id;
end;
$$;

create or replace function public.admin_professional_availability(
  target_professional uuid,
  work_date date
)
returns table (
  availability text,
  starts_at time,
  ends_at time
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  studio text;
begin
  if private.caller_id() is null
    or work_date is null
    or not exists (select 1 from public.admin_context())
  then
    raise exception 'not authorized';
  end if;
  studio := private.schedule_studio(target_professional);
  perform public.manage_branch(studio);
  return query
  select day.availability, day.starts_at, day.ends_at
  from private.professional_day_availability(target_professional, work_date) day;
end;
$$;

comment on function public.admin_professional_availability(uuid, date) is
  'Studio-scoped working intervals for one Africa/Accra calendar date. Returned times are Africa/Accra wall-clock times. Incomplete schedules return incomplete and are not customer availability. This does not create a booking.';

revoke all on function
  private.validate_weekly_schedule(),
  private.validate_weekly_interval(),
  private.validate_schedule_exception(),
  private.validate_schedule_exception_removal(),
  private.professional_day_availability(uuid, date),
  private.schedule_studio(uuid),
  private.weekly_schedule_state(uuid),
  private.exception_state(text, date, date, date, time, time),
  private.record_schedule_change(uuid, uuid, text, text, jsonb, jsonb)
from public, anon, authenticated, service_role;

revoke all on function
  public.admin_save_weekly_schedule(uuid, integer, text, jsonb, bigint),
  public.admin_add_schedule_exception(uuid, text, date, date, date, time, time),
  public.admin_remove_schedule_exception(uuid),
  public.admin_list_weekly_schedules(text),
  public.admin_professional_availability(uuid, date)
from public, anon, authenticated, service_role;

grant execute on function public.admin_save_weekly_schedule(uuid, integer, text, jsonb, bigint) to authenticated;
grant execute on function public.admin_add_schedule_exception(uuid, text, date, date, date, time, time) to authenticated;
grant execute on function public.admin_remove_schedule_exception(uuid) to authenticated;
grant execute on function public.admin_list_weekly_schedules(text) to authenticated;
grant execute on function public.admin_professional_availability(uuid, date) to authenticated;

alter table public.professional_weekly_schedules enable row level security;
alter table public.professional_weekly_intervals enable row level security;
alter table public.professional_schedule_exceptions enable row level security;
alter table public.professional_schedule_changes enable row level security;

revoke all on table
  public.professional_weekly_schedules,
  public.professional_weekly_intervals,
  public.professional_schedule_exceptions,
  public.professional_schedule_changes
from public, anon, authenticated, service_role;
