-- Updates a professional while the holder owns the staff lock.
-- After the holder deactivates the manager and commits, the update must fail
-- and leave the profile unchanged.

select public._expect_error(
  '22222222-2222-4222-8222-222222222222',
  format(
    'select public.admin_update_professional_profile(%L::uuid, %L, %L, %L, null)',
    (select id from public.professionals where full_name = 'Ama Mensah'),
    'Ama Mensah',
    'Ama',
    'Changed after revocation.'
  ),
  'not authorized'
);

select public._expect(
  (
    select person.biography = 'Lash artist at the Accra studio.'
      and person.is_active
      and not assignment_manager.is_active
      and not exists (
        select 1
        from public.manager_branches membership
        where membership.user_id = '22222222-2222-4222-8222-222222222222'
          and membership.is_active
      )
    from public.professionals person
    join public.admin_assignments assignment_manager
      on assignment_manager.user_id = '22222222-2222-4222-8222-222222222222'
    where person.full_name = 'Ama Mensah'
  ),
  'a revoked manager cannot commit a professional update'
);
