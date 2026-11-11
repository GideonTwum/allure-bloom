-- Follow-up to 20261103000000_service_catalogue.sql.
-- Reviewed for booking security. Not deployed to the remote project.
-- It does not rewrite the catalogue seed. The ten service ids, slugs,
-- categories, and source references stay on public.services.
-- No prices, durations, workers, or branch offerings are inserted.
-- buffer_minutes defaults to zero. It is not a published turnover time.

create table public.branches (
  id text primary key,
  name text not null,
  area text not null,
  phone_display text,
  phone_e164 text,
  map_query text,
  created_at timestamptz not null default now(),
  constraint branches_known_studio check (id in ('accra', 'kumasi'))
);

comment on table public.branches is
  'Studios already published by the site. Map queries are area searches, not verified pins.';

insert into public.branches (id, name, area, phone_display, phone_e164, map_query)
values
  (
    'accra',
    'Accra Studio',
    'East Legon / Bawaleshie, Accra',
    '026 336 1721',
    '+233263361721',
    'Allure Bloom, La-Bawaleshi Road, East Legon, Accra, Ghana'
  ),
  (
    'kumasi',
    'Kumasi Studio',
    'Dakodwom / TUC, Kumasi',
    '054 234 9545',
    '+233542349545',
    'Allure Bloom, Dakodwom TUC, Kumasi, Ghana'
  )
on conflict (id) do nothing;

alter table public.services drop constraint services_bookable_requires_facts;

alter table public.services
  drop column price_ghs,
  drop column duration_minutes,
  drop column is_bookable;

alter table public.services rename column is_active to is_listed;

comment on column public.services.is_listed is
  'Catalogue visibility. Operational activation lives on branch_services.is_active.';

alter table public.branch_services drop constraint branch_services_branch_id_check;

alter table public.branch_services
  add column price_ghs integer,
  add column duration_minutes integer,
  add column buffer_minutes integer not null default 0,
  add column is_active boolean not null default false,
  add column is_bookable boolean not null default false,
  add constraint branch_services_price_nonnegative
    check (price_ghs is null or price_ghs >= 0),
  add constraint branch_services_duration_positive
    check (duration_minutes is null or duration_minutes > 0),
  add constraint branch_services_buffer_nonnegative
    check (buffer_minutes >= 0),
  add constraint branch_services_bookable_requires_configuration
    check (
      not is_bookable
      or (
        is_active
        and price_ghs is not null
        and duration_minutes is not null
      )
    );

comment on column public.branch_services.buffer_minutes is
  'Extra blocked minutes after the service. Zero until a studio sets one.';

alter table public.branch_services
  add constraint branch_services_branch_id_fkey
  foreign key (branch_id) references public.branches (id);

create index branch_services_service_id_idx
  on public.branch_services (service_id);

create or replace function public.branch_services_require_verification()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  verified text;
begin
  if new.is_bookable then
    select verification_status into verified
    from public.services
    where id = new.service_id;

    if verified is distinct from 'studio_confirmed' then
      raise exception 'a treatment cannot be bookable until the studio confirms it';
    end if;
  end if;

  return new;
end;
$$;

create trigger branch_services_require_verification
  before insert or update on public.branch_services
  for each row
  execute function public.branch_services_require_verification();

drop policy if exists services_public_read on public.services;
create policy services_public_read
  on public.services
  for select
  to anon, authenticated
  using (is_listed);

drop policy if exists branch_services_public_read on public.branch_services;
create policy branch_services_public_read
  on public.branch_services
  for select
  to anon, authenticated
  using (is_active);

alter table public.branches enable row level security;

create policy branches_public_read
  on public.branches
  for select
  to anon, authenticated
  using (true);

revoke all on table public.branches from public, anon, authenticated;
revoke insert, update, delete, truncate on table public.services from public, anon, authenticated;
revoke insert, update, delete, truncate on table public.branch_services from public, anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select on table public.branches, public.services, public.branch_services to anon, authenticated;

revoke all on function public.branch_services_require_verification() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on table public.branches from service_role;
    revoke insert, update, delete, truncate on table public.services from service_role;
    revoke insert, update, delete, truncate on table public.branch_services from service_role;
    grant select on table public.branches, public.services, public.branch_services to service_role;
    revoke all on function public.branch_services_require_verification() from service_role;
  end if;
end $$;
