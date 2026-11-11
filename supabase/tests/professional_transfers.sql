-- Local professional-transfer assertions.
-- Run only against a throwaway database after catalogue, branches, admin access,
-- service management, manager management, professional management, professional
-- scheduling, and 20261111090922_professional_transfers.sql.
-- This file creates no Auth users beyond the throwaway cluster and is not a migration.

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'owner@allure.test'),
  ('22222222-2222-4222-8222-222222222222', 'accra.manager@allure.test'),
  ('33333333-3333-4333-8333-333333333333', 'kumasi.manager@allure.test'),
  ('44444444-4444-4444-8444-444444444444', 'artist@allure.test');

select private.provision_owner('11111111-1111-4111-8111-111111111111');

create or replace function public._expect(ok boolean, label text)
returns void
language plpgsql
as $$
begin
  if ok is not true then
    raise exception 'failed: %', label;
  end if;
end;
$$;

create or replace function public._as(actor uuid, statement text)
returns text
language plpgsql
as $$
declare
  result text;
begin
  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', actor)::text,
    true
  );
  begin
    set local role authenticated;
    execute statement into result;
    reset role;
  exception
    when others then
      reset role;
      raise;
  end;
  return result;
end;
$$;

create or replace function public._expect_error(actor uuid, statement text, expected text)
returns void
language plpgsql
as $$
declare
  got text := 'no error';
begin
  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', actor)::text,
    true
  );
  begin
    set local role authenticated;
    begin
      execute statement;
    exception
      when others then
        got := sqlerrm;
    end;
    reset role;
  exception
    when others then
      reset role;
      raise;
  end;
  if got is distinct from expected then
    raise exception 'expected "%" but got "%" for %', expected, got, statement;
  end if;
end;
$$;

select public._as(
  '11111111-1111-4111-8111-111111111111',
  $$select public.grant_manager('22222222-2222-4222-8222-222222222222')::text$$
);
select public._as(
  '11111111-1111-4111-8111-111111111111',
  $$select public.assign_manager_branch('22222222-2222-4222-8222-222222222222', 'accra')::text$$
);
select public._as(
  '11111111-1111-4111-8111-111111111111',
  $$select public.grant_manager('33333333-3333-4333-8333-333333333333')::text$$
);
select public._as(
  '11111111-1111-4111-8111-111111111111',
  $$select public.assign_manager_branch('33333333-3333-4333-8333-333333333333', 'kumasi')::text$$
);

create temp table person_ids (
  label text primary key,
  id uuid not null
);

create temp table transfer_ids (
  label text primary key,
  id uuid not null
);

create temp table markers_offerings (
  amount integer
);

insert into person_ids (label, id)
values (
  'efua',
  public._as(
    '11111111-1111-4111-8111-111111111111',
    $$select public.admin_create_professional(
      'Efua Mensah', 'Efua', 'Lash artist at the Accra studio.', null, 'accra', true, true
    )::text$$
  )::uuid
);

insert into markers_offerings (amount)
select count(*) from public.branch_services;

select public._as(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_add_professional_qualification(%L, %L)::text',
    (select id from person_ids where label = 'efua'),
    'svc_mink_lash_extensions'
  )
);

select public._as(
  '11111111-1111-4111-8111-111111111111',
  format(
    $sql$select public.admin_save_weekly_schedule(
      %L, 7, 'complete',
      (select jsonb_agg(jsonb_build_object('weekday', day, 'kind', 'shift', 'starts', '09:00', 'ends', '17:00') order by day)
       from generate_series(1, 7) day where day <> 7),
      0
    )::text$sql$,
    (select id from person_ids where label = 'efua')
  )
);

select public._as(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_add_schedule_exception(%L, %L, null, date %L, date %L, null, null)::text',
    (select id from person_ids where label = 'efua'),
    'off_day_swap',
    '2026-11-15',
    '2026-11-09'
  )
);

select public._as(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_add_schedule_exception(%L, %L, date %L, null, null, null, null)::text',
    (select id from person_ids where label = 'efua'),
    'additional_leave',
    '2026-11-15'
  )
);

select public._as(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_add_schedule_exception(%L, %L, date %L, null, null, time %L, time %L)::text',
    (select id from person_ids where label = 'efua'),
    'off_day_work',
    '2026-11-22',
    '10:00',
    '14:00'
  )
);

