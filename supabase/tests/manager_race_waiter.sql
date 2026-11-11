-- Calls finish while the holder session owns the staff lock.
-- After the holder deactivates and commits, finish must not restore access.

select public._expect_error(
  '11111111-1111-4111-8111-111111111111',
  format(
    'select public.admin_finish_manager_provision(%L::uuid)',
    (
      select id::text
      from public.manager_provisions
      where auth_user_id = '22222222-2222-4222-8222-222222222222'
    )
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
  'concurrent provisioning does not restore revoked access'
);
