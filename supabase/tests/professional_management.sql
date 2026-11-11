-- Local professional-management assertions.
-- Run only against a throwaway database after catalogue, branches, admin access,
-- service management, manager management, and 20261109140000_professional_management.sql.
-- This file creates no Auth users beyond the throwaway cluster and is not a migration.

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'owner@allure.test'),
  ('22222222-2222-4222-8222-222222222222', 'accra.manager@allure.test'),
  ('33333333-3333-4333-8333-333333333333', 'kumasi.manager@allure.test');

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

create or replace function public._actor(actor uuid, statement text)
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

create or replace function public._anon(statement text)
returns text
language plpgsql
as $$
declare
  result text;
begin
  set local role anon;
  execute statement into result;
  reset role;
  return result;
exception
  when others then
    reset role;
    raise;
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

insert into person_ids (label, id)
values (
  'accra',
  public._owner($$
    select public.admin_create_professional(
      'Ama Mensah',
      'Ama',
      null,
      null,
      'accra',
      true,
      false
    )::text
  $$)::uuid
);

insert into person_ids (label, id)
values (
  'kumasi',
  public._owner($$
    select public.admin_create_professional(
      'Akua Boateng',
      null,
      null,
      null,
      'kumasi',
      true,
      false
    )::text
  $$)::uuid
);

select public._expect(
  (select count(*) from auth.users) = 3,
  'creating a professional does not create an Auth user'
);

select public._expect(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'professionals'
      and column_name in ('email', 'password', 'user_id')
  ),
  'professionals have no login fields'
);

select public._expect(
  to_regprocedure('public.admin_reassign_professional(uuid, text)') is null,
  'no professional transfer function'
);

select public._expect(
  public._owner($$select count(*)::text from public.admin_list_professionals(null)$$) = '2',
  'owner sees both studios'
);

select public._expect(
  public._owner($$select count(*)::text from public.admin_list_professionals('accra')$$) = '1',
  'owner can filter Accra'
);

select public._expect(
  public._actor(
    '22222222-2222-4222-8222-222222222222',
    $$select count(*)::text from public.admin_list_professionals(null)$$
  ) = '1',
  'Accra manager sees only Accra'
);

select public._expect(
  public._actor(
    '33333333-3333-4333-8333-333333333333',
    $$select branch_id from public.admin_list_professionals(null)$$
  ) = 'kumasi',
  'Kumasi manager sees only Kumasi'
);

select public._expect_error(
  '33333333-3333-4333-8333-333333333333',
  $$select public.admin_list_professionals('accra')$$,
  'not authorized'
);

select public._expect_error(
  '22222222-2222-4222-8222-222222222222',
  $$select public.admin_create_professional('Kojo Mensah', null, null, null, 'kumasi', true, false)$$,
  'not authorized'
);

select public._expect_error(
  '33333333-3333-4333-8333-333333333333',
  format(
    'select public.admin_update_professional_profile(%L::uuid, %L, %L, null, null)',
    (select id from person_ids where label = 'accra'),
    'Ama Mensah',
    'Ama'
  ),
  'not authorized'
);

select public._actor(
  '22222222-2222-4222-8222-222222222222',
  format(
    'select public.admin_update_professional_profile(%L::uuid, %L, %L, %L, null)::text',
    (select id from person_ids where label = 'accra'),
    'Ama Mensah',
    'Ama',
    'Lash artist at the Accra studio.'
  )
);

select public._expect(
  (
    select biography = 'Lash artist at the Accra studio.'
    from public.professionals
    where id = (select id from person_ids where label = 'accra')
  ),
  'Accra manager can edit a profile at Accra'
);

select public._expect(
  public._anon($$select count(*)::text from public.list_public_professionals(null, null)$$) = '0',
  'unlisted professionals stay hidden'
);

select public._owner(
  format(
    'select public.admin_set_professional_listed(%L::uuid, true)::text',
    (select id from person_ids where label = 'accra')
  )
);

select public._expect(
  public._anon($$select name from public.list_public_professionals('accra', null)$$) = 'Ama',
  'public name is the display name'
);

select public._expect(
  public._anon($$select count(*)::text from public.list_public_professionals('kumasi', null)$$) = '0',
  'public studio filter hides the other studio'
);

select public._expect(
  pg_get_function_result('public.list_public_professionals(text,text)'::regprocedure) not like '%full_name%'
    and pg_get_function_result('public.list_public_professionals(text,text)'::regprocedure) not like '%actor%'
    and pg_get_function_result('public.list_public_professionals(text,text)'::regprocedure) not like '%granted_by%'
    and pg_get_function_result('public.list_public_professionals(text,text)'::regprocedure) not like '%email%',
  'public result hides private fields'
);

select public._owner(
  format(
    'select public.admin_add_professional_qualification(%L::uuid, %L)::text',
    (select id from person_ids where label = 'accra'),
    'svc_cat_eye_volume'
  )
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_add_professional_qualification(%L::uuid, %L)',
    (select id from person_ids where label = 'accra'),
    'svc_cat_eye_volume'
  ),
  'qualification is already active'
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_add_professional_qualification(%L::uuid, %L)',
    (select id from person_ids where label = 'accra'),
    'svc_missing'
  ),
  'service does not exist'
);

