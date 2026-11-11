-- Local weekly-schedule assertions.
-- Run only against a throwaway database after catalogue, branches, admin access,
-- service management, manager management, professional management, and
-- 20261109150000_professional_scheduling.sql.
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

create or replace function public._owner(statement text)
returns text
language plpgsql
as $$
declare
  result text;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"11111111-1111-4111-8111-111111111111"}',
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

select public._owner($$select public.grant_manager('22222222-2222-4222-8222-222222222222')::text$$);
select public._owner($$select public.assign_manager_branch('22222222-2222-4222-8222-222222222222', 'accra')::text$$);
select public._owner($$select public.grant_manager('33333333-3333-4333-8333-333333333333')::text$$);
select public._owner($$select public.assign_manager_branch('33333333-3333-4333-8333-333333333333', 'kumasi')::text$$);

create temp table person_ids (
  label text primary key,
  id uuid not null
);

grant select on table person_ids to authenticated;

insert into person_ids (label, id)
values
  (
    'ama',
    public._owner($$
      select public.admin_create_professional(
        'Ama Mensah', 'Ama', 'Lash artist at the Accra studio.', null, 'accra', true, false
      )::text
    $$)::uuid
  ),
  (
    'kojo',
    public._owner($$
      select public.admin_create_professional(
        'Kojo Mensah', 'Kojo', null, null, 'kumasi', true, false
      )::text
    $$)::uuid
  );

select public._expect(
  (
    select column_default is null
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'professional_weekly_schedules'
      and column_name = 'off_weekday'
  ),
  'the regular off-day has no default'
);

select public._expect(
  (select count(*) = 0 from public.professional_weekly_schedules),
  'creating a professional does not assign an off-day'
);

select public._expect(
  public._owner($$
    select availability
    from public.admin_professional_availability(
      (select id from person_ids where label = 'ama'),
      '2026-11-15'
    )
  $$) = 'incomplete',
  'a missing schedule is not Sunday off or available'
);

select public._expect_error(
  '22222222-2222-4222-8222-222222222222',
  $$select public.admin_save_weekly_schedule(
    (select id from person_ids where label = 'ama'),
    null,
    'draft',
    '[]'::jsonb,
    0
  )$$,
  'choose a regular off-day'
);

select public._expect_error(
  '22222222-2222-4222-8222-222222222222',
  $$select public.admin_save_weekly_schedule(
    (select id from person_ids where label = 'ama'),
    3,
    'complete',
    '[{"weekday":1,"kind":"shift","starts":"09:00","ends":"17:00"}]'::jsonb,
    0
  )$$,
  'enter working hours for every working day'
);

select public._expect(
  (select count(*) = 0 from public.professional_weekly_schedules),
  'a rejected schedule still has no automatic off-day'
);

select public._owner($$
  select public.admin_save_weekly_schedule(
    (select id from person_ids where label = 'ama'),
    3,
    'draft',
    '[{"weekday":1,"kind":"shift","starts":"09:00","ends":"17:00"}]'::jsonb,
    0
  )::text
$$);

select public._expect(
  public._owner($$
    select availability
    from public.admin_professional_availability(
      (select id from person_ids where label = 'ama'),
      '2026-11-09'
    )
  $$) = 'incomplete',
  'a draft with some hours is not customer availability'
);

select public._expect_error(
  '33333333-3333-4333-8333-333333333333',
  $$select public.admin_save_weekly_schedule(
    (select id from person_ids where label = 'ama'),
    3,
    'draft',
    '[]'::jsonb,
    0
  )$$,
  'not authorized'
);

select public._expect_error(
  '44444444-4444-4444-8444-444444444444',
  $$select public.admin_save_weekly_schedule(
    (select id from person_ids where label = 'ama'),
    1,
    'draft',
    '[]'::jsonb,
    0
  )$$,
  'not authorized'
);