select public._as(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_add_schedule_exception(%L, %L, date %L, null, null, time %L, time %L)::text',
    (select id from person_ids where label = 'efua'),
    'partial_absence',
    '2026-11-22',
    '12:00',
    '13:00'
  )
);

select public._expect(
  public._as(
    '11111111-1111-4111-8111-111111111111',
    format(
      'select starts_at::text from public.admin_professional_availability(%L, date %L)',
      (select id from person_ids where label = 'efua'),
      '2026-11-11'
    )
  ) = '09:00:00',
  'current wednesday hours'
);

select public._expect(
  public._as(
    '11111111-1111-4111-8111-111111111111',
    format(
      'select availability from public.admin_professional_availability(%L, date %L)',
      (select id from person_ids where label = 'efua'),
      '2026-11-15'
    )
  ) = 'additional_leave',
  'current leave remains'
);

select public._expect(
  private.ghana_today() = (pg_catalog.clock_timestamp() at time zone 'Africa/Accra')::date,
  'ghana today uses Accra'
);

select public._expect(
  position('Africa/Accra' in pg_get_functiondef('private.ghana_today()'::regprocedure)) > 0,
  'ghana today is pinned'
);

do $$
begin
  perform set_config('TimeZone', 'Pacific/Kiritimati', true);
  if private.ghana_today() is distinct from (pg_catalog.clock_timestamp() at time zone 'Africa/Accra')::date then
    raise exception 'failed: ghana today followed the session time zone';
  end if;
end
$$;

insert into person_ids (label, id)
values (
  'nia',
  public._as(
    '11111111-1111-4111-8111-111111111111',
    $$select public.admin_create_professional(
      'Nia Owusu', 'Nia', null, null, 'accra', false, false
    )::text$$
  )::uuid
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_create_professional_transfer(%L, %L, %L)',
    (select id from person_ids where label = 'nia'),
    'kumasi',
    private.ghana_today()
  ),
  'an inactive professional cannot be transferred'
);

select public._expect_error(
  '22222222-2222-4222-8222-222222222222',
  format(
    'select public.admin_create_professional_transfer(%L, %L, %L)',
    (select id from person_ids where label = 'efua'),
    'kumasi',
    private.ghana_today() + 40
  ),
  'not authorized'
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_create_professional_transfer(%L, %L, %L)',
    (select id from person_ids where label = 'efua'),
    'accra',
    private.ghana_today() + 40
  ),
  'choose a different studio'
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_create_professional_transfer(%L, %L, %L)',
    (select id from person_ids where label = 'efua'),
    'tamale',
    private.ghana_today() + 40
  ),
  'unknown studio'
);

insert into transfer_ids (label, id)
values (
  'efua',
  public._as(
    '11111111-1111-4111-8111-111111111111',
    format(
      'select public.admin_create_professional_transfer(%L, %L, %L)::text',
      (select id from person_ids where label = 'efua'),
      'kumasi',
      private.ghana_today() + 40
    )
  )::uuid
);

select public._expect(
  (
    select status = 'draft'
      and source_branch_id = 'accra'
      and destination_branch_id = 'kumasi'
      and revision = 1
      and effective_on = private.ghana_today() + 40
    from public.professional_transfers
    where id = (select id from transfer_ids where label = 'efua')
  ),
  'draft records the current studio'
);

select public._expect(
  (
    select count(*) = 1
    from public.professional_branch_assignments
    where professional_id = (select id from person_ids where label = 'efua')
      and is_active
      and branch_id = 'accra'
  ),
  'a draft is not an active assignment'
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_create_professional_transfer(%L, %L, %L)',
    (select id from person_ids where label = 'efua'),
    'kumasi',
    private.ghana_today() + 40
  ),
  'that professional already has an open transfer'
);

select public._as(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_submit_professional_transfer(%L, %s)::text',
    (select id from transfer_ids where label = 'efua'),
    (select revision from public.professional_transfers where id = (select id from transfer_ids where label = 'efua'))
  )
);

select public._expect_error(
  '22222222-2222-4222-8222-222222222222',
  format(
    'select public.admin_save_transfer_schedule(%L, 2, %L, %L::jsonb, 0)',
    (select id from transfer_ids where label = 'efua'),
    'draft',
    '[]'
  ),
  'not authorized'
);

