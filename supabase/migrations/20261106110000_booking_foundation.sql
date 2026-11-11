-- Booking foundation. Depends on 20261106100000_branch_configuration.sql.
-- Reviewed for appointment integrity, payment verification, and least privilege.
-- Not deployed to the remote project.
-- No professionals, schedules, customers, prices, or appointments are inserted.
-- Private functions are not part of the exposed API. Do not add schema private
-- to the API schema list.
-- Home payment confirmation is installed disabled. A payment reference is not
-- stored and is never treated as proof of payment.
-- payment_verifier connects through the Postgres protocol only. It is not a
-- Supabase Data API role and is never granted to authenticator.

set search_path = public, extensions;

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

create schema if not exists private;

revoke all on schema private from public;
revoke create on schema public from public;

comment on schema private is
  'Privileged booking logic. Not an exposed API schema.';

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')
    or not exists (select 1 from pg_roles where rolname = 'authenticated')
    or not exists (select 1 from pg_roles where rolname = 'service_role')
  then
    raise exception 'anon, authenticated, and service_role must exist before this migration';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'payment_verifier') then
    create role payment_verifier noinherit login;
  else
    alter role payment_verifier noinherit login;
  end if;
end $$;

comment on role payment_verifier is
  'Postgres-protocol role for a future payment server. No password is stored here. Do not grant it to authenticator, and do not use it as a Data API JWT role. Payment confirmation stays disabled.';

do $$
begin
  execute format('grant connect on database %I to payment_verifier', current_database());

  if exists (select 1 from pg_roles where rolname = 'authenticator')
    and exists (
      select 1
      from pg_auth_members membership
      join pg_roles granted on granted.oid = membership.roleid
      join pg_roles member on member.oid = membership.member
      where granted.rolname = 'payment_verifier'
        and member.rolname = 'authenticator'
    )
  then
    revoke payment_verifier from authenticator;
  end if;
end $$;

create table public.booking_policies (
  visit_type text primary key,
  lead_time_hours integer not null,
  cancellation_cutoff_hours integer not null,
  confirmation_mode text not null,
  payment_timing text not null,
  constraint booking_policies_visit_type
    check (visit_type in ('walk-in', 'home')),
  constraint booking_policies_lead_time
    check (lead_time_hours >= 24),
  constraint booking_policies_cutoff
    check (cancellation_cutoff_hours >= 0),
  constraint booking_policies_confirmation
    check (confirmation_mode in ('server_validated', 'approval_then_verified_payment')),
  constraint booking_policies_payment
    check (payment_timing in ('at_studio', 'online_after_approval'))
);

insert into public.booking_policies (
  visit_type,
  lead_time_hours,
  cancellation_cutoff_hours,
  confirmation_mode,
  payment_timing
)
values
  ('walk-in', 24, 12, 'server_validated', 'at_studio'),
  ('home', 24, 24, 'approval_then_verified_payment', 'online_after_approval');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  is_active boolean not null default false,
  is_listed boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.professional_branches (
  professional_id uuid not null references public.professionals (id) on delete cascade,
  branch_id text not null references public.branches (id),
  primary key (professional_id, branch_id)
);

create table public.professional_services (
  professional_id uuid not null references public.professionals (id) on delete cascade,
  branch_id text not null,
  service_id text not null,
  primary key (professional_id, branch_id, service_id),
  foreign key (professional_id, branch_id)
    references public.professional_branches (professional_id, branch_id),
  foreign key (branch_id, service_id)
    references public.branch_services (branch_id, service_id)
);

create index professional_services_offering_idx
  on public.professional_services (branch_id, service_id);

create table public.professional_schedules (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null,
  branch_id text not null,
  weekday smallint not null,
  start_time time not null,
  end_time time not null,
  effective_from date not null,
  effective_until date,
  foreign key (professional_id, branch_id)
    references public.professional_branches (professional_id, branch_id),
  constraint professional_schedules_weekday
    check (weekday between 0 and 6),
  constraint professional_schedules_day_part
    check (end_time > start_time),
  constraint professional_schedules_effective
    check (effective_until is null or effective_until >= effective_from)
);

comment on table public.professional_schedules is
  'Private working hours in Africa/Accra wall time. Not a published opening-hours table.';

create table public.professional_unavailability (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  constraint professional_unavailability_range
    check (ends_at > starts_at)
);

create index professional_unavailability_span_idx
  on public.professional_unavailability (professional_id, starts_at, ends_at);

create table public.studio_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null,
  professional_id uuid references public.professionals (id),
  created_at timestamptz not null default now(),
  constraint studio_roles_role check (role in ('admin', 'professional'))
);

comment on table public.studio_roles is
  'Staff authorization source. JWT user_metadata is never consulted.';

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id),
  visit_type text not null,
  branch_id text not null,
  service_id text not null,
  professional_id uuid references public.professionals (id),
  preferred_professional_id uuid references public.professionals (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  price_ghs integer,
  duration_minutes integer,
  buffer_minutes integer,
  hold_expires_at timestamptz,
  status text not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (branch_id, service_id)
    references public.branch_services (branch_id, service_id),
  constraint appointments_visit_type
    check (visit_type in ('walk-in', 'home')),
  constraint appointments_status
    check (status in ('requested', 'held', 'confirmed', 'cancelled')),
  constraint appointments_time_range
    check (ends_at > starts_at),
  constraint appointments_price_nonnegative
    check (price_ghs is null or price_ghs >= 0),
  constraint appointments_duration_positive
    check (duration_minutes is null or duration_minutes > 0),
  constraint appointments_buffer_nonnegative
    check (buffer_minutes is null or buffer_minutes >= 0),
  constraint appointments_assignment_required
    check (status not in ('held', 'confirmed') or professional_id is not null),
  constraint appointments_confirmed_facts
    check (
      status <> 'confirmed'
      or (
        professional_id is not null
        and confirmed_at is not null
        and price_ghs is not null
        and duration_minutes is not null
        and buffer_minutes is not null
      )
    ),
  constraint appointments_hold_expiry
    check (status <> 'held' or hold_expires_at is not null)
);

comment on table public.appointments is
  'Requested rows do not hold a professional. A held home-service row reserves one until the visit starts. Confirmed rows remain reserved.';

comment on column public.appointments.hold_expires_at is
  'A home-service hold blocks the professional until this time. It is the visit start, so approval cannot outlive the visit.';