select public._owner($$
  select public.admin_save_weekly_schedule(
    (select id from person_ids where label = 'ama'),
    3,
    'complete',
    '[
      {"weekday":1,"kind":"shift","starts":"09:00","ends":"17:00"},
      {"weekday":1,"kind":"break","starts":"13:00","ends":"14:00"},
      {"weekday":2,"kind":"shift","starts":"09:00","ends":"17:00"},
      {"weekday":4,"kind":"shift","starts":"09:00","ends":"17:00"},
      {"weekday":5,"kind":"shift","starts":"09:00","ends":"17:00"},
      {"weekday":6,"kind":"shift","starts":"09:00","ends":"17:00"},
      {"weekday":7,"kind":"shift","starts":"09:00","ends":"17:00"}
    ]'::jsonb,
    1
  )::text
$$);

select public._expect(
  (
    select off_weekday = 3 and status = 'complete'
    from public.professional_weekly_schedules
    where professional_id = (select id from person_ids where label = 'ama')
  )
  and (
    select count(distinct weekday) = 6
    from public.professional_weekly_intervals
    where professional_id = (select id from person_ids where label = 'ama')
      and kind = 'shift'
  )
  and not exists (
    select 1
    from public.professional_weekly_intervals
    where professional_id = (select id from person_ids where label = 'ama')
      and weekday = 3
  ),
  'a completed week has exactly one regular off-day'
);

select public._owner($$
  select public.admin_save_weekly_schedule(
    (select id from person_ids where label = 'kojo'),
    1,
    'complete',
    '[
      {"weekday":2,"kind":"shift","starts":"09:00","ends":"17:00"},
      {"weekday":3,"kind":"shift","starts":"09:00","ends":"17:00"},
      {"weekday":4,"kind":"shift","starts":"09:00","ends":"17:00"},
      {"weekday":5,"kind":"shift","starts":"09:00","ends":"17:00"},
      {"weekday":6,"kind":"shift","starts":"09:00","ends":"17:00"},
      {"weekday":7,"kind":"shift","starts":"09:00","ends":"17:00"}
    ]'::jsonb,
    0
  )::text
$$);

select public._expect(
  (
    select off_weekday
    from public.professional_weekly_schedules
    where professional_id = (select id from person_ids where label = 'ama')
  ) is distinct from (
    select off_weekday
    from public.professional_weekly_schedules
    where professional_id = (select id from person_ids where label = 'kojo')
  ),
  'professionals can have different regular off-days'
);

select public._expect(
  public._owner($$
    select availability
    from public.admin_professional_availability(
      (select id from person_ids where label = 'ama'),
      '2026-11-11'
    )
  $$) = 'regular_off',
  'the chosen weekday is off'
);

select public._expect(
  public._owner($$
    select string_agg(
      availability || coalesce(' ' || starts_at::text || '-' || ends_at::text, ''),
      ' | ' order by starts_at nulls first
    )
    from public.admin_professional_availability(
      (select id from person_ids where label = 'ama'),
      '2026-11-09'
    )
  $$) = 'working 09:00:00-13:00:00 | working 14:00:00-17:00:00',
  'a working day keeps its shift and break'
);

select public._expect(
  public._owner($$
    select availability
    from public.admin_professional_availability(
      (select id from person_ids where label = 'kojo'),
      '2026-11-09'
    )
  $$) = 'regular_off'
  and public._owner($$
    select availability
    from public.admin_professional_availability(
      (select id from person_ids where label = 'kojo'),
      '2026-11-15'
    )
  $$) = 'working',
  'Sunday is a working day when it was not chosen as the off-day'
);

select public._owner($$
  select public.admin_save_weekly_schedule(
    (select id from person_ids where label = 'kojo'),
    5,
    'draft',
    '[
      {"weekday":1,"kind":"shift","starts":"09:00","ends":"17:00"},
      {"weekday":2,"kind":"shift","starts":"09:00","ends":"17:00"},
      {"weekday":3,"kind":"shift","starts":"09:00","ends":"17:00"},
      {"weekday":4,"kind":"shift","starts":"09:00","ends":"17:00"},
      {"weekday":6,"kind":"shift","starts":"09:00","ends":"17:00"},
      {"weekday":7,"kind":"shift","starts":"09:00","ends":"17:00"}
    ]'::jsonb,
    1
  )::text
$$);

