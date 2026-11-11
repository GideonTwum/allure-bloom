-- Holds the staff lock, then deactivates the Accra manager.
-- Run in its own session while professional_race_waiter.sql waits on that lock.
-- Requires the throwaway data created by professional_management.sql.

begin;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"11111111-1111-4111-8111-111111111111"}',
  true
);

set local role authenticated;

select pg_catalog.pg_advisory_xact_lock(4811206103000);
select pg_catalog.pg_sleep(8);
select public.admin_deactivate_manager('22222222-2222-4222-8222-222222222222');

commit;