select public._expect_error(
  '33333333-3333-4333-8333-333333333333',
  format(
    $sql$select public.admin_save_transfer_schedule(
      %L, 2, 'complete',
      (select jsonb_agg(jsonb_build_object('weekday', day, 'kind', 'shift', 'starts', '10:00', 'ends', '12:00') order by day)
       from generate_series(1, 7) day where day = 1),
      0
    )$sql$,
    (select id from transfer_ids where label = 'efua')
  ),
  'enter working hours for every working day'
);

select public._as(
  '33333333-3333-4333-8333-333333333333',
  format(
    'select public.admin_save_transfer_schedule(%L, 2, %L, %L::jsonb, 0)::text',
    (select id from transfer_ids where label = 'efua'),
    'draft',
    '[]'
  )
);

select public._expect(
  (
    select schedule.status = 'draft' and schedule.off_weekday = 2 and schedule.revision = 1
    from public.professional_transfer_schedules schedule
    where schedule.transfer_id = (select id from transfer_ids where label = 'efua')
  ),
  'destination draft is stored'
);

select public._expect(
  not exists (
    select 1
    from public.professional_weekly_intervals slot
    where slot.professional_id = (select id from person_ids where label = 'efua')
      and slot.starts_at = time '10:00'
  ),
  'destination draft does not replace current hours'
);

select public._expect(
  public._as(
    '11111111-1111-4111-8111-111111111111',
    format(
      'select starts_at::text from public.admin_professional_availability(%L, date %L)',
      (select id from person_ids where label = 'efua'),
      '2026-11-11'
    )
  ) = '09:00:00',
  'public availability ignores the destination draft'
);

select public._as(
  '11111111-1111-4111-8111-111111111111',
  format(
    $sql$select public.admin_save_transfer_schedule(
      %L, 2, 'complete',
      (select jsonb_agg(jsonb_build_object('weekday', day, 'kind', 'shift', 'starts', '10:00', 'ends', '16:00') order by day)
       from generate_series(1, 7) day where day <> 2),
      %s
    )::text$sql$,
    (select id from transfer_ids where label = 'efua'),
    (select revision from public.professional_transfer_schedules where transfer_id = (select id from transfer_ids where label = 'efua'))
  )
);

select public._expect_error(
  '33333333-3333-4333-8333-333333333333',
  format(
    'select public.admin_approve_professional_transfer(%L, %s)',
    (select id from transfer_ids where label = 'efua'),
    (select revision from public.professional_transfers where id = (select id from transfer_ids where label = 'efua'))
  ),
  'not authorized'
);

select public._as(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_approve_professional_transfer(%L, %s)::text',
    (select id from transfer_ids where label = 'efua'),
    (select revision from public.professional_transfers where id = (select id from transfer_ids where label = 'efua'))
  )
);

select public._expect(
  (
    select status = 'ready'
      and approved_by = '11111111-1111-4111-8111-111111111111'
      and activated_at is null
    from public.professional_transfers
    where id = (select id from transfer_ids where label = 'efua')
  )
  and (
    select branch_id = 'accra'
    from public.professional_branch_assignments
    where professional_id = (select id from person_ids where label = 'efua')
      and is_active
  ),
  'approval does not activate'
);

select public._expect(
  public._as(
    '11111111-1111-4111-8111-111111111111',
    format('select status from public.admin_list_professional_transfers(null) where id = %L', (select id from transfer_ids where label = 'efua'))
  ) = 'ready',
  'listing a transfer does not activate it'
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_activate_professional_transfer(%L, %s)',
    (select id from transfer_ids where label = 'efua'),
    (select revision from public.professional_transfers where id = (select id from transfer_ids where label = 'efua'))
  ),
  'a transfer cannot be activated before its effective date'
);

select public._expect(
  (select status = 'ready' from public.professional_transfers where id = (select id from transfer_ids where label = 'efua')),
  'early activation changes nothing'
);

select public._as(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_update_professional_transfer(%L, %L, %L, %s)::text',
    (select id from transfer_ids where label = 'efua'),
    'kumasi',
    private.ghana_today(),
    (select revision from public.professional_transfers where id = (select id from transfer_ids where label = 'efua'))
  )
);