select public._expect(
  (
    select off_weekday = 5 and status = 'draft'
    from public.professional_weekly_schedules
    where professional_id = (select id from person_ids where label = 'kojo')
  )
  and public._owner($$
    select availability
    from public.admin_professional_availability(
      (select id from person_ids where label = 'kojo'),
      '2026-11-13'
    )
  $$) = 'incomplete',
  'changing the off-day can leave a draft, which is not availability'
);

select public._owner($$
  select public.admin_save_weekly_schedule(
    (select id from person_ids where label = 'kojo'),
    5,
    'complete',
    '[
      {"weekday":1,"kind":"shift","starts":"09:00","ends":"17:00"},
      {"weekday":2,"kind":"shift","starts":"09:00","ends":"17:00"},
      {"weekday":3,"kind":"shift","starts":"09:00","ends":"17:00"},
      {"weekday":4,"kind":"shift","starts":"09:00","ends":"17:00"},
      {"weekday":6,"kind":"shift","starts":"09:00","ends":"17:00"},
      {"weekday":7,"kind":"shift","starts":"09:00","ends":"17:00"}
    ]'::jsonb,
    2
  )::text
$$);

select public._expect(
  public._owner($$
    select availability
    from public.admin_professional_availability(
      (select id from person_ids where label = 'kojo'),
      '2026-11-13'
    )
  $$) = 'regular_off'
  and public._owner($$
    select availability
    from public.admin_professional_availability(
      (select id from person_ids where label = 'kojo'),
      '2026-11-09'
    )
  $$) = 'working',
  'the new regular off-day replaces the previous one'
);

select public._owner($$
  select public.admin_add_schedule_exception(
    (select id from person_ids where label = 'ama'),
    'additional_leave',
    '2026-11-12',
    null,
    null,
    null,
    null
  )::text
$$);

select public._expect(
  public._owner($$
    select availability
    from public.admin_professional_availability(
      (select id from person_ids where label = 'ama'),
      '2026-11-12'
    )
  $$) = 'additional_leave'
  and public._owner($$
    select availability
    from public.admin_professional_availability(
      (select id from person_ids where label = 'ama'),
      '2026-11-11'
    )
  $$) = 'regular_off',
  'additional leave is distinct from the regular off-day'
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  $$select public.admin_add_schedule_exception(
    (select id from person_ids where label = 'ama'),
    'additional_leave',
    '2026-11-11',
    null,
    null,
    null,
    null
  )$$,
  'that day is already off'
);

select public._owner($$
  select public.admin_add_schedule_exception(
    (select id from person_ids where label = 'ama'),
    'partial_absence',
    '2026-11-13',
    null,
    null,
    '15:00',
    '16:00'
  )::text
$$);

select public._expect(
  public._owner($$
    select string_agg(
      availability || coalesce(' ' || starts_at::text || '-' || ends_at::text, ''),
      ' | ' order by starts_at nulls first
    )
    from public.admin_professional_availability(
      (select id from person_ids where label = 'ama'),
      '2026-11-13'
    )
  $$) = 'partial_absence 09:00:00-15:00:00 | partial_absence 16:00:00-17:00:00',
  'a partial-day absence removes only that part of the shift'
);

select public._owner($$
  select public.admin_add_schedule_exception(
    (select id from person_ids where label = 'ama'),
    'special_hours',
    '2026-11-14',
    null,
    null,
    '11:00',
    '15:00'
  )::text
$$);

select public._expect(
  public._owner($$
    select availability || ' ' || starts_at::text || '-' || ends_at::text
    from public.admin_professional_availability(
      (select id from person_ids where label = 'ama'),
      '2026-11-14'
    )
  $$) = 'working 11:00:00-15:00:00',
  'special hours replace that date without changing the weekly off-day'
);

select public._owner($$
  select public.admin_add_schedule_exception(
    (select id from person_ids where label = 'ama'),
    'off_day_swap',
    null,
    '2026-11-11',
    '2026-11-09',
    null,
    null
  )::text
$$);

