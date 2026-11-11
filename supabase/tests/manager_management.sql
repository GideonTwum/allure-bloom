-- Local manager-management assertions.
-- Run only against a throwaway database after 20261109130000_manager_management.sql.
-- This file creates no Auth invitations and is not a migration.

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'owner@allure.test'),
  ('22222222-2222-4222-8222-222222222222', 'accra.manager@allure.test'),
  ('44444444-4444-4444-8444-444444444444', 'new.manager@allure.test'),
  ('55555555-5555-4555-8555-555555555555', 'placed.manager@allure.test'),
  ('66666666-6666-4666-8666-666666666666', 'later.manager@allure.test');

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

select public._expect(
  public._owner('select count(*)::text from public.admin_context()') = '2',
  'owner sees both studios'
);

select public._expect(
  public._owner('select public.manage_branch(''accra'')') = 'accra',
  'owner can manage Accra'
);

select public._expect_error(
  '22222222-2222-4222-8222-222222222222',
  'select public.admin_list_managers()',
  'not authorized'
);

select public._expect_error(
  '22222222-2222-4222-8222-222222222222',
  'select public.admin_open_manager_provision(''accra.manager@allure.test'', ''accra'')',
  'not authorized'
);

select public._owner(
  'select public.admin_open_manager_provision(''accra.manager@allure.test'', ''accra'')::text'
) as accra_provision \gset

select public._expect(
  public._owner('select public.admin_lookup_manager_user(''Accra.Manager@allure.test'')::text')
    = '22222222-2222-4222-8222-222222222222',
  'existing auth user is found by email'
);

select public._owner(format(
  'select public.admin_attach_manager_provision(%L::uuid, %L::uuid)::text',
  :'accra_provision',
  '22222222-2222-4222-8222-222222222222'
));

select public._owner(format(
  'select public.admin_finish_manager_provision(%L::uuid)::text',
  :'accra_provision'
));

select public._expect(
  (
    select assignment.is_active
      and membership.branch_id = 'accra'
      and provision.status = 'ready'
    from public.admin_assignments assignment
    join public.manager_branches membership
      on membership.user_id = assignment.user_id
     and membership.is_active
    join public.manager_provisions provision on provision.auth_user_id = assignment.user_id
    where assignment.user_id = '22222222-2222-4222-8222-222222222222'
  ),
  'existing user is an active Accra manager'
);

select public._expect(
  public._actor(
    '22222222-2222-4222-8222-222222222222',
    'select branch_id from public.admin_context()'
  ) = 'accra',
  'active manager sees only the assigned studio'
);

select public._expect(
  public._owner('select public.admin_open_manager_provision(''accra.manager@allure.test'', ''kumasi'')::text')
    = :'accra_provision',
  'a ready manager is not duplicated or moved by another invite'
);

select public._expect(
  (select count(*) = 1 from public.manager_branches where user_id = '22222222-2222-4222-8222-222222222222' and is_active),
  'ready provisioning leaves the original studio'
);

select public._expect_error(
  '22222222-2222-4222-8222-222222222222',
  'select public.admin_list_managers()',
  'not authorized'
);

select public._expect(
  public._owner('select count(*)::text from public.admin_context() where role = ''manager''') = '0',
  'owner context does not become a manager context'
);

select public._expect_error(
  '22222222-2222-4222-8222-222222222222',
  'select public.manage_branch(''kumasi'')',
  'not authorized'
);

select public._expect(
  public._owner('select public.manage_branch(''accra'')') = 'accra',
  'manager setup still lets the owner manage Accra'
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  'select public.assign_manager_branch(''22222222-2222-4222-8222-222222222222'', ''kumasi'')',
  'manager already has an active studio'
);

select public._owner(
  'select public.reassign_manager_branch(''22222222-2222-4222-8222-222222222222'', ''kumasi'')::text'
);

select public._expect(
  (
    select count(*) = 1
      and bool_and(branch_id = 'kumasi')
    from public.manager_branches
    where user_id = '22222222-2222-4222-8222-222222222222'
      and is_active
  ),
  'reassignment leaves one active studio'
);

select public._expect(
  exists (
    select 1 from public.admin_audit_events
    where action = 'branch_revoked'
      and target_user_id = '22222222-2222-4222-8222-222222222222'
      and branch_id = 'accra'
  )
  and exists (
    select 1 from public.admin_audit_events
    where action = 'branch_assigned'
      and target_user_id = '22222222-2222-4222-8222-222222222222'
      and branch_id = 'kumasi'
  ),
  'reassignment audits both studios'
);