select public._expect(
  (
    select status = 'pending_preparation'
      and approved_by is null
      and approved_at is null
      and effective_on = private.ghana_today()
    from public.professional_transfers
    where id = (select id from transfer_ids where label = 'efua')
  )
  and (
    select count(*) = 1
    from public.professional_transfer_events
    where transfer_id = (select id from transfer_ids where label = 'efua')
      and action = 'transfer_approved'
  )
  and (
    select previous_state ->> 'approved_at' is not null
    from public.professional_transfer_events
    where transfer_id = (select id from transfer_ids where label = 'efua')
      and action = 'transfer_updated'
    order by created_at desc
    limit 1
  ),
  'changing the effective date withdraws approval and keeps the approval event'
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_activate_professional_transfer(%L, %s)',
    (select id from transfer_ids where label = 'efua'),
    (select revision from public.professional_transfers where id = (select id from transfer_ids where label = 'efua'))
  ),
  'approve the transfer before activation'
);

select public._as(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_approve_professional_transfer(%L, %s)::text',
    (select id from transfer_ids where label = 'efua'),
    (select revision from public.professional_transfers where id = (select id from transfer_ids where label = 'efua'))
  )
);

select public._expect(
  (
    select count(*) = 2
    from public.professional_transfer_events
    where transfer_id = (select id from transfer_ids where label = 'efua')
      and action = 'transfer_approved'
  ),
  'reapproval appends a second approval event'
);

select public._as(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_update_professional_transfer(%L, %L, %L, %s)::text',
    (select id from transfer_ids where label = 'efua'),
    'kumasi',
    private.ghana_today(),
    (select revision from public.professional_transfers where id = (select id from transfer_ids where label = 'efua'))
  )
);

select public._expect(
  (
    select status = 'ready'
      and approved_by = '11111111-1111-4111-8111-111111111111'
      and effective_on = private.ghana_today()
    from public.professional_transfers
    where id = (select id from transfer_ids where label = 'efua')
  ),
  'saving the same effective date keeps approval'
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_update_professional_transfer(%L, %L, %L, %s)',
    (select id from transfer_ids where label = 'efua'),
    'accra',
    private.ghana_today() + 1,
    (select revision from public.professional_transfers where id = (select id from transfer_ids where label = 'efua'))
  ),
  'the destination studio can be changed only while the transfer is a draft'
);

select public._expect(
  (
    select status = 'ready'
      and approved_by = '11111111-1111-4111-8111-111111111111'
      and effective_on = private.ghana_today()
    from public.professional_transfers
    where id = (select id from transfer_ids where label = 'efua')
  ),
  'a destination change cannot carry a new effective date through'
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_activate_professional_transfer(%L, %s)',
    (select id from transfer_ids where label = 'efua'),
    (select revision from public.professional_transfers where id = (select id from transfer_ids where label = 'efua'))
  ),
  'transfer activation is blocked until booking conflicts can be checked'
);

create or replace function private.transfer_booking_conflicts(
  person uuid,
  source_branch text,
  destination_branch text,
  effective_on date
)
returns table (appointment_id uuid)
language sql
security invoker
as $$
  select null::uuid where false;
$$;

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_activate_professional_transfer(%L, %s)',
    (select id from transfer_ids where label = 'efua'),
    (select revision from public.professional_transfers where id = (select id from transfer_ids where label = 'efua'))
  ),
  'transfer activation is blocked until booking conflicts can be checked'
);

do $$
begin
  insert into private.transfer_booking_readiness (mode, integration_id, approved_definition)
  values (
    'enforced',
    'allure_booking_conflict_v1',
    pg_get_functiondef('private.transfer_booking_conflicts(uuid,text,text,date)'::regprocedure)
  );
  raise exception 'an unmarked conflict function was accepted';
exception
  when check_violation then
    null;
end
$$;

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
as $guard$
begin
  -- allure_booking_ledger_query
  return query
  select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
  where person is not null
    and source_branch is not null
    and destination_branch is not null
    and effective_on is not null;
end;
$guard$;

insert into private.transfer_booking_readiness (mode, integration_id, approved_definition)
values (
  'enforced',
  'allure_booking_conflict_v1',
  pg_get_functiondef('private.transfer_booking_conflicts(uuid,text,text,date)'::regprocedure)
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_activate_professional_transfer(%L, %s)',
    (select id from transfer_ids where label = 'efua'),
    (select revision from public.professional_transfers where id = (select id from transfer_ids where label = 'efua'))
  ),
  'the transfer conflicts with an existing appointment'
);