select public._expect(
  (
    select off_weekday = 3
    from public.professional_weekly_schedules
    where professional_id = (select id from person_ids where label = 'ama')
  )
  and public._owner($$
    select availability
    from public.admin_professional_availability(
      (select id from person_ids where label = 'ama'),
      '2026-11-09'
    )
  $$) = 'swap_off'
  and public._owner($$
    select string_agg(
      availability || coalesce(' ' || starts_at::text || '-' || ends_at::text, ''),
      ' | ' order by starts_at nulls first
    )
    from public.admin_professional_availability(
      (select id from person_ids where label = 'ama'),
      '2026-11-11'
    )
  $$) = 'working 09:00:00-13:00:00 | working 14:00:00-17:00:00',
  'a swap moves that week only and keeps the recurring off-day'
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  $$select public.admin_add_schedule_exception(
    (select id from person_ids where label = 'ama'),
    'off_day_work',
    '2026-11-09',
    null,
    null,
    '10:00',
    '14:00'
  )$$,
  'an off-day swap cannot remove both off-days'
);

select public._owner($$
  select public.admin_add_schedule_exception(
    (select id from person_ids where label = 'ama'),
    'off_day_work',
    '2026-11-18',
    null,
    null,
    '10:00',
    '14:00'
  )::text
$$);

select public._expect(
  public._owner($$
    select availability || ' ' || starts_at::text || '-' || ends_at::text
    from public.admin_professional_availability(
      (select id from person_ids where label = 'ama'),
      '2026-11-18'
    )
  $$) = 'off_day_work 10:00:00-14:00:00'
  and public._owner($$
    select availability
    from public.admin_professional_availability(
      (select id from person_ids where label = 'ama'),
      '2026-11-25'
    )
  $$) = 'regular_off',
  'approved work on an off-day is explicit and does not change the recurring week'
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  $$select public.admin_save_weekly_schedule(
    (select id from person_ids where label = 'ama'),
    4,
    'draft',
    '[]'::jsonb,
    2
  )$$,
  'remove off-day swaps before changing the regular off-day'
);

select public._expect(
  (
    select count(*) > 0
    from public.professional_audit_events
    where professional_id = (select id from person_ids where label = 'ama')
      and action = 'off_day_changed'
  )
  and (
    select count(*) > 0
    from public.professional_audit_events
    where professional_id = (select id from person_ids where label = 'kojo')
      and action = 'off_day_changed'
  )
  and (
    select count(*) > 0
    from public.professional_audit_events
    where action = 'schedule_exception_added'
  )
  and (
    select count(*) > 0
    from public.professional_audit_events
    where action = 'weekly_schedule_saved'
  ),
  'schedule and off-day changes are audited'
);

select public._expect(
  position('lock_admin_changes' in pg_get_functiondef('private.lock_professional_writes()'::regprocedure))
    < position('lock_professional_changes' in pg_get_functiondef('private.lock_professional_writes()'::regprocedure))
  and position(
    'lock_professional_writes' in pg_get_functiondef('public.admin_save_weekly_schedule(uuid,integer,text,jsonb,bigint)'::regprocedure)
  ) < position(
    'manage_branch' in pg_get_functiondef('public.admin_save_weekly_schedule(uuid,integer,text,jsonb,bigint)'::regprocedure)
  ),
  'schedule writes keep the staff lock before the professional lock'
);

do $$
begin
  insert into public.professional_weekly_schedules (professional_id, off_weekday)
  values ((select id from person_ids where label = 'ama'), 7);
  raise exception 'direct schedule insert succeeded';
exception
  when others then
    if sqlerrm is distinct from 'professional records cannot be changed directly' then
      raise;
    end if;
end
$$;

do $$
declare
  got text := 'no error';
begin
  begin
    set local role anon;
    perform public.admin_professional_availability(
      (select id from person_ids where label = 'ama'),
      '2026-11-11'
    );
    reset role;
  exception
    when others then
      got := sqlerrm;
      reset role;
  end;
  if got not like '%permission denied%' then
    raise exception 'anon could read availability: %', got;
  end if;
end
$$;

select public._expect(
  (
    select revision = 2 and off_weekday = 3 and status = 'complete'
    from public.professional_weekly_schedules
    where professional_id = (select id from person_ids where label = 'ama')
  )
  and (
    select revision = 3
    from public.professional_weekly_schedules
    where professional_id = (select id from person_ids where label = 'kojo')
  ),
  'each successful save increments the revision once'
);