select public._expect(
  (
    select status = 'ready' and branch_id = 'kumasi'
    from public.manager_provisions
    where auth_user_id = '22222222-2222-4222-8222-222222222222'
  ),
  'reassignment updates provisioning metadata'
);

select public._owner(
  'select public.admin_deactivate_manager(''22222222-2222-4222-8222-222222222222'')::text'
);

select public._expect(
  (
    select not assignment.is_active
      and not exists (
        select 1 from public.manager_branches membership
        where membership.user_id = assignment.user_id
          and membership.is_active
      )
      and provision.status = 'revoked'
    from public.admin_assignments assignment
    join public.manager_provisions provision on provision.auth_user_id = assignment.user_id
    where assignment.user_id = '22222222-2222-4222-8222-222222222222'
  ),
  'deactivation revokes the role, studio, and provision'
);

select public._expect(
  exists (
    select 1 from public.admin_audit_events
    where action = 'manager_revoked'
      and target_user_id = '22222222-2222-4222-8222-222222222222'
      and branch_id is null
  )
  and exists (
    select 1 from public.admin_audit_events
    where action = 'provision_revoked'
      and target_user_id = '22222222-2222-4222-8222-222222222222'
      and branch_id is null
  ),
  'deactivation audit keeps branch empty'
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  'select public.admin_open_manager_provision(''accra.manager@allure.test'', ''kumasi'')',
  'provision is revoked'
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_finish_manager_provision(%L::uuid)',
    (select id::text from public.manager_provisions where auth_user_id = '22222222-2222-4222-8222-222222222222')
  ),
  'provision is revoked'
);

select public._expect(
  (
    select not assignment.is_active
      and provision.status = 'revoked'
      and not exists (
        select 1
        from public.manager_branches membership
        where membership.user_id = assignment.user_id
          and membership.is_active
      )
    from public.admin_assignments assignment
    join public.manager_provisions provision on provision.auth_user_id = assignment.user_id
    where assignment.user_id = '22222222-2222-4222-8222-222222222222'
  ),
  'a stale retry leaves revoked access unchanged'
);

select public._owner(
  'select public.admin_reactivate_manager(''22222222-2222-4222-8222-222222222222'', ''accra'')::text'
);

select public._expect(
  (
    select assignment.is_active and membership.branch_id = 'accra' and provision.status = 'ready'
    from public.admin_assignments assignment
    join public.manager_branches membership
      on membership.user_id = assignment.user_id
     and membership.is_active
    join public.manager_provisions provision on provision.auth_user_id = assignment.user_id
    where assignment.user_id = '22222222-2222-4222-8222-222222222222'
  ),
  'reactivation restores one studio'
);

select public._expect(
  exists (
    select 1
    from public.admin_audit_events
    where action = 'manager_reactivated'
      and target_user_id = '22222222-2222-4222-8222-222222222222'
      and branch_id is null
  ),
  'reactivation is audited'
);

select public._expect_error(
  '22222222-2222-4222-8222-222222222222',
  'select public.admin_reactivate_manager(''22222222-2222-4222-8222-222222222222'', ''kumasi'')',
  'not authorized'
);

select public._expect(
  (
    select count(*) = 1 and bool_and(branch_id = 'accra')
    from public.manager_branches
    where user_id = '22222222-2222-4222-8222-222222222222'
      and is_active
  ),
  'a manager self-reactivation does not change the studio'
);

select public._expect_error(
  '22222222-2222-4222-8222-222222222222',
  'select public.reassign_manager_branch(''22222222-2222-4222-8222-222222222222'', ''kumasi'')',
  'not authorized'
);

select public._owner(
  'select public.grant_manager(''55555555-5555-4555-8555-555555555555'')::text'
);

select public._owner(
  'select public.assign_manager_branch(''55555555-5555-4555-8555-555555555555'', ''accra'')::text'
);

select public._owner(
  'select public.admin_open_manager_provision(''placed.manager@allure.test'', ''kumasi'')::text'
) as placed_provision \gset

select public._owner(format(
  'select public.admin_attach_manager_provision(%L::uuid, %L::uuid)::text',
  :'placed_provision',
  '55555555-5555-4555-8555-555555555555'
));

select public._owner(format(
  'select public.admin_finish_manager_provision(%L::uuid)::text',
  :'placed_provision'
));