select public._expect(
  (select status = 'ready' from public.professional_transfers where id = (select id from transfer_ids where label = 'efua'))
  and (
    select branch_id = 'accra' and is_active
    from public.professional_branch_assignments
    where professional_id = (select id from person_ids where label = 'efua')
      and is_active
  )
  and (
    select off_weekday = 7
    from public.professional_weekly_schedules
    where professional_id = (select id from person_ids where label = 'efua')
  )
  and (
    select count(*) = 4
    from public.professional_schedule_exceptions
    where professional_id = (select id from person_ids where label = 'efua')
  ),
  'a verified booking conflict rolls the activation back'
);

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
as $guard$
begin
  -- allure_booking_ledger_query
  return;
end;
$guard$;

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_activate_professional_transfer(%L, %s)',
    (select id from transfer_ids where label = 'efua'),
    (select revision from public.professional_transfers where id = (select id from transfer_ids where label = 'efua'))
  ),
  'transfer activation is blocked until booking conflicts can be checked'
);

delete from private.transfer_booking_readiness;

select set_config('allure.booking_ready', 'local_pre_booking', true);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_activate_professional_transfer(%L, %s)',
    (select id from transfer_ids where label = 'efua'),
    (select revision from public.professional_transfers where id = (select id from transfer_ids where label = 'efua'))
  ),
  'transfer activation is blocked until booking conflicts can be checked'
);

do $$
begin
  perform set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"33333333-3333-4333-8333-333333333333"}',
    true
  );
  set local role authenticated;
  insert into private.transfer_booking_readiness (mode, integration_id, approved_definition)
  values ('local_pre_booking', 'allure_local_pre_booking_v1', 'local-pre-booking-no-ledger');
  reset role;
  raise exception 'an api role wrote booking readiness';
exception
  when insufficient_privilege then
    reset role;
end
$$;

do $$
begin
  insert into private.transfer_booking_readiness (mode, integration_id, approved_definition)
  values ('local_pre_booking', 'allure_local_pre_booking_v1', 'not-the-sentinel');
  raise exception 'a mistyped local contract was accepted';
exception
  when check_violation then
    null;
end
$$;

insert into private.transfer_booking_readiness (mode, integration_id, approved_definition)
values ('local_pre_booking', 'allure_local_pre_booking_v1', 'local-pre-booking-no-ledger');

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
as $guard$
begin
  -- allure_booking_ledger_query
  return query select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid;
end;
$guard$;

select public._expect(
  private.transfer_booking_guard(
    (select id from person_ids where label = 'efua'),
    'accra',
    'kumasi',
    private.ghana_today()
  ) = 'local_pre_booking',
  'the local fixture does not treat another function as a booking check'
);

create or replace function public._audit_boom()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit rollback probe';
end;
$$;

create or replace function public._efua_fp()
returns text
language sql
as $$
  select concat_ws('|',
    (select is_listed::text || ':' || is_active::text from public.professionals where id = (select id from person_ids where label = 'efua')),
    (select string_agg(branch_id || ':' || is_active::text || ':' || coalesce(ended_on::text, '-'), ',' order by assigned_at)
     from public.professional_branch_assignments
     where professional_id = (select id from person_ids where label = 'efua')),
    (select off_weekday::text || ':' || status || ':' || revision::text
     from public.professional_weekly_schedules
     where professional_id = (select id from person_ids where label = 'efua')),
    (select count(*)::text from public.professional_schedule_exceptions
     where professional_id = (select id from person_ids where label = 'efua')),
    (select count(*)::text || ':' || coalesce(bool_and(is_active)::text, 'none')
     from public.professional_service_qualifications
     where professional_id = (select id from person_ids where label = 'efua')),
    (select status || ':' || revision::text from public.professional_transfers
     where id = (select id from transfer_ids where label = 'efua')),
    (select count(*)::text from public.professional_schedule_archives
     where transfer_id = (select id from transfer_ids where label = 'efua'))
  );
$$;

create temp table efua_fp (fp text);
insert into efua_fp values (public._efua_fp());