select public._expect(
  public._owner($$
    select revision::text
    from public.admin_list_weekly_schedules('accra')
    where professional_id = (select id from person_ids where label = 'ama')
  $$) = '2',
  'the schedule list returns the current revision'
);

select public._expect(
  (
    select previous_state is null
      and new_state ->> 'off_weekday' = '3'
      and new_state ->> 'status' = 'draft'
      and new_state ->> 'revision' = '1'
      and jsonb_array_length(new_state -> 'shifts') = 1
      and actor_id = '11111111-1111-4111-8111-111111111111'
    from public.professional_schedule_changes
    where professional_id = (select id from person_ids where label = 'ama')
      and change_type = 'weekly_schedule_saved'
    order by created_at
    limit 1
  )
  and (
    select previous_state ->> 'revision' = '1'
      and new_state ->> 'revision' = '2'
      and new_state ->> 'status' = 'complete'
      and jsonb_array_length(new_state -> 'shifts') = 6
      and jsonb_array_length(new_state -> 'breaks') = 1
    from public.professional_schedule_changes
    where professional_id = (select id from person_ids where label = 'ama')
      and change_type = 'weekly_schedule_saved'
    order by created_at
    offset 1
    limit 1
  )
  and (
    select previous_state is null
      and new_state ->> 'kind' = 'additional_leave'
      and new_state ->> 'date' = '2026-11-12'
      and branch_id = 'accra'
    from public.professional_schedule_changes
    where professional_id = (select id from person_ids where label = 'ama')
      and change_type = 'schedule_exception_added'
      and new_state ->> 'kind' = 'additional_leave'
  ),
  'schedule history stores the previous and new week and the exception'
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  $$select public.admin_save_weekly_schedule(
    (select id from person_ids where label = 'ama'),
    3,
    'draft',
    '[{"weekday":1,"kind":"shift","starts":"08:00","ends":"08:30"}]'::jsonb,
    0
  )$$,
  'this schedule has changed since you opened it'
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  $$select public.admin_save_weekly_schedule(
    (select id from person_ids where label = 'ama'),
    3,
    'draft',
    '[]'::jsonb,
    null
  )$$,
  'this schedule has changed since you opened it'
);

do $$
declare
  got text := 'no error';
begin
  begin
    execute $call$
      select public.admin_save_weekly_schedule($1, 3, 'draft', '[]'::jsonb)
    $call$
    using (select id from person_ids where label = 'ama');
  exception
    when undefined_function then
      got := 'undefined_function';
    when others then
      got := sqlerrm;
  end;
  if got is distinct from 'undefined_function' then
    raise exception 'omitted revision was accepted: %', got;
  end if;
end
$$;

select public._expect(
  (
    select revision = 2 and off_weekday = 3 and status = 'complete'
    from public.professional_weekly_schedules
    where professional_id = (select id from person_ids where label = 'ama')
  )
  and (
    select count(*) = 2
    from public.professional_schedule_changes
    where professional_id = (select id from person_ids where label = 'ama')
      and change_type = 'weekly_schedule_saved'
  )
  and not exists (
    select 1
    from public.professional_weekly_intervals
    where professional_id = (select id from person_ids where label = 'ama')
      and starts_at = time '08:00'
  ),
  'a stale or omitted revision does not change the week or its history'
);

select public._expect_error(
  '33333333-3333-4333-8333-333333333333',
  $$select availability
    from public.admin_professional_availability(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '2026-11-11'
    )$$,
  'not authorized'
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  $$select availability
    from public.admin_professional_availability(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '2026-11-11'
    )$$,
  'professional does not exist'
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  $$select public.admin_add_schedule_exception(
    (select id from person_ids where label = 'ama'),
    'additional_leave',
    '2026-11-14',
    null,
    null,
    null,
    null
  )$$,
  'additional leave cannot share that date with other exceptions'
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  $$select public.admin_add_schedule_exception(
    (select id from person_ids where label = 'ama'),
    'special_hours',
    '2026-11-18',
    null,
    null,
    '11:00',
    '15:00'
  )$$,
  'special hours cannot share that date with approved off-day work'
);