select public._expect(
  (
    select status = 'failed'
      and last_error = 'manager already has an active studio'
      and branch_id = 'kumasi'
    from public.manager_provisions
    where id = :'placed_provision'::uuid
  )
  and (
    select count(*) = 1
      and bool_and(branch_id = 'accra')
    from public.manager_branches
    where user_id = '55555555-5555-4555-8555-555555555555'
      and is_active
  ),
  'finish does not silently transfer a manager'
);

select public._owner(
  'select public.admin_open_manager_provision(''new.manager@allure.test'', ''kumasi'')::text'
) as first_new \gset

select public._owner(
  'select public.admin_open_manager_provision(''New.Manager@allure.test'', ''accra'')::text'
) as second_new \gset

select public._expect(
  :'first_new' = :'second_new'
  and (select count(*) = 1 from public.manager_provisions where email = 'new.manager@allure.test')
  and (select branch_id = 'accra' from public.manager_provisions where email = 'new.manager@allure.test'),
  'duplicate invitation reuses one provision'
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  format('select public.admin_finish_manager_provision(%L::uuid)', :'first_new'),
  'the account is not attached yet'
);

select public._expect(
  (select status = 'auth_pending' from public.manager_provisions where id = :'first_new'::uuid),
  'a failed finish before attachment can be retried'
);

select public._owner(format(
  'select public.admin_attach_manager_provision(%L::uuid, %L::uuid)::text',
  :'first_new',
  '44444444-4444-4444-8444-444444444444'
));

select public._owner(format(
  'select public.admin_finish_manager_provision(%L::uuid)::text',
  :'first_new'
));

select public._owner(format(
  'select public.admin_finish_manager_provision(%L::uuid)::text',
  :'first_new'
));

select public._expect(
  (select count(*) = 1 from public.admin_audit_events where action = 'provision_ready' and target_user_id = '44444444-4444-4444-8444-444444444444')
  and (select count(*) = 1 from public.admin_audit_events where action = 'manager_granted' and target_user_id = '44444444-4444-4444-8444-444444444444'),
  'retrying a ready provision does not duplicate audit events'
);

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  'insert into public.manager_provisions (email, branch_id, status) values (''direct@allure.test'', ''accra'', ''auth_pending'')',
  'permission denied for table manager_provisions'
);

do $$
declare
  got text := 'no error';
begin
  begin
    insert into public.manager_provisions (email, branch_id, status)
    values ('direct@allure.test', 'accra', 'auth_pending');
  exception
    when others then
      got := sqlerrm;
  end;
  if got is distinct from 'staff access cannot be changed directly' then
    raise exception 'direct provision insert got %', got;
  end if;

  got := 'no error';
  begin
    update public.admin_audit_events
    set detail = '{}'::jsonb
    where action = 'manager_granted';
  exception
    when others then
      got := sqlerrm;
  end;
  if got is distinct from 'audit events are append-only' then
    raise exception 'audit update got %', got;
  end if;

  got := 'no error';
  begin
    delete from public.admin_audit_events where action = 'manager_granted';
  exception
    when others then
      got := sqlerrm;
  end;
  if got is distinct from 'audit events are append-only' then
    raise exception 'audit delete got %', got;
  end if;

  perform set_config('allure.admin_write', 'authorized', true);
  got := 'no error';
  begin
    update public.manager_branches
    set is_active = true,
        revoked_at = null
    where user_id = '22222222-2222-4222-8222-222222222222'
      and branch_id = 'kumasi';
  exception
    when others then
      got := sqlerrm;
  end;
  if got not like '%manager_branches_one_active%' then
    raise exception 'second active studio got %', got;
  end if;
end $$;

select public._expect(
  (select count(*) = 1 from public.admin_assignments where role = 'owner' and is_active),
  'the owner account is unchanged'
);

select public._owner(
  'select public.admin_open_manager_provision(''later.manager@allure.test'', ''kumasi'')::text'
) as later_provision \gset

select public._owner(format(
  'select public.admin_fail_manager_provision(%L::uuid, %L)::text',
  :'later_provision',
  'The invitation could not be sent. Try again when the account exists.'
));

select public._owner(
  'select public.admin_open_manager_provision(''later.manager@allure.test'', ''accra'')::text'
);

select public._expect(
  (
    select status = 'auth_pending'
      and branch_id = 'accra'
      and last_error is null
    from public.manager_provisions
    where id = :'later_provision'::uuid
  )
  and not exists (
    select 1
    from public.admin_assignments
    where user_id = '66666666-6666-4666-8666-666666666666'
  ),
  'a failed invitation can be retried without restoring access'
);

select 'manager management sql tests passed' as result;