create trigger audit_probe_archive before insert on public.professional_schedule_archives
for each row execute function public._audit_boom();
select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_activate_professional_transfer(%L, %s)',
    (select id from transfer_ids where label = 'efua'),
    (select revision from public.professional_transfers where id = (select id from transfer_ids where label = 'efua'))
  ),
  'audit rollback probe'
);
drop trigger audit_probe_archive on public.professional_schedule_archives;
select public._expect(public._efua_fp() = (select fp from efua_fp), 'archive failure restores the transfer');

create trigger audit_probe_intervals before delete on public.professional_weekly_intervals
for each row execute function public._audit_boom();
select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_activate_professional_transfer(%L, %s)',
    (select id from transfer_ids where label = 'efua'),
    (select revision from public.professional_transfers where id = (select id from transfer_ids where label = 'efua'))
  ),
  'audit rollback probe'
);
drop trigger audit_probe_intervals on public.professional_weekly_intervals;
select public._expect(public._efua_fp() = (select fp from efua_fp), 'schedule replacement failure restores the archive');

create trigger audit_probe_assignment before update on public.professional_branch_assignments
for each row execute function public._audit_boom();
select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_activate_professional_transfer(%L, %s)',
    (select id from transfer_ids where label = 'efua'),
    (select revision from public.professional_transfers where id = (select id from transfer_ids where label = 'efua'))
  ),
  'audit rollback probe'
);
drop trigger audit_probe_assignment on public.professional_branch_assignments;
select public._expect(public._efua_fp() = (select fp from efua_fp), 'assignment failure restores the schedule');

create trigger audit_probe_audit before insert on public.professional_audit_events
for each row execute function public._audit_boom();
select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_activate_professional_transfer(%L, %s)',
    (select id from transfer_ids where label = 'efua'),
    (select revision from public.professional_transfers where id = (select id from transfer_ids where label = 'efua'))
  ),
  'audit rollback probe'
);
drop trigger audit_probe_audit on public.professional_audit_events;
select public._expect(public._efua_fp() = (select fp from efua_fp), 'audit failure restores the assignment and listing');

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_activate_professional_transfer(%L, 0)',
    (select id from transfer_ids where label = 'efua')
  ),
  'this transfer has changed since you opened it'
);

select public._as(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_activate_professional_transfer(%L, %s)::text',
    (select id from transfer_ids where label = 'efua'),
    (select revision from public.professional_transfers where id = (select id from transfer_ids where label = 'efua'))
  )
);

select public._expect(
  (
    select status = 'completed'
      and activated_by = '11111111-1111-4111-8111-111111111111'
      and effective_on = private.ghana_today()
    from public.professional_transfers
    where id = (select id from transfer_ids where label = 'efua')
  ),
  'activation completes the transfer'
);

select public._expect(
  (
    select count(*) = 1
      and bool_and(branch_id = 'kumasi' and is_active and ended_on is null)
    from public.professional_branch_assignments
    where professional_id = (select id from person_ids where label = 'efua')
      and is_active
  )
  and (
    select count(*) = 1
      and bool_and(branch_id = 'accra' and not is_active and ended_on = private.ghana_today())
    from public.professional_branch_assignments
    where professional_id = (select id from person_ids where label = 'efua')
      and not is_active
  ),
  'source assignment ends and destination assignment starts'
);

select public._expect(
  (
    select is_listed = false
    from public.professionals
    where id = (select id from person_ids where label = 'efua')
  )
  and exists (
    select 1
    from public.professional_audit_events event
    where event.professional_id = (select id from person_ids where label = 'efua')
      and event.action = 'listing_disabled'
  )
  and exists (
    select 1
    from public.professional_audit_events event
    where event.professional_id = (select id from person_ids where label = 'efua')
      and event.action = 'studio_assigned'
      and event.branch_id = 'kumasi'
  ),
  'listing is cleared and the destination assignment is audited'
);

select public._expect(
  (
    select count(*) = 1 and bool_and(is_active)
    from public.professional_service_qualifications
    where professional_id = (select id from person_ids where label = 'efua')
      and service_id = 'svc_mink_lash_extensions'
  )
  and (select count(*) from public.branch_services) = (select amount from markers_offerings),
  'qualifications stay and no studio offering is created'
);