select public._owner($$
  select public.admin_add_schedule_exception(
    (select id from person_ids where label = 'kojo'),
    'special_hours',
    '2026-11-10',
    null,
    null,
    '11:00',
    '15:00'
  )::text
$$);

select public._owner($$
  select public.admin_add_schedule_exception(
    (select id from person_ids where label = 'kojo'),
    'partial_absence',
    '2026-11-10',
    null,
    null,
    '12:00',
    '13:00'
  )::text
$$);

select public._expect(
  public._owner($$
    select string_agg(
      availability || coalesce(' ' || starts_at::text || '-' || ends_at::text, ''),
      ' | ' order by starts_at nulls first
    )
    from public.admin_professional_availability(
      (select id from person_ids where label = 'kojo'),
      '2026-11-10'
    )
  $$) = 'partial_absence 11:00:00-12:00:00 | partial_absence 13:00:00-15:00:00',
  'a partial absence can sit inside special hours'
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  $$select public.admin_add_schedule_exception(
    (select id from person_ids where label = 'kojo'),
    'additional_leave',
    '2026-11-10',
    null,
    null,
    null,
    null
  )$$,
  'additional leave cannot share that date with other exceptions'
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  $$select public.admin_add_schedule_exception(
    (select id from person_ids where label = 'kojo'),
    'off_day_swap',
    null,
    '2026-11-13',
    '2026-11-10',
    null,
    null
  )$$,
  'an off-day swap conflicts with an exception on that date'
);

select public._owner($$
  select public.admin_add_schedule_exception(
    (select id from person_ids where label = 'ama'),
    'partial_absence',
    '2026-11-18',
    null,
    null,
    '12:00',
    '13:00'
  )::text
$$);

select public._expect(
  public._owner($$
    select string_agg(
      availability || coalesce(' ' || starts_at::text || '-' || ends_at::text, ''),
      ' | ' order by starts_at nulls first
    )
    from public.admin_professional_availability(
      (select id from person_ids where label = 'ama'),
      '2026-11-18'
    )
  $$) = 'partial_absence 10:00:00-12:00:00 | partial_absence 13:00:00-14:00:00',
  'a partial absence can reduce approved off-day work'
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_remove_schedule_exception(%L)',
    (
      select id
      from public.professional_schedule_exceptions
      where professional_id = (select id from person_ids where label = 'ama')
        and kind = 'off_day_work'
        and exception_date = '2026-11-18'
    )
  ),
  'remove the partial absence before undoing approved off-day work'
);

select public._expect(
  ((timestamptz '2026-11-11 23:30:00+00') at time zone 'Africa/Accra')::date = date '2026-11-11'
  and ((timestamptz '2026-11-11 23:30:00+00') at time zone 'Asia/Tokyo')::date = date '2026-11-12'
  and ((timestamptz '2026-11-12 00:30:00+00') at time zone 'Africa/Accra')::date = date '2026-11-12'
  and ((timestamptz '2026-11-12 00:30:00+00') at time zone 'America/Los_Angeles')::date = date '2026-11-11'
  and (('2026-11-12'::date + time '09:00') at time zone 'Africa/Accra') = timestamptz '2026-11-12 09:00:00+00',
  'Africa/Accra dates stay stable across midnight and convert to UTC'
);

do $$
begin
  update public.professional_schedule_changes
  set change_type = 'weekly_schedule_saved'
  where false;
  update public.professional_schedule_changes
  set previous_state = previous_state;
  raise exception 'schedule history was updated';
exception
  when others then
    if sqlerrm is distinct from 'audit events are append-only' then
      raise;
    end if;
end
$$;

do $$
begin
  insert into public.professional_schedule_changes (
    professional_id, branch_id, actor_id, change_type, previous_state, new_state
  )
  values (
    (select id from person_ids where label = 'ama'),
    'accra',
    '11111111-1111-4111-8111-111111111111',
    'weekly_schedule_saved',
    null,
    '{}'::jsonb
  );
  raise exception 'direct schedule history insert succeeded';
exception
  when others then
    if sqlerrm is distinct from 'professional records cannot be changed directly' then
      raise;
    end if;
end
$$;

select 'professional scheduling sql tests passed';