create index appointments_customer_idx
  on public.appointments (customer_id, starts_at);

create index appointments_branch_idx
  on public.appointments (branch_id, starts_at);

alter table public.appointments
  add constraint appointments_no_double_booking
  exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status in ('held', 'confirmed'));

create table public.home_service_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id),
  branch_id text not null,
  service_id text not null,
  preferred_professional_id uuid references public.professionals (id),
  address text not null,
  landmark text not null,
  ghana_post_gps text,
  notes text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  coverage_confirmed boolean not null default false,
  status text not null,
  payment_state text not null default 'not_requested',
  appointment_id uuid unique references public.appointments (id),
  approved_at timestamptz,
  payment_verified_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (branch_id, service_id)
    references public.branch_services (branch_id, service_id),
  constraint home_service_requests_address
    check (char_length(btrim(address)) > 0 and char_length(btrim(landmark)) > 0),
  constraint home_service_requests_time_range
    check (ends_at > starts_at),
  constraint home_service_requests_status
    check (status in (
      'pending_approval',
      'awaiting_payment',
      'confirmed',
      'declined',
      'cancelled',
      'refund_review'
    )),
  constraint home_service_requests_payment_state
    check (payment_state in (
      'not_requested',
      'awaiting_verification',
      'verified',
      'refund_review'
    )),
  constraint home_service_requests_approval
    check (status <> 'awaiting_payment' or approved_at is not null),
  constraint home_service_requests_payment_hold
    check (status <> 'awaiting_payment' or appointment_id is not null),
  constraint home_service_requests_confirmation
    check (
      status <> 'confirmed'
      or (
        coverage_confirmed
        and payment_state = 'verified'
        and payment_verified_at is not null
        and appointment_id is not null
      )
    )
);

comment on table public.home_service_requests is
  'No payment reference column. Confirmation requires a private provider transaction.';

create index home_service_requests_customer_idx
  on public.home_service_requests (customer_id, created_at);

create table private.integration_gates (
  name text primary key,
  enabled boolean not null default false
);

insert into private.integration_gates (name, enabled)
values ('home_payment_confirmation', false);

comment on table private.integration_gates is
  'home_payment_confirmation stays false until a real provider integration exists.';

create table private.provider_transactions (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  provider_transaction_id text not null,
  amount_ghs integer not null,
  currency text not null,
  home_request_id uuid not null references public.home_service_requests (id),
  provider_status text not null,
  payload_sha256 text not null,
  appointment_id uuid references public.appointments (id),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint provider_transactions_provider
    check (char_length(btrim(provider)) > 0),
  constraint provider_transactions_event
    check (char_length(btrim(provider_event_id)) > 0),
  constraint provider_transactions_transaction
    check (char_length(btrim(provider_transaction_id)) > 0),
  constraint provider_transactions_amount
    check (amount_ghs >= 0),
  constraint provider_transactions_currency
    check (currency = 'GHS'),
  constraint provider_transactions_payload
    check (char_length(btrim(payload_sha256)) > 0),
  constraint provider_transactions_event_once
    unique (provider, provider_event_id),
  constraint provider_transactions_transaction_once
    unique (provider, provider_transaction_id)
);

comment on table private.provider_transactions is
  'One provider transaction can be processed once. The hash is the verified payload, not a client reference.';

alter default privileges in schema private
  revoke execute on functions from public;

create or replace function private.statement_owns(target regclass)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select pg_catalog.pg_get_userbyid(relowner) = current_user
  from pg_catalog.pg_class
  where oid = target;
$$;

create or replace function private.offering_is_bookable(target_branch text, target_service text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.branch_services offering
    join public.services catalogue on catalogue.id = offering.service_id
    where offering.branch_id = target_branch
      and offering.service_id = target_service
      and offering.is_active
      and offering.is_bookable
      and offering.price_ghs is not null
      and offering.duration_minutes is not null
      and catalogue.is_listed
      and catalogue.verification_status = 'studio_confirmed'
  );
$$;

create or replace function private.professional_is_listed_eligible(
  target_professional uuid,
  target_branch text,
  target_service text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.professional_services eligibility
    join public.professionals person on person.id = eligibility.professional_id
    where eligibility.professional_id = target_professional
      and eligibility.branch_id = target_branch
      and eligibility.service_id = target_service
      and person.is_active
      and person.is_listed
  );
$$;

create or replace function private.lead_time_met(target_visit text, target_start timestamptz)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select target_start >= pg_catalog.now() + pg_catalog.make_interval(
    hours => greatest(policy.lead_time_hours, 24)
  )
  from public.booking_policies policy
  where policy.visit_type = target_visit;
$$;

create or replace function private.customer_id()
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

comment on function private.customer_id() is
  'Signed-in customer from auth.uid(). The role claim must be authenticated. user_metadata is ignored.';

create or replace function private.assert_studio_admin()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  admin_id uuid;
begin
  admin_id := private.customer_id();

  if admin_id is null then
    raise exception 'not authorized';
  end if;

  if not exists (
    select 1
    from public.studio_roles
    where user_id = admin_id
      and role = 'admin'
  ) then
    raise exception 'not authorized';
  end if;
end;
$$;

create or replace function private.provider_payment_matches(
  target_request uuid,
  target_appointment uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from private.provider_transactions payment
    join public.home_service_requests request
      on request.id = payment.home_request_id
    join public.branch_services offering
      on offering.branch_id = request.branch_id
     and offering.service_id = request.service_id
    where payment.home_request_id = target_request
      and payment.appointment_id = target_appointment
      and payment.provider_status = 'paid'
      and payment.currency = 'GHS'
      and offering.price_ghs is not null
      and payment.amount_ghs = offering.price_ghs
  );
$$;