select public._expect(
  (
    select off_weekday = 2 and status = 'complete'
    from public.professional_weekly_schedules
    where professional_id = (select id from person_ids where label = 'efua')
  )
  and not exists (
    select 1
    from public.professional_schedule_exceptions
    where professional_id = (select id from person_ids where label = 'efua')
  )
  and not exists (
    select 1
    from public.professional_weekly_intervals
    where professional_id = (select id from person_ids where label = 'efua')
      and starts_at = time '09:00'
  )
  and exists (
    select 1
    from public.professional_weekly_intervals
    where professional_id = (select id from person_ids where label = 'efua')
      and starts_at = time '10:00'
      and weekday = 1
  ),
  'destination hours replace the operational week'
);

select public._expect(
  (
    select schedule_state -> 'week' ->> 'off_weekday' = '7'
      and schedule_state ->> 'exceptions' like '%additional_leave%'
      and schedule_state ->> 'exceptions' like '%2026-11-15%'
      and schedule_state ->> 'exceptions' like '%off_day_work%'
    from public.professional_schedule_archives
    where transfer_id = (select id from transfer_ids where label = 'efua')
  ),
  'source schedule and exceptions stay readable'
);

select public._expect(
  public._as(
    '11111111-1111-4111-8111-111111111111',
    format(
      'select starts_at::text from public.admin_professional_availability(%L, date %L)',
      (select id from person_ids where label = 'efua'),
      '2026-11-11'
    )
  ) = '10:00:00'
  and public._as(
    '11111111-1111-4111-8111-111111111111',
    format(
      'select availability from public.admin_professional_availability(%L, date %L)',
      (select id from person_ids where label = 'efua'),
      '2026-11-15'
    )
  ) = 'working',
  'old exceptions are not active after activation'
);

select public._expect(
  (
    select new_state ->> 'booking_guard' = 'local_pre_booking'
    from public.professional_transfer_events
    where transfer_id = (select id from transfer_ids where label = 'efua')
      and action = 'transfer_activated'
  ),
  'activation records the local pre-booking fixture'
);

do $$
begin
  update public.professional_schedule_archives
  set schedule_state = schedule_state
  where transfer_id = (select id from transfer_ids where label = 'efua');
  raise exception 'archive update was allowed';
exception
  when others then
    if sqlerrm is distinct from 'audit events are append-only' then
      raise;
    end if;
end
$$;

do $$
begin
  delete from public.professional_transfers
  where id = (select id from transfer_ids where label = 'efua');
  raise exception 'transfer delete was allowed';
exception
  when others then
    if sqlerrm is distinct from 'a transfer cannot be deleted' then
      raise;
    end if;
end
$$;

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_cancel_professional_transfer(%L, %L, %s)',
    (select id from transfer_ids where label = 'efua'),
    'too late',
    (select revision from public.professional_transfers where id = (select id from transfer_ids where label = 'efua'))
  ),
  'a finished transfer cannot be changed'
);

insert into person_ids (label, id)
values (
  'akosua',
  public._as(
    '11111111-1111-4111-8111-111111111111',
    $$select public.admin_create_professional(
      'Akosua Mensah', 'Akosua', null, null, 'kumasi', true, false
    )::text$$
  )::uuid
);

insert into transfer_ids (label, id)
values (
  'akosua',
  public._as(
    '11111111-1111-4111-8111-111111111111',
    format(
      'select public.admin_create_professional_transfer(%L, %L, %L)::text',
      (select id from person_ids where label = 'akosua'),
      'accra',
      private.ghana_today()
    )
  )::uuid
);

select public._expect_error(
  '33333333-3333-4333-8333-333333333333',
  format(
    'select public.admin_cancel_professional_transfer(%L, null, %s)',
    (select id from transfer_ids where label = 'akosua'),
    (select revision from public.professional_transfers where id = (select id from transfer_ids where label = 'akosua'))
  ),
  'not authorized'
);

select public._expect_error(
  '44444444-4444-4444-8444-444444444444',
  'select public.admin_list_professional_transfers(null)',
  'not authorized'
);

select public._expect(
  public._as(
    '22222222-2222-4222-8222-222222222222',
    format(
      'select count(*)::text from public.admin_list_professional_transfers(null) where id = %L',
      (select id from transfer_ids where label = 'akosua')
    )
  ) = '1',
  'destination manager can view the incoming transfer'
);

select public._as(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_cancel_professional_transfer(%L, %L, %s)::text',
    (select id from transfer_ids where label = 'akosua'),
    'Plans changed',
    (select revision from public.professional_transfers where id = (select id from transfer_ids where label = 'akosua'))
  )
);