select public._expect(
  public._anon(
    $$select count(*)::text from public.list_public_professionals(null, 'svc_cat_eye_volume')$$
  ) = '1',
  'public service filter returns a qualified professional'
);

select public._expect(
  public._anon(
    $$select count(*)::text from public.list_public_professionals(null, 'svc_bottom_lashes')$$
  ) = '0',
  'public service filter skips an unqualified professional'
);

select public._expect(
  (select count(*) from public.branch_services where service_id = 'svc_cat_eye_volume' and is_bookable) = 0,
  'qualification does not make a service bookable'
);

select public._owner(
  format(
    'select public.admin_remove_professional_qualification(%L::uuid, %L)::text',
    (select id from person_ids where label = 'accra'),
    'svc_cat_eye_volume'
  )
);

select public._expect(
  (
    select count(*) = 1 and bool_and(not is_active) and bool_and(revoked_at is not null)
    from public.professional_service_qualifications
    where professional_id = (select id from person_ids where label = 'accra')
  ),
  'removing a qualification keeps one historical row'
);

select public._owner(
  format(
    'select public.admin_add_professional_qualification(%L::uuid, %L)::text',
    (select id from person_ids where label = 'accra'),
    'svc_cat_eye_volume'
  )
);

select public._expect(
  (
    select count(*) = 1 and bool_and(is_active)
    from public.professional_service_qualifications
    where professional_id = (select id from person_ids where label = 'accra')
      and service_id = 'svc_cat_eye_volume'
  ),
  'adding a qualification again reuses the same row'
);

select public._owner(
  format(
    'select public.admin_add_professional_qualification(%L::uuid, %L)::text',
    (select id from person_ids where label = 'accra'),
    'svc_bottom_lashes'
  )
);

select public._expect(
  public._anon(
    format(
      'select (%L = any(service_ids))::text from public.list_public_professionals(null, null) where id = %L::uuid',
      'svc_bottom_lashes',
      (select id from person_ids where label = 'accra')
    )
  ) = 'true',
  'a listed service qualification is public'
);

update public.services
set is_listed = false
where id = 'svc_bottom_lashes';

select public._expect(
  (
    select is_active
    from public.professional_service_qualifications
    where professional_id = (select id from person_ids where label = 'accra')
      and service_id = 'svc_bottom_lashes'
  ),
  'unlisting a service keeps the qualification'
);

select public._expect(
  public._anon(
    format(
      'select (%L = any(service_ids))::text from public.list_public_professionals(null, null) where id = %L::uuid',
      'svc_bottom_lashes',
      (select id from person_ids where label = 'accra')
    )
  ) = 'false',
  'an unlisted service id is omitted from the public list'
);

select public._expect(
  public._anon(
    $$select count(*)::text from public.list_public_professionals('accra', 'svc_bottom_lashes')$$
  ) = '0',
  'filtering by an unlisted service returns nobody'
);

select public._expect(
  public._anon(
    $$select count(*)::text from public.list_public_professionals('accra', 'svc_cat_eye_volume')$$
  ) = '1',
  'studio and listed-service filters still match'
);

select public._expect(
  (select count(*) from public.branch_services where service_id = 'svc_bottom_lashes') = 0,
  'public filtering does not create a studio offering'
);

update public.services
set is_listed = true
where id = 'svc_bottom_lashes';

select public._owner(
  format(
    'select public.admin_set_professional_active(%L::uuid, false)::text',
    (select id from person_ids where label = 'accra')
  )
);

select public._expect(
  (
    select not person.is_active
      and not person.is_listed
      and assignment.is_active
      and assignment.branch_id = 'accra'
    from public.professionals person
    join public.professional_branch_assignments assignment
      on assignment.professional_id = person.id
    where person.id = (select id from person_ids where label = 'accra')
  ),
  'deactivation keeps the current studio'
);

select public._expect(
  public._anon($$select count(*)::text from public.list_public_professionals('accra', null)$$) = '0',
  'an inactive professional is not public'
);

select public._owner(
  format(
    'select public.admin_update_professional_profile(%L::uuid, %L, %L, %L, null)::text',
    (select id from person_ids where label = 'accra'),
    'Ama Mensah',
    'Ama',
    'Lash artist at the Accra studio.'
  )
);

select public._expect(
  (
    select not is_active and not is_listed
    from public.professionals
    where id = (select id from person_ids where label = 'accra')
  ),
  'a profile save does not reactivate or relist'
);

select public._expect_error(
  '22222222-2222-4222-8222-222222222222',
  format(
    'select public.admin_set_professional_listed(%L::uuid, true)',
    (select id from person_ids where label = 'accra')
  ),
  'an inactive professional cannot be publicly listed'
);

select public._owner(
  format(
    'select public.admin_set_professional_active(%L::uuid, true)::text',
    (select id from person_ids where label = 'accra')
  )
);