create or replace function private.expire_held_appointments(target_professional uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  booking_id uuid;
  request_id uuid;
begin
  for booking_id in
    select appointment.id
    from public.appointments appointment
    where appointment.professional_id = target_professional
      and appointment.status = 'held'
      and appointment.hold_expires_at <= pg_catalog.clock_timestamp()
    order by appointment.id
    for update
  loop
    perform set_config('allure.appointment_write', booking_id::text, true);

    update public.appointments
    set status = 'cancelled'
    where id = booking_id
      and status = 'held';

    select request.id into request_id
    from public.home_service_requests request
    where request.appointment_id = booking_id
      and request.status = 'awaiting_payment'
    for update;

    if request_id is not null then
      perform set_config('allure.home_request_write', request_id::text, true);

      update public.home_service_requests
      set status = 'cancelled'
      where id = request_id
        and status = 'awaiting_payment';
    end if;
  end loop;
end;
$$;

create or replace function private.release_held_appointment(target_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  booking public.appointments%rowtype;
begin
  if target_id is null then
    return;
  end if;

  select * into booking
  from public.appointments
  where id = target_id
  for update;

  if not found or booking.status is distinct from 'held' then
    return;
  end if;

  if private.customer_id() is distinct from booking.customer_id then
    raise exception 'appointment not found';
  end if;

  perform set_config('allure.appointment_write', booking.id::text, true);

  update public.appointments
  set status = 'cancelled'
  where id = booking.id
    and status = 'held';
end;
$$;

create or replace function private.assign_professional(
  target_branch text,
  target_service text,
  preferred uuid,
  span_start timestamptz,
  span_finish timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  chosen uuid;
  candidate uuid;
  local_start timestamp;
  local_finish timestamp;
begin
  local_start := span_start at time zone 'Africa/Accra';
  local_finish := span_finish at time zone 'Africa/Accra';

  if local_start::date is distinct from local_finish::date then
    raise exception 'the appointment must finish on the same studio day';
  end if;

  for candidate in
    select person.id
    from public.professionals person
    join public.professional_services eligibility
      on eligibility.professional_id = person.id
    where eligibility.branch_id = target_branch
      and eligibility.service_id = target_service
      and person.is_active
      and (preferred is null or person.id = preferred)
    order by person.id
  loop
    perform 1
    from public.professionals person
    where person.id = candidate
    for update;

    perform 1
    from public.professional_schedules schedule
    where schedule.professional_id = candidate
      and schedule.branch_id = target_branch
    order by schedule.id
    for update;

    perform 1
    from public.professional_unavailability away
    where away.professional_id = candidate
    order by away.id
    for update;

    perform private.expire_held_appointments(candidate);
  end loop;

  select person.id into chosen
  from public.professionals person
  join public.professional_services eligibility
    on eligibility.professional_id = person.id
  where eligibility.branch_id = target_branch
    and eligibility.service_id = target_service
    and person.is_active
    and (
      preferred is null
      or (person.id = preferred and person.is_listed)
    )
    and exists (
      select 1
      from public.professional_schedules schedule
      where schedule.professional_id = person.id
        and schedule.branch_id = target_branch
        and schedule.weekday = extract(dow from local_start)::smallint
        and schedule.effective_from <= local_start::date
        and (
          schedule.effective_until is null
          or schedule.effective_until >= local_start::date
        )
        and schedule.start_time <= local_start::time
        and schedule.end_time >= local_finish::time
    )
    and not exists (
      select 1
      from public.professional_unavailability away
      where away.professional_id = person.id
        and tstzrange(away.starts_at, away.ends_at, '[)')
          && tstzrange(span_start, span_finish, '[)')
    )
    and not exists (
      select 1
      from public.appointments other
      where other.professional_id = person.id
        and (
          other.status = 'confirmed'
          or (
            other.status = 'held'
            and other.hold_expires_at > pg_catalog.clock_timestamp()
          )
        )
        and tstzrange(other.starts_at, other.ends_at, '[)')
          && tstzrange(span_start, span_finish, '[)')
    )
  order by person.id
  limit 1;

  return chosen;
end;
$$;

create or replace function private.confirm_walk_in_appointment(target_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  booking public.appointments%rowtype;
  offering public.branch_services%rowtype;
  finish timestamptz;
  chosen uuid;
begin
  if private.customer_id() is null then
    raise exception 'appointment not found';
  end if;

  select * into booking
  from public.appointments
  where id = target_id
  for update;

  if not found or booking.customer_id is distinct from private.customer_id() then
    raise exception 'appointment not found';
  end if;

  if booking.visit_type = 'walk-in' and booking.status = 'confirmed' then
    return booking.id;
  end if;

  if booking.visit_type <> 'walk-in' or booking.status <> 'requested' then
    raise exception 'only a walk-in request can be confirmed this way';
  end if;

  if not private.offering_is_bookable(booking.branch_id, booking.service_id) then
    raise exception 'this treatment is not bookable at this studio';
  end if;

  if private.lead_time_met('walk-in', booking.starts_at) is not true then
    raise exception 'the minimum lead time has not been met';
  end if;

  if booking.preferred_professional_id is not null
    and private.professional_is_listed_eligible(
      booking.preferred_professional_id,
      booking.branch_id,
      booking.service_id
    ) is not true
  then
    raise exception 'that professional is not eligible for this treatment';
  end if;

  select * into offering
  from public.branch_services
  where branch_id = booking.branch_id
    and service_id = booking.service_id
  for update;

  finish := booking.starts_at + make_interval(
    mins => offering.duration_minutes + offering.buffer_minutes
  );

  chosen := private.assign_professional(
    booking.branch_id,
    booking.service_id,
    booking.preferred_professional_id,
    booking.starts_at,
    finish
  );

  if chosen is null then
    raise exception 'no professional is free for that time';
  end if;

  perform set_config('allure.appointment_write', booking.id::text, true);

  update public.appointments
  set professional_id = chosen,
      ends_at = finish,
      price_ghs = offering.price_ghs,
      duration_minutes = offering.duration_minutes,
      buffer_minutes = offering.buffer_minutes,
      status = 'confirmed',
      confirmed_at = clock_timestamp()
  where id = booking.id;

  return booking.id;
exception
  when exclusion_violation then
    raise exception 'that time is already held';
end;
$$;

create or replace function private.set_home_coverage(target_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  request public.home_service_requests%rowtype;
begin
  perform private.assert_studio_admin();

  select * into request
  from public.home_service_requests
  where id = target_id
  for update;

  if not found or request.status <> 'pending_approval' then
    raise exception 'only a pending home-service request can be updated';
  end if;

  perform set_config('allure.home_request_write', request.id::text, true);

  update public.home_service_requests
  set coverage_confirmed = true
  where id = request.id;

  return request.id;
end;
$$;

create or replace function private.approve_home_service_request(target_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  request public.home_service_requests%rowtype;
  offering public.branch_services%rowtype;
  finish timestamptz;
  chosen uuid;
  held_id uuid;
begin
  perform private.assert_studio_admin();

  select * into request
  from public.home_service_requests
  where id = target_id
  for update;

  if not found then
    raise exception 'only a pending home-service request can be approved';
  end if;

  if request.status = 'awaiting_payment' and request.appointment_id is not null then
    if exists (
      select 1
      from public.appointments appointment
      where appointment.id = request.appointment_id
        and appointment.status = 'held'
        and appointment.hold_expires_at > pg_catalog.clock_timestamp()
    ) then
      return request.id;
    end if;

    raise exception 'the home-service hold is no longer available';
  end if;

  if request.status <> 'pending_approval' then
    raise exception 'only a pending home-service request can be approved';
  end if;

  if not request.coverage_confirmed then
    raise exception 'home-service coverage is not confirmed';
  end if;

  if not private.offering_is_bookable(request.branch_id, request.service_id) then
    raise exception 'this treatment is not bookable at this studio';
  end if;

  if private.lead_time_met('home', request.starts_at) is not true then
    raise exception 'the minimum lead time has not been met';
  end if;

  if request.preferred_professional_id is not null
    and private.professional_is_listed_eligible(
      request.preferred_professional_id,
      request.branch_id,
      request.service_id
    ) is not true
  then
    raise exception 'that professional is not eligible for this treatment';
  end if;

  select * into offering
  from public.branch_services
  where branch_id = request.branch_id
    and service_id = request.service_id
  for update;

  finish := request.starts_at + make_interval(
    mins => offering.duration_minutes + offering.buffer_minutes
  );
  chosen := private.assign_professional(
    request.branch_id,
    request.service_id,
    request.preferred_professional_id,
    request.starts_at,
    finish
  );

  if chosen is null then
    raise exception 'no professional is free for that time';
  end if;

  held_id := gen_random_uuid();
  perform set_config('allure.appointment_write', held_id::text, true);

  insert into public.appointments (
    id,
    customer_id,
    visit_type,
    branch_id,
    service_id,
    professional_id,
    preferred_professional_id,
    starts_at,
    ends_at,
    price_ghs,
    duration_minutes,
    buffer_minutes,
    hold_expires_at,
    status
  )
  values (
    held_id,
    request.customer_id,
    'home',
    request.branch_id,
    request.service_id,
    chosen,
    request.preferred_professional_id,
    request.starts_at,
    finish,
    offering.price_ghs,
    offering.duration_minutes,
    offering.buffer_minutes,
    request.starts_at,
    'held'
  );

  perform set_config('allure.home_request_write', request.id::text, true);

  update public.home_service_requests
  set status = 'awaiting_payment',
      approved_at = clock_timestamp(),
      appointment_id = held_id
  where id = request.id;

  return request.id;
exception
  when exclusion_violation then
    raise exception 'that time is already held';
end;
$$;

create or replace function private.complete_verified_payment(target_tx uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  payment private.provider_transactions%rowtype;
  request public.home_service_requests%rowtype;
  offering public.branch_services%rowtype;
  booking public.appointments%rowtype;
begin
  if not exists (
    select 1
    from private.integration_gates gate
    where gate.name = 'home_payment_confirmation'
      and gate.enabled
  ) then
    raise exception 'payment confirmation is disabled until a provider integration exists';
  end if;

  select * into payment
  from private.provider_transactions
  where id = target_tx
  for update;

  if not found then
    raise exception 'payment cannot be verified for this home-service request';
  end if;

  if payment.appointment_id is not null then
    return payment.appointment_id;
  end if;

  if payment.provider_status is distinct from 'paid' or payment.currency is distinct from 'GHS' then
    raise exception 'provider status is not paid';
  end if;

  select * into request
  from public.home_service_requests
  where id = payment.home_request_id
  for update;

  if not found
    or request.status is distinct from 'awaiting_payment'
    or request.approved_at is null
    or not request.coverage_confirmed
    or request.appointment_id is null
  then
    raise exception 'payment cannot be verified for this home-service request';
  end if;

  select * into booking
  from public.appointments
  where id = request.appointment_id
  for update;

  if not found
    or booking.status is distinct from 'held'
    or booking.hold_expires_at <= pg_catalog.clock_timestamp()
    or booking.customer_id is distinct from request.customer_id
    or booking.visit_type is distinct from 'home'
    or booking.starts_at is distinct from request.starts_at
    or booking.professional_id is null
    or booking.price_ghs is null
  then
    raise exception 'the home-service hold is no longer available';
  end if;

  if not private.offering_is_bookable(request.branch_id, request.service_id) then
    raise exception 'this treatment is not bookable at this studio';
  end if;

  select * into offering
  from public.branch_services
  where branch_id = request.branch_id
    and service_id = request.service_id
  for update;

  if offering.price_ghs is null
    or payment.amount_ghs is distinct from booking.price_ghs
    or offering.price_ghs is distinct from booking.price_ghs
  then
    raise exception 'the payment amount does not match the studio price';
  end if;

  perform set_config('allure.appointment_write', booking.id::text, true);

  update public.appointments
  set status = 'confirmed',
      confirmed_at = clock_timestamp()
  where id = booking.id
    and status = 'held';

  update private.provider_transactions
  set appointment_id = booking.id,
      processed_at = clock_timestamp()
  where id = payment.id;

  perform set_config('allure.home_request_write', request.id::text, true);

  update public.home_service_requests
  set status = 'confirmed',
      payment_state = 'verified',
      payment_verified_at = clock_timestamp()
  where id = request.id;

  return booking.id;
exception
  when exclusion_violation then
    raise exception 'that time is already held';
end;
$$;

create or replace function private.session_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select auth.jwt() ->> 'role';
$$;

create or replace function private.apply_provider_payment(
  provider text,
  provider_event_id text,
  provider_transaction_id text,
  amount_ghs integer,
  currency text,
  home_request_id uuid,
  provider_status text,
  payload_sha256 text
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  existing private.provider_transactions%rowtype;
  created uuid;
begin
  if current_user is distinct from 'payment_verifier'
    or coalesce(private.session_role(), '') in ('anon', 'authenticated')
  then
    raise exception 'payment verification is not available to this role';
  end if;

  if not exists (
    select 1
    from private.integration_gates gate
    where gate.name = 'home_payment_confirmation'
      and gate.enabled
  ) then
    raise exception 'payment confirmation is disabled until a provider integration exists';
  end if;

  if provider_status is distinct from 'paid' or currency is distinct from 'GHS' then
    raise exception 'provider status is not paid';
  end if;

  if amount_ghs is null or amount_ghs < 0
    or char_length(btrim(coalesce(provider, ''))) = 0
    or char_length(btrim(coalesce(provider_event_id, ''))) = 0
    or char_length(btrim(coalesce(provider_transaction_id, ''))) = 0
    or char_length(btrim(coalesce(payload_sha256, ''))) = 0
  then
    raise exception 'payment cannot be verified for this home-service request';
  end if;

  select * into existing
  from private.provider_transactions payment
  where payment.provider = apply_provider_payment.provider
    and payment.provider_event_id = apply_provider_payment.provider_event_id;

  if found then
    if existing.provider_transaction_id is distinct from apply_provider_payment.provider_transaction_id
      or existing.amount_ghs is distinct from apply_provider_payment.amount_ghs
      or existing.currency is distinct from apply_provider_payment.currency
      or existing.home_request_id is distinct from apply_provider_payment.home_request_id
      or existing.provider_status is distinct from apply_provider_payment.provider_status
      or existing.payload_sha256 is distinct from apply_provider_payment.payload_sha256
    then
      raise exception 'provider event payload does not match the stored transaction';
    end if;

    if existing.appointment_id is null then
      return private.complete_verified_payment(existing.id);
    end if;

    return existing.appointment_id;
  end if;

  if exists (
    select 1
    from private.provider_transactions payment
    where payment.provider = apply_provider_payment.provider
      and payment.provider_transaction_id = apply_provider_payment.provider_transaction_id
  ) then
    raise exception 'provider transaction was already processed';
  end if;

  insert into private.provider_transactions (
    provider,
    provider_event_id,
    provider_transaction_id,
    amount_ghs,
    currency,
    home_request_id,
    provider_status,
    payload_sha256
  )
  values (
    provider,
    provider_event_id,
    provider_transaction_id,
    amount_ghs,
    currency,
    home_request_id,
    provider_status,
    payload_sha256
  )
  returning id into created;

  return private.complete_verified_payment(created);
exception
  when unique_violation then
    select * into existing
    from private.provider_transactions payment
    where payment.provider = apply_provider_payment.provider
      and payment.provider_event_id = apply_provider_payment.provider_event_id;

    if found
      and existing.provider_transaction_id is not distinct from apply_provider_payment.provider_transaction_id
      and existing.amount_ghs is not distinct from apply_provider_payment.amount_ghs
      and existing.currency is not distinct from apply_provider_payment.currency
      and existing.home_request_id is not distinct from apply_provider_payment.home_request_id
      and existing.provider_status is not distinct from apply_provider_payment.provider_status
      and existing.payload_sha256 is not distinct from apply_provider_payment.payload_sha256
      and existing.appointment_id is not null
    then
      return existing.appointment_id;
    end if;

    raise exception 'provider transaction was already processed';
end;
$$;

create or replace function private.available_slot_starts(
  target_branch text,
  target_service text,
  target_professional uuid,
  target_day date
)
returns table (starts_at timestamptz)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  service_minutes integer;
  buffer_minutes integer;
  step_minutes integer;
  notice interval;
  person record;
  schedule record;
  slot_local timestamp;
  slot_end_local timestamp;
  window_end timestamp;
  slot_start timestamptz;
  slot_finish timestamptz;
  today date;
  steps integer;
begin
  today := (pg_catalog.now() at time zone 'Africa/Accra')::date;

  if target_day is null
    or target_day < today
    or target_day > today + 90
  then
    return;
  end if;

  select offering.duration_minutes, offering.buffer_minutes
    into service_minutes, buffer_minutes
  from public.branch_services offering
  join public.services catalogue on catalogue.id = offering.service_id
  where offering.branch_id = target_branch
    and offering.service_id = target_service
    and offering.is_active
    and offering.is_bookable
    and offering.price_ghs is not null
    and offering.duration_minutes is not null
    and catalogue.is_listed
    and catalogue.verification_status = 'studio_confirmed';

  if service_minutes is null then
    return;
  end if;

  step_minutes := service_minutes + coalesce(buffer_minutes, 0);
  if step_minutes < 1 then
    return;
  end if;

  select make_interval(hours => greatest(max(policy.lead_time_hours), 24))
    into notice
  from public.booking_policies policy
  where policy.visit_type in ('walk-in', 'home');

  if notice is null then
    return;
  end if;

  if target_professional is not null
    and private.professional_is_listed_eligible(
      target_professional,
      target_branch,
      target_service
    ) is not true
  then
    return;
  end if;

  for person in
    select distinct candidate.id
    from public.professionals candidate
    join public.professional_services eligibility
      on eligibility.professional_id = candidate.id
    where candidate.is_active
      and eligibility.branch_id = target_branch
      and eligibility.service_id = target_service
      and (target_professional is null or candidate.id = target_professional)
  loop
    for schedule in
      select working.start_time, working.end_time
      from public.professional_schedules working
      where working.professional_id = person.id
        and working.branch_id = target_branch
        and working.weekday = extract(dow from target_day)::smallint
        and working.effective_from <= target_day
        and (working.effective_until is null or working.effective_until >= target_day)
    loop
      slot_local := target_day + schedule.start_time;
      window_end := target_day + schedule.end_time;
      steps := 0;

      while steps < 96
        and slot_local + make_interval(mins => step_minutes) <= window_end
      loop
        steps := steps + 1;
        slot_end_local := slot_local + make_interval(mins => step_minutes);

        if slot_local::date = target_day and slot_end_local::date = target_day then
          slot_start := slot_local at time zone 'Africa/Accra';
          slot_finish := slot_end_local at time zone 'Africa/Accra';

          if slot_start >= now() + notice
            and not exists (
              select 1
              from public.professional_unavailability away
              where away.professional_id = person.id
                and tstzrange(away.starts_at, away.ends_at, '[)')
                  && tstzrange(slot_start, slot_finish, '[)')
            )
            and not exists (
              select 1
              from public.appointments other
              where other.professional_id = person.id
                and (
                  other.status = 'confirmed'
                  or (
                    other.status = 'held'
                    and other.hold_expires_at > pg_catalog.now()
                  )
                )
                and tstzrange(other.starts_at, other.ends_at, '[)')
                  && tstzrange(slot_start, slot_finish, '[)')
            )
          then
            starts_at := slot_start;
            return next;
          end if;
        end if;

        slot_local := slot_local + make_interval(mins => step_minutes);
      end loop;
    end loop;
  end loop;
end;
$$;

create or replace function private.protect_profile()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
begin
  if private.statement_owns('public.profiles'::regclass) then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    raise exception 'profiles are created from the account record';
  end if;

  if tg_op = 'DELETE' then
    raise exception 'profiles cannot be deleted from this role';
  end if;

  if private.customer_id() is distinct from old.id then
    raise exception 'a customer can update only their own profile';
  end if;

  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'a customer cannot change their profile id';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.protect_studio_roles()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
begin
  if not private.statement_owns('public.studio_roles'::regclass) then
    raise exception 'staff roles cannot be changed from this role';
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function private.protect_integration_gates()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
begin
  if not private.statement_owns('private.integration_gates'::regclass) then
    raise exception 'integration settings cannot be changed from this role';
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function private.protect_provider_transaction()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  owns boolean;
begin
  owns := private.statement_owns('private.provider_transactions'::regclass);

  if tg_op = 'INSERT' then
    if owns then
      return new;
    end if;

    if current_user is distinct from 'payment_verifier' then
      raise exception 'provider transactions cannot be written from this role';
    end if;

    if new.appointment_id is not null or new.processed_at is not null then
      raise exception 'a provider transaction cannot be inserted already processed';
    end if;

    return new;
  end if;

  if not owns then
    raise exception 'provider transactions cannot be written from this role';
  end if;

  if tg_op = 'DELETE' then
    raise exception 'a recorded provider transaction cannot be rewritten';
  end if;

  if new.provider is distinct from old.provider
    or new.provider_event_id is distinct from old.provider_event_id
    or new.provider_transaction_id is distinct from old.provider_transaction_id
    or new.amount_ghs is distinct from old.amount_ghs
    or new.currency is distinct from old.currency
    or new.home_request_id is distinct from old.home_request_id
    or new.provider_status is distinct from old.provider_status
    or new.payload_sha256 is distinct from old.payload_sha256
    or (
      old.appointment_id is not null
      and new.appointment_id is distinct from old.appointment_id
    )
  then
    raise exception 'a recorded provider transaction cannot be rewritten';
  end if;

  return new;
end;
$$;

create or replace function private.protect_appointment()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  cutoff_hours integer;
  privileged boolean;
begin
  privileged := private.statement_owns('public.appointments'::regclass)
    and current_setting('allure.appointment_write', true) is not distinct from new.id::text;

  if privileged then
    if tg_op = 'UPDATE'
      and (
        new.customer_id is distinct from old.customer_id
        or new.visit_type is distinct from old.visit_type
        or new.branch_id is distinct from old.branch_id
        or new.service_id is distinct from old.service_id
        or new.starts_at is distinct from old.starts_at
      )
    then
      raise exception 'confirmation cannot change the requested visit';
    end if;

    if new.status = 'held'
      and (
        new.professional_id is null
        or new.hold_expires_at is null
        or new.price_ghs is null
        or new.duration_minutes is null
        or new.buffer_minutes is null
        or new.duration_minutes < 1
        or new.buffer_minutes < 0
        or new.ends_at is distinct from new.starts_at + make_interval(
          mins => new.duration_minutes + new.buffer_minutes
        )
      )
    then
      raise exception 'a home-service hold requires the studio price and duration';
    end if;

    if new.status = 'confirmed'
      and (
        new.professional_id is null
        or new.confirmed_at is null
        or new.price_ghs is null
        or new.duration_minutes is null
        or new.buffer_minutes is null
        or new.price_ghs < 0
        or new.duration_minutes < 1
        or new.buffer_minutes < 0
        or new.ends_at is distinct from new.starts_at + make_interval(
          mins => new.duration_minutes + new.buffer_minutes
        )
      )
    then
      raise exception 'a confirmed appointment requires the studio price and duration';
    end if;

    return new;
  end if;

  if private.customer_id() is null then
    raise exception 'appointment changes require the confirmation function';
  end if;

  if tg_op = 'INSERT' then
    if new.visit_type is distinct from 'walk-in' then
      raise exception 'a customer cannot create a home appointment';
    end if;

    if new.status is distinct from 'requested'
      or new.professional_id is not null
      or new.confirmed_at is not null
      or new.price_ghs is not null
      or new.duration_minutes is not null
      or new.buffer_minutes is not null
      or new.hold_expires_at is not null
    then
      raise exception 'a customer cannot confirm an appointment';
    end if;

    if private.offering_is_bookable(new.branch_id, new.service_id) is not true then
      raise exception 'this treatment is not bookable at this studio';
    end if;

    if private.lead_time_met('walk-in', new.starts_at) is not true then
      raise exception 'the minimum lead time has not been met';
    end if;

    if new.preferred_professional_id is not null
      and private.professional_is_listed_eligible(
        new.preferred_professional_id,
        new.branch_id,
        new.service_id
      ) is not true
    then
      raise exception 'that professional is not eligible for this treatment';
    end if;

    new.customer_id := private.customer_id();
    return new;
  end if;

  if private.customer_id() is distinct from old.customer_id then
    raise exception 'appointment changes require the confirmation function';
  end if;

  if new.customer_id is distinct from old.customer_id
    or new.visit_type is distinct from old.visit_type
    or new.branch_id is distinct from old.branch_id
    or new.service_id is distinct from old.service_id
    or new.professional_id is distinct from old.professional_id
    or new.preferred_professional_id is distinct from old.preferred_professional_id
    or new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
    or new.confirmed_at is distinct from old.confirmed_at
    or new.price_ghs is distinct from old.price_ghs
    or new.duration_minutes is distinct from old.duration_minutes
    or new.buffer_minutes is distinct from old.buffer_minutes
    or new.hold_expires_at is distinct from old.hold_expires_at
  then
    raise exception 'a customer cannot change the booked visit';
  end if;

  if new.visit_type = 'home' and new.status is distinct from old.status then
    raise exception 'a customer cannot change a home appointment';
  end if;

  if new.status is distinct from old.status and new.status <> 'cancelled' then
    raise exception 'a customer cannot confirm an appointment';
  end if;

  if old.status = 'confirmed' and new.status = 'cancelled' then
    select cancellation_cutoff_hours into cutoff_hours
    from public.booking_policies
    where visit_type = old.visit_type;

    if cutoff_hours is null
      or old.starts_at < now() + make_interval(hours => cutoff_hours)
    then
      raise exception 'the cancellation cutoff has passed';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.protect_home_service_request()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  cutoff_hours integer;
  privileged boolean;
begin
  privileged := private.statement_owns('public.home_service_requests'::regclass)
    and current_setting('allure.home_request_write', true) is not distinct from new.id::text;

  if privileged then
    if tg_op = 'UPDATE'
      and (
        new.customer_id is distinct from old.customer_id
        or new.branch_id is distinct from old.branch_id
        or new.service_id is distinct from old.service_id
        or new.address is distinct from old.address
        or new.landmark is distinct from old.landmark
        or new.ghana_post_gps is distinct from old.ghana_post_gps
        or new.notes is distinct from old.notes
        or new.starts_at is distinct from old.starts_at
        or new.ends_at is distinct from old.ends_at
        or new.preferred_professional_id is distinct from old.preferred_professional_id
      )
    then
      raise exception 'this home-service update cannot change the request';
    end if;

    if new.status = 'confirmed'
      and (
        old.status is distinct from 'confirmed'
        or new.appointment_id is distinct from old.appointment_id
      )
      and private.provider_payment_matches(new.id, new.appointment_id) is not true
    then
      raise exception 'home-service confirmation requires a verified provider transaction';
    end if;

    return new;
  end if;

  if private.customer_id() is null then
    raise exception 'home-service changes require an administrator';
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'pending_approval'
      or new.coverage_confirmed
      or new.payment_state is distinct from 'not_requested'
      or new.appointment_id is not null
      or new.approved_at is not null
      or new.payment_verified_at is not null
    then
      raise exception 'a customer cannot approve, charge, or confirm a home service';
    end if;

    if private.offering_is_bookable(new.branch_id, new.service_id) is not true then
      raise exception 'this treatment is not bookable at this studio';
    end if;

    if private.lead_time_met('home', new.starts_at) is not true then
      raise exception 'the minimum lead time has not been met';
    end if;

    if new.preferred_professional_id is not null
      and private.professional_is_listed_eligible(
        new.preferred_professional_id,
        new.branch_id,
        new.service_id
      ) is not true
    then
      raise exception 'that professional is not eligible for this treatment';
    end if;

    new.customer_id := private.customer_id();
    return new;
  end if;

  if private.customer_id() is distinct from old.customer_id then
    raise exception 'home-service changes require an administrator';
  end if;

  if new.customer_id is distinct from old.customer_id
    or new.branch_id is distinct from old.branch_id
    or new.service_id is distinct from old.service_id
    or new.coverage_confirmed is distinct from old.coverage_confirmed
    or new.payment_state is distinct from old.payment_state
    or new.appointment_id is distinct from old.appointment_id
    or new.approved_at is distinct from old.approved_at
    or new.payment_verified_at is distinct from old.payment_verified_at
  then
    raise exception 'a customer cannot change home-service controls';
  end if;

  if old.status = 'pending_approval' and (
    new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
    or new.preferred_professional_id is distinct from old.preferred_professional_id
  ) then
    if private.lead_time_met('home', new.starts_at) is not true then
      raise exception 'the minimum lead time has not been met';
    end if;

    if new.preferred_professional_id is not null
      and private.professional_is_listed_eligible(
        new.preferred_professional_id,
        new.branch_id,
        new.service_id
      ) is not true
    then
      raise exception 'that professional is not eligible for this treatment';
    end if;
  elsif old.status <> 'pending_approval' and (
    new.address is distinct from old.address
    or new.landmark is distinct from old.landmark
    or new.ghana_post_gps is distinct from old.ghana_post_gps
    or new.notes is distinct from old.notes
    or new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
    or new.preferred_professional_id is distinct from old.preferred_professional_id
  ) then
    raise exception 'this home-service request can no longer be edited';
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if old.status in ('pending_approval', 'awaiting_payment') and new.status = 'cancelled' then
    if old.appointment_id is not null then
      perform private.release_held_appointment(old.appointment_id);
    end if;

    return new;
  end if;

  if old.status = 'confirmed' and new.status = 'refund_review' then
    select cancellation_cutoff_hours into cutoff_hours
    from public.booking_policies
    where visit_type = 'home';

    if cutoff_hours is null
      or old.starts_at < now() + make_interval(hours => cutoff_hours)
    then
      raise exception 'the cancellation cutoff has passed';
    end if;

    new.payment_state := 'refund_review';
    return new;
  end if;

  raise exception 'a customer cannot approve, charge, or confirm a home service';
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.confirm_walk_in_appointment(target_id uuid)
returns uuid
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select private.confirm_walk_in_appointment(target_id);
$$;

comment on function public.confirm_walk_in_appointment(uuid) is
  'Confirms the caller''s own walk-in request after schedule, price, and conflict checks.';

create or replace function public.confirm_home_coverage(target_id uuid)
returns uuid
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select private.set_home_coverage(target_id);
$$;

comment on function public.confirm_home_coverage(uuid) is
  'Administrator coverage decision. Authorization is studio_roles, not JWT metadata.';

create or replace function public.approve_home_service(target_id uuid)
returns uuid
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select private.approve_home_service_request(target_id);
$$;

comment on function public.approve_home_service(uuid) is
  'Administrator approval. It holds a professional until the visit starts and does not take payment.';

create or replace function private.lock_schedule_professional()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  first_id uuid;
  second_id uuid;
begin
  if tg_op = 'INSERT' then
    first_id := new.professional_id;
    second_id := null;
  elsif tg_op = 'DELETE' then
    first_id := old.professional_id;
    second_id := null;
  else
    first_id := least(old.professional_id, new.professional_id);
    second_id := greatest(old.professional_id, new.professional_id);
  end if;

  if first_id is not null then
    perform 1
    from public.professionals person
    where person.id = first_id
    for update;
  end if;

  if second_id is not null and second_id is distinct from first_id then
    perform 1
    from public.professionals person
    where person.id = second_id
    for update;
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.available_slots(
  target_branch text,
  target_service text,
  target_professional uuid,
  target_day date
)
returns table (starts_at timestamptz)
language sql
stable
security definer
set search_path = pg_catalog, public, private
set statement_timeout = '3s'
as $$
  select distinct slot.starts_at
  from private.available_slot_starts(
    target_branch,
    target_service,
    target_professional,
    target_day
  ) as slot
  order by 1
  limit 48;
$$;

comment on function public.available_slots(text, text, uuid, date) is
  'Returns at most 48 start times for one studio day, from today through 90 days ahead in Africa/Accra. Staff schedules and other customers stay private.';

create trigger protect_profile
  before insert or update or delete on public.profiles
  for each row
  execute function private.protect_profile();

create trigger protect_studio_roles
  before insert or update or delete on public.studio_roles
  for each row
  execute function private.protect_studio_roles();

create trigger protect_integration_gates
  before insert or update or delete on private.integration_gates
  for each row
  execute function private.protect_integration_gates();

create trigger protect_provider_transaction
  before insert or update or delete on private.provider_transactions
  for each row
  execute function private.protect_provider_transaction();

create trigger protect_appointment
  before insert or update on public.appointments
  for each row
  execute function private.protect_appointment();

create trigger lock_schedule_professional
  before insert or update or delete on public.professional_schedules
  for each row
  execute function private.lock_schedule_professional();

create trigger lock_time_off_professional
  before insert or update or delete on public.professional_unavailability
  for each row
  execute function private.lock_schedule_professional();

create trigger protect_home_service_request
  before insert or update on public.home_service_requests
  for each row
  execute function private.protect_home_service_request();

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function private.handle_new_user();

alter table public.booking_policies enable row level security;
alter table public.profiles enable row level security;
alter table public.professionals enable row level security;
alter table public.professional_branches enable row level security;
alter table public.professional_services enable row level security;
alter table public.professional_schedules enable row level security;
alter table public.professional_unavailability enable row level security;
alter table public.studio_roles enable row level security;
alter table public.appointments enable row level security;
alter table public.home_service_requests enable row level security;

create policy booking_policies_public_read
  on public.booking_policies
  for select
  to anon, authenticated
  using (true);

create policy professionals_public_read
  on public.professionals
  for select
  to anon, authenticated
  using (is_listed and is_active);

create policy professional_branches_public_read
  on public.professional_branches
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.professionals person
      where person.id = professional_id
        and person.is_listed
        and person.is_active
    )
  );

create policy professional_services_public_read
  on public.professional_services
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.professionals person
      where person.id = professional_id
        and person.is_listed
        and person.is_active
    )
  );

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy appointments_select_own
  on public.appointments
  for select
  to authenticated
  using (customer_id = auth.uid());

create policy appointments_insert_own
  on public.appointments
  for insert
  to authenticated
  with check (
    customer_id = auth.uid()
    and visit_type = 'walk-in'
    and status = 'requested'
    and professional_id is null
    and confirmed_at is null
    and price_ghs is null
    and duration_minutes is null
    and buffer_minutes is null
    and hold_expires_at is null
  );

create policy appointments_update_own
  on public.appointments
  for update
  to authenticated
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

create policy home_service_requests_select_own
  on public.home_service_requests
  for select
  to authenticated
  using (customer_id = auth.uid());

create policy home_service_requests_insert_own
  on public.home_service_requests
  for insert
  to authenticated
  with check (
    customer_id = auth.uid()
    and status = 'pending_approval'
    and coverage_confirmed = false
    and payment_state = 'not_requested'
    and appointment_id is null
    and approved_at is null
    and payment_verified_at is null
  );

create policy home_service_requests_update_own
  on public.home_service_requests
  for update
  to authenticated
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

revoke all on table
  public.booking_policies,
  public.professionals,
  public.professional_branches,
  public.professional_services,
  public.professional_schedules,
  public.professional_unavailability,
  public.studio_roles,
  public.profiles,
  public.appointments,
  public.home_service_requests
from public, anon, authenticated, service_role;

revoke all on table private.integration_gates, private.provider_transactions
from public, anon, authenticated, service_role, payment_verifier;

grant usage on schema public to anon, authenticated, service_role, payment_verifier;
grant usage on schema private to authenticated, payment_verifier;

grant select on table
  public.booking_policies,
  public.professionals,
  public.professional_branches,
  public.professional_services
to anon, authenticated;

grant select, update on table public.profiles to authenticated;
grant select, insert, update on table public.appointments to authenticated;
grant select, insert, update on table public.home_service_requests to authenticated;

grant select on table private.integration_gates to payment_verifier;
grant select, insert on table private.provider_transactions to payment_verifier;

do $$
declare
  fn regprocedure;
begin
  for fn in
    select pg_proc.oid::regprocedure
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'private'
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated, service_role, payment_verifier',
      fn
    );
  end loop;
end $$;

grant execute on function
  private.protect_profile(),
  private.protect_appointment(),
  private.protect_home_service_request(),
  private.offering_is_bookable(text, text),
  private.professional_is_listed_eligible(uuid, text, text),
  private.lead_time_met(text, timestamptz),
  private.statement_owns(regclass),
  private.customer_id(),
  private.release_held_appointment(uuid)
to authenticated;

grant execute on function private.statement_owns(regclass) to payment_verifier;
grant execute on function private.session_role() to payment_verifier;
grant execute on function private.protect_provider_transaction() to payment_verifier;
grant execute on function private.complete_verified_payment(uuid) to payment_verifier;
grant execute on function private.apply_provider_payment(
  text, text, text, integer, text, uuid, text, text
) to payment_verifier;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function private.handle_new_user() to supabase_auth_admin;
  end if;
end $$;

revoke all on function
  public.confirm_walk_in_appointment(uuid),
  public.available_slots(text, text, uuid, date),
  public.confirm_home_coverage(uuid),
  public.approve_home_service(uuid)
from public, anon, authenticated, service_role;

grant execute on function public.confirm_walk_in_appointment(uuid) to authenticated;
grant execute on function public.available_slots(text, text, uuid, date) to anon, authenticated;
grant execute on function public.confirm_home_coverage(uuid) to authenticated;
grant execute on function public.approve_home_service(uuid) to authenticated;