select public._expect(
  (
    select status = 'cancelled' and cancellation_reason = 'Plans changed'
    from public.professional_transfers
    where id = (select id from transfer_ids where label = 'akosua')
  )
  and (
    select branch_id = 'kumasi'
    from public.professional_branch_assignments
    where professional_id = (select id from person_ids where label = 'akosua')
      and is_active
  ),
  'cancellation is terminal and leaves the studio unchanged'
);

select public._expect(
  public._as(
    '11111111-1111-4111-8111-111111111111',
    format(
      'select public.admin_create_professional_transfer(%L, %L, %L)::text',
      (select id from person_ids where label = 'akosua'),
      'accra',
      private.ghana_today()
    )
  ) is not null,
  'a cancelled transfer does not block a later transfer'
);

select public._expect(
  position('lock_professional_writes' in pg_get_functiondef('public.admin_activate_professional_transfer(uuid,bigint)'::regprocedure))
    < position('require_active_owner' in pg_get_functiondef('public.admin_activate_professional_transfer(uuid,bigint)'::regprocedure))
  and position('transfer_booking_guard' in pg_get_functiondef('public.admin_activate_professional_transfer(uuid,bigint)'::regprocedure))
    < position('archive_operational_schedule' in pg_get_functiondef('public.admin_activate_professional_transfer(uuid,bigint)'::regprocedure))
  and position('lock_admin_changes' in pg_get_functiondef('private.lock_professional_writes()'::regprocedure))
    < position('lock_professional_changes' in pg_get_functiondef('private.lock_professional_writes()'::regprocedure)),
  'activation locks staff, then the professional, then checks bookings'
);

select public._expect(
  exists (
    select 1
    from pg_catalog.pg_index index_row
    join pg_catalog.pg_class relation on relation.oid = index_row.indexrelid
    where relation.relname = 'professional_transfers_one_open'
  ),
  'one open transfer is enforced'
);

insert into person_ids (label, id)
values (
  'adwoa',
  public._as(
    '11111111-1111-4111-8111-111111111111',
    $$select public.admin_create_professional(
      'Adwoa Mensah', 'Adwoa', null, null, 'accra', true, false
    )::text$$
  )::uuid
);

insert into transfer_ids (label, id)
values (
  'adwoa',
  public._as(
    '11111111-1111-4111-8111-111111111111',
    format(
      'select public.admin_create_professional_transfer(%L, %L, %L)::text',
      (select id from person_ids where label = 'adwoa'),
      'kumasi',
      private.ghana_today()
    )
  )::uuid
);

select public._as(
  '11111111-1111-4111-8111-111111111111',
  format('select public.admin_submit_professional_transfer(%L, 1)::text', (select id from transfer_ids where label = 'adwoa'))
);

select public._as(
  '11111111-1111-4111-8111-111111111111',
  format(
    $sql$select public.admin_save_transfer_schedule(
      %L, 2, 'complete',
      (select jsonb_agg(jsonb_build_object('weekday', day, 'kind', 'shift', 'starts', '10:00', 'ends', '16:00') order by day)
       from generate_series(1, 7) day where day <> 2),
      0
    )::text$sql$,
    (select id from transfer_ids where label = 'adwoa')
  )
);

select public._as(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_approve_professional_transfer(%L, %s)::text',
    (select id from transfer_ids where label = 'adwoa'),
    (select revision from public.professional_transfers where id = (select id from transfer_ids where label = 'adwoa'))
  )
);

select public._as(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_cancel_professional_transfer(%L, %L, %s)::text',
    (select id from transfer_ids where label = 'adwoa'),
    'Approved transfer withdrawn',
    (select revision from public.professional_transfers where id = (select id from transfer_ids where label = 'adwoa'))
  )
);

select public._expect(
  (
    select status = 'cancelled'
      and approved_by = '11111111-1111-4111-8111-111111111111'
      and cancellation_reason = 'Approved transfer withdrawn'
    from public.professional_transfers
    where id = (select id from transfer_ids where label = 'adwoa')
  )
  and (
    select branch_id = 'accra'
    from public.professional_branch_assignments
    where professional_id = (select id from person_ids where label = 'adwoa')
      and is_active
  ),
  'cancelling an approved transfer keeps the approval and the studio'
);

select 'professional transfer sql tests passed';
