-- Service catalogue and branch eligibility.
-- Not applied to a live database. Supabase is not connected in this project.
-- Prices, durations, and branch rows are intentionally absent.
-- Public roles can read active services. No insert, update, or delete policy is granted.

create table if not exists public.services (
  id text primary key,
  slug text not null unique,
  name text not null,
  description text not null,
  category text not null check (
    category in ('lashes', 'nails', 'brows', 'spa', 'salon', 'makeup')
  ),
  service_type text not null check (service_type in ('treatment', 'addon')),
  price_ghs integer,
  duration_minutes integer,
  image_url text,
  is_active boolean not null default true,
  is_bookable boolean not null default false,
  verification_status text not null check (
    verification_status in ('publicly_advertised', 'studio_confirmed')
  ),
  source_url text,
  last_verified_at date,
  constraint services_bookable_requires_facts check (
    not is_bookable
    or (price_ghs is not null and duration_minutes is not null)
  )
);

create table if not exists public.branch_services (
  branch_id text not null check (branch_id in ('accra', 'kumasi')),
  service_id text not null references public.services (id),
  primary key (branch_id, service_id)
);

alter table public.services enable row level security;
alter table public.branch_services enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'services'
      and policyname = 'services_public_read'
  ) then
    create policy services_public_read
      on public.services
      for select
      to anon, authenticated
      using (is_active);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'branch_services'
      and policyname = 'branch_services_public_read'
  ) then
    create policy branch_services_public_read
      on public.branch_services
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;

insert into public.services (
  id,
  slug,
  name,
  description,
  category,
  service_type,
  price_ghs,
  duration_minutes,
  image_url,
  is_active,
  is_bookable,
  verification_status,
  source_url,
  last_verified_at
)
values
  (
    'svc_mink_lash_extensions',
    'mink-lash-extensions',
    'Mink lash extensions',
    'Publicly advertised lash extensions. Price, duration, and studio availability are not confirmed.',
    'lashes',
    'treatment',
    null,
    null,
    null,
    true,
    false,
    'publicly_advertised',
    'https://www.beautynailhairsalons.com/GH/Accra/100126419564562/Allure_Bloom_',
    '2026-11-03'
  ),
  (
    'svc_cat_eye_volume',
    'cat-eye-volume',
    'Cat-eye volume',
    'Publicly advertised volume lash style. Price, duration, and studio availability are not confirmed.',
    'lashes',
    'treatment',
    null,
    null,
    null,
    true,
    false,
    'publicly_advertised',
    'https://www.beautynailhairsalons.com/GH/Accra/100126419564562/Allure_Bloom_',
    '2026-11-03'
  ),
  (
    'svc_wispy_volume',
    'wispy-volume',
    'Wispy volume',
    'Publicly advertised volume lash style. Price, duration, and studio availability are not confirmed.',
    'lashes',
    'treatment',
    null,
    null,
    null,
    true,
    false,
    'publicly_advertised',
    'https://www.beautynailhairsalons.com/GH/Accra/100126419564562/Allure_Bloom_',
    '2026-11-03'
  ),
  (
    'svc_cat_eye_wispy_volume',
    'cat-eye-wispy-volume',
    'Cat-eye wispy volume',
    'Publicly advertised volume lash style. Price, duration, and studio availability are not confirmed.',
    'lashes',
    'treatment',
    null,
    null,
    null,
    true,
    false,
    'publicly_advertised',
    'https://www.beautynailhairsalons.com/GH/Accra/100126419564562/Allure_Bloom_',
    '2026-11-03'
  ),
  (
    'svc_bottom_lashes',
    'bottom-lashes',
    'Bottom lashes',
    'Publicly advertised as an enhancement or add-on to a lash set. Price, duration, and studio availability are not confirmed.',
    'lashes',
    'addon',
    null,
    null,
    null,
    true,
    false,
    'publicly_advertised',
    'https://www.beautynailhairsalons.com/GH/Accra/100126419564562/Allure_Bloom_',
    '2026-11-03'
  ),
  (
    'svc_microblading',
    'microblading',
    'Microblading',
    'Publicly advertised brow treatment. Price, duration, and studio availability are not confirmed.',
    'brows',
    'treatment',
    null,
    null,
    null,
    true,
    false,
    'publicly_advertised',
    'https://www.beautynailhairsalons.com/GH/Accra/100126419564562/Allure_Bloom_',
    '2026-11-03'
  ),
  (
    'svc_pedicures',
    'pedicures',
    'Pedicures',
    'Publicly advertised nail treatment. Price, duration, and studio availability are not confirmed.',
    'nails',
    'treatment',
    null,
    null,
    null,
    true,
    false,
    'publicly_advertised',
    'https://www.beautynailhairsalons.com/GH/Accra/100126419564562/Allure_Bloom_',
    '2026-11-03'
  ),
  (
    'svc_facials',
    'facials',
    'Facials',
    'Publicly advertised spa treatment. Price, duration, and studio availability are not confirmed.',
    'spa',
    'treatment',
    null,
    null,
    null,
    true,
    false,
    'publicly_advertised',
    'https://www.beautynailhairsalons.com/GH/Accra/100126419564562/Allure_Bloom_',
    '2026-11-03'
  ),
  (
    'svc_waxing',
    'waxing',
    'Waxing',
    'Publicly advertised spa treatment. Price, duration, and studio availability are not confirmed.',
    'spa',
    'treatment',
    null,
    null,
    null,
    true,
    false,
    'publicly_advertised',
    'https://www.beautynailhairsalons.com/GH/Accra/100126419564562/Allure_Bloom_',
    '2026-11-03'
  ),
  (
    'svc_piercings',
    'piercings',
    'Piercings',
    'Publicly advertised salon treatment. Price, duration, and studio availability are not confirmed.',
    'salon',
    'treatment',
    null,
    null,
    null,
    true,
    false,
    'publicly_advertised',
    'https://www.beautynailhairsalons.com/GH/Accra/100126419564562/Allure_Bloom_',
    '2026-11-03'
  )
on conflict (id) do nothing;