select public._expect(
  (
    select person.is_active
      and not person.is_listed
      and (select count(*) from public.professional_branch_assignments assignment where assignment.professional_id = person.id) = 1
      and assignment.branch_id = 'accra'
      and assignment.is_active
    from public.professionals person
    join public.professional_branch_assignments assignment
      on assignment.professional_id = person.id
    where person.id = (select id from person_ids where label = 'accra')
  ),
  'reactivation does not move the studio or list the professional'
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  $$select public.admin_create_professional('Kojo Mensah', null, null, null, 'accra', false, true)$$,
  'an inactive professional cannot be publicly listed'
);

do $$
declare
  person uuid := (select id from person_ids where label = 'accra');
begin
  perform set_config('allure.admin_write', 'authorized', true);
  begin
    insert into public.professional_branch_assignments (
      professional_id,
      branch_id,
      is_active,
      effective_on,
      assigned_by
    )
    values (person, 'kumasi', true, current_date, '11111111-1111-4111-8111-111111111111');
    raise exception 'second active studio was allowed';
  exception
    when unique_violation then
      null;
  end;
end $$;

do $$
declare
  person uuid := (select id from person_ids where label = 'accra');
begin
  perform set_config('allure.admin_write', 'authorized', true);
  begin
    update public.professional_branch_assignments
    set branch_id = 'kumasi'
    where professional_id = person;
    raise exception 'studio rewrite was allowed';
  exception
    when others then
      if sqlerrm is distinct from 'a studio assignment cannot be rewritten' then
        raise;
      end if;
  end;
end $$;

do $$
begin
  begin
    insert into public.professionals (full_name)
    values ('Direct Write');
    raise exception 'direct write was allowed';
  exception
    when others then
      if sqlerrm is distinct from 'professional records cannot be changed directly' then
        raise;
      end if;
  end;
end $$;

do $$
begin
  set local role authenticated;
  begin
    insert into public.professionals (full_name)
    values ('Direct Write');
    raise exception 'authenticated write was allowed';
  exception
    when insufficient_privilege then
      null;
  end;
  reset role;
exception
  when others then
    reset role;
    raise;
end $$;

do $$
begin
  begin
    update public.professional_audit_events
    set action = 'profile_updated';
    raise exception 'audit update was allowed';
  exception
    when others then
      if sqlerrm is distinct from 'audit events are append-only' then
        raise;
      end if;
  end;
end $$;

do $$
declare
  person uuid := (select id from person_ids where label = 'kumasi');
begin
  begin
    delete from public.professionals where id = person;
    raise exception 'professional delete was allowed';
  exception
    when others then
      if sqlerrm is distinct from 'professional records cannot be deleted' then
        raise;
      end if;
  end;
end $$;

select public._expect(
  (
    select count(*) >= 2
    from public.professional_audit_events
    where professional_id = (select id from person_ids where label = 'accra')
      and action in ('professional_created', 'studio_assigned')
  ),
  'creation and the initial studio are audited'
);

select public._expect(
  public._owner($$select count(*)::text from public.admin_list_managers()$$) = '2',
  'manager listing still works'
);

select public._expect_error(
  '22222222-2222-4222-8222-222222222222',
  $$select public.grant_manager('33333333-3333-4333-8333-333333333333')$$,
  'not authorized'
);

select public._expect(
  to_regprocedure('public.admin_reactivate_manager(uuid, text)') is not null,
  'manager reactivation remains available'
);

select public._expect(
  to_regclass('public.manager_provisions') is not null
    and to_regprocedure('public.admin_deactivate_manager(uuid)') is not null
    and to_regprocedure('public.admin_finish_manager_provision(uuid)') is not null,
  'professional migration sees manager management'
);

select public._owner(
  format(
    'select public.admin_set_professional_listed(%L::uuid, true)::text',
    (select id from person_ids where label = 'kumasi')
  )
);

do $$
declare
  person uuid := (select id from person_ids where label = 'kumasi');
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"11111111-1111-4111-8111-111111111111"}',
    true
  );
  perform set_config('allure.admin_write', 'authorized', true);
  update public.professional_branch_assignments
  set is_active = false
  where professional_id = person
    and is_active;
end $$;

select public._expect(
  (
    select not person.is_listed
      and assignment.branch_id = 'kumasi'
      and not assignment.is_active
      and assignment.ended_on is not null
      and exists (
        select 1
        from public.professional_audit_events event
        where event.professional_id = person.id
          and event.action = 'listing_disabled'
          and event.branch_id = 'kumasi'
          and event.actor_id = '11111111-1111-4111-8111-111111111111'
      )
    from public.professionals person
    join public.professional_branch_assignments assignment
      on assignment.professional_id = person.id
    where person.id = (select id from person_ids where label = 'kumasi')
  ),
  'ending an assignment hides the professional and audits the listing'
);

select public._expect(
  (
    select assignment.is_active and assignment.branch_id = 'accra'
    from public.professional_branch_assignments assignment
    where assignment.professional_id = (select id from person_ids where label = 'accra')
  ),
  'the other studio assignment stays active'
);

select 'professional management sql tests passed';
