-- Service catalogue writes for the studio desk.
-- Depends on 20261106103000_admin_access.sql.
-- Not applied to the remote project.
-- Does not insert, update, or delete catalogue rows.
-- Direct table writes stay revoked. Authenticated administrators
-- call the functions below, which recheck the current assignment.
--
-- Public booking eligibility is the conjunction of a listed service,
-- verification_status = studio_confirmed, and an active, priced, timed,
-- bookable studio offering. admin_save_offering reads verification and
-- listing from public.services. It does not accept either value as an
-- argument. Unlisting a service, or changing its verification away from
-- studio_confirmed, clears is_bookable on its offerings. Price, duration,
-- buffer, and active status stay. Listing it again does not restore booking.
--
-- Lock order is the service row, then that service's offering rows by
-- branch_id. admin_save_offering and admin_update_service lock the service
-- with FOR UPDATE before deciding eligibility and before writing offerings.
-- The offering trigger locks the service row only on insert, before a new
-- offering row exists. An update already holds its offering row, and locking
-- the service there would cycle with the service-then-offering order.

create or replace function private.service_slug(raw_name text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select nullif(
    btrim(
      regexp_replace(lower(btrim(coalesce(raw_name, ''))), '[^a-z0-9]+', '-', 'g'),
      '-'
    ),
    ''
  );
$$;

revoke all on function private.service_slug(text) from public, anon, authenticated, service_role;

create or replace function private.normalize_image_ref(image_ref text)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  stored text;
begin
  stored := nullif(btrim(coalesce(image_ref, '')), '');
  if stored is null then
    return null;
  end if;

  if char_length(stored) > 300
    or stored ~ '[[:space:]]'
    or strpos(stored, chr(92)) > 0
    or not (
      stored ~ '^https://[A-Za-z0-9.-]+(/[^[:space:]]*)?$'
      or (stored ~ '^/[A-Za-z0-9._~/-]+$' and stored !~ '//')
    )
  then
    raise exception 'enter a site image path or https address';
  end if;

  return stored;
end;
$$;

revoke all on function private.normalize_image_ref(text) from public, anon, authenticated, service_role;

create or replace function public.admin_list_services()
returns table (
  id text,
  slug text,
  name text,
  description text,
  category text,
  service_type text,
  image_url text,
  is_listed boolean,
  verification_status text,
  source_url text,
  last_verified_at date
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    service.id,
    service.slug,
    service.name,
    service.description,
    service.category,
    service.service_type,
    service.image_url,
    service.is_listed,
    service.verification_status,
    service.source_url,
    service.last_verified_at
  from public.services service
  where exists (select 1 from public.admin_context())
  order by service.name, service.id;
$$;

create or replace function public.admin_list_offerings()
returns table (
  branch_id text,
  service_id text,
  price_ghs integer,
  duration_minutes integer,
  buffer_minutes integer,
  is_active boolean,
  is_bookable boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    offering.branch_id,
    offering.service_id,
    offering.price_ghs,
    offering.duration_minutes,
    offering.buffer_minutes,
    offering.is_active,
    offering.is_bookable
  from public.branch_services offering
  join public.admin_context() context on context.branch_id = offering.branch_id
  order by offering.service_id, offering.branch_id;
$$;

create or replace function public.admin_create_service(
  service_name text,
  service_description text,
  service_category text,
  service_kind text,
  image_ref text,
  listed boolean
)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  clean_name text;
  clean_description text;
  new_slug text;
  new_id text;
  clean_image text;
begin
  perform private.require_active_owner();

  clean_name := btrim(coalesce(service_name, ''));
  clean_description := btrim(coalesce(service_description, ''));
  new_slug := private.service_slug(clean_name);
  clean_image := private.normalize_image_ref(image_ref);

  if char_length(clean_name) < 2 or char_length(clean_name) > 80 or new_slug is null then
    raise exception 'enter a service name';
  end if;
  if char_length(clean_description) < 1 or char_length(clean_description) > 600 then
    raise exception 'enter a service description';
  end if;
  if service_category not in ('lashes', 'nails', 'brows', 'spa', 'salon', 'makeup') then
    raise exception 'choose a service category';
  end if;
  if service_kind not in ('treatment', 'addon') then
    raise exception 'choose a service type';
  end if;
  if listed is null then
    raise exception 'choose whether the service is listed';
  end if;

  new_id := 'svc_' || replace(new_slug, '-', '_');
  if char_length(new_slug) > 60 or char_length(new_id) > 64 then
    raise exception 'enter a shorter service name';
  end if;
  if exists (
    select 1
    from public.services service
    where service.id = new_id or service.slug = new_slug
  ) then
    raise exception 'a service with this name already exists';
  end if;

  insert into public.services (
    id,
    slug,
    name,
    description,
    category,
    service_type,
    image_url,
    is_listed,
    verification_status,
    source_url,
    last_verified_at
  )
  values (
    new_id,
    new_slug,
    clean_name,
    clean_description,
    service_category,
    service_kind,
    clean_image,
    listed,
    'publicly_advertised',
    null,
    null
  );

  return new_id;
end;
$$;

create or replace function public.admin_update_service(
  target_service text,
  service_name text,
  service_description text,
  service_category text,
  service_kind text,
  image_ref text,
  listed boolean
)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  clean_name text;
  clean_description text;
  clean_image text;
begin
  perform private.require_active_owner();

  clean_name := btrim(coalesce(service_name, ''));
  clean_description := btrim(coalesce(service_description, ''));
  clean_image := private.normalize_image_ref(image_ref);

  if char_length(clean_name) < 2 or char_length(clean_name) > 80 then
    raise exception 'enter a service name';
  end if;
  if char_length(clean_description) < 1 or char_length(clean_description) > 600 then
    raise exception 'enter a service description';
  end if;
  if service_category not in ('lashes', 'nails', 'brows', 'spa', 'salon', 'makeup') then
    raise exception 'choose a service category';
  end if;
  if service_kind not in ('treatment', 'addon') then
    raise exception 'choose a service type';
  end if;
  if listed is null then
    raise exception 'choose whether the service is listed';
  end if;

  perform private.lock_service_row(target_service);

  update public.services service
  set
    name = clean_name,
    description = clean_description,
    category = service_category,
    service_type = service_kind,
    image_url = clean_image,
    is_listed = listed
  where service.id = target_service;

  return target_service;
end;
$$;

create or replace function public.admin_save_offering(
  target_service text,
  target_branch text,
  offering_price integer,
  offering_duration integer,
  offering_buffer integer,
  offering_active boolean,
  offering_bookable boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  verified text;
  service_listed boolean;
begin
  if public.manage_branch(target_branch) is distinct from target_branch then
    raise exception 'not authorized';
  end if;

  if offering_price is not null and (offering_price < 1 or offering_price > 100000) then
    raise exception 'a price must be a whole number of cedis greater than zero';
  end if;
  if offering_duration is not null and (offering_duration < 1 or offering_duration > 480) then
    raise exception 'duration must be a positive number of minutes';
  end if;
  if offering_buffer is null or offering_buffer < 0 or offering_buffer > 180 then
    raise exception 'buffer time must be zero or a positive number of minutes';
  end if;
  if offering_active is null or offering_bookable is null then
    raise exception 'choose whether the offering is active';
  end if;
  if offering_active and (offering_price is null or offering_duration is null) then
    raise exception 'an offering needs a price and duration before it can be active';
  end if;
  if offering_bookable and not offering_active then
    raise exception 'an offering must be active before it can be bookable';
  end if;
  if offering_bookable and (offering_price is null or offering_duration is null) then
    raise exception 'an offering needs a price and duration before it can be bookable';
  end if;

  select locked.verified, locked.service_listed
    into verified, service_listed
  from private.lock_service_row(target_service) locked;

  if offering_bookable and verified is distinct from 'studio_confirmed' then
    raise exception 'a treatment cannot be bookable until the studio confirms it';
  end if;
  if offering_bookable and service_listed is not true then
    raise exception 'a treatment cannot be bookable while it is unlisted';
  end if;

  insert into public.branch_services (
    branch_id,
    service_id,
    price_ghs,
    duration_minutes,
    buffer_minutes,
    is_active,
    is_bookable
  )
  values (
    target_branch,
    target_service,
    offering_price,
    offering_duration,
    offering_buffer,
    offering_active,
    offering_bookable
  )
  on conflict (branch_id, service_id) do update
  set
    price_ghs = excluded.price_ghs,
    duration_minutes = excluded.duration_minutes,
    buffer_minutes = excluded.buffer_minutes,
    is_active = excluded.is_active,
    is_bookable = excluded.is_bookable;
end;
$$;

create or replace function private.lock_service_row(target_service text)
returns table (verified text, service_listed boolean)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  if target_service is null then
    raise exception 'service does not exist';
  end if;

  return query
  select service.verification_status, service.is_listed
  from public.services service
  where service.id = target_service
  for update;

  if not found then
    raise exception 'service does not exist';
  end if;
end;
$$;

revoke all on function private.lock_service_row(text) from public, anon, authenticated, service_role;

create or replace function private.sync_offering_booking_eligibility()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.verification_status is distinct from 'studio_confirmed'
    or new.is_listed is not true
  then
    perform 1
    from public.branch_services offering
    where offering.service_id = new.id
      and offering.is_bookable
    order by offering.branch_id
    for update;

    update public.branch_services offering
    set is_bookable = false
    where offering.service_id = new.id
      and offering.is_bookable;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_offering_booking_eligibility()
  from public, anon, authenticated, service_role;

drop trigger if exists services_sync_booking_eligibility on public.services;
create trigger services_sync_booking_eligibility
  after update of verification_status, is_listed on public.services
  for each row
  when (
    new.verification_status is distinct from 'studio_confirmed'
    or new.is_listed is not true
  )
  execute function private.sync_offering_booking_eligibility();

revoke all on function public.admin_list_services() from public, anon, authenticated, service_role;
revoke all on function public.admin_list_offerings() from public, anon, authenticated, service_role;
revoke all on function public.admin_create_service(text, text, text, text, text, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_update_service(text, text, text, text, text, text, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_save_offering(text, text, integer, integer, integer, boolean, boolean)
  from public, anon, authenticated, service_role;

grant execute on function public.admin_list_services() to authenticated;
grant execute on function public.admin_list_offerings() to authenticated;
grant execute on function public.admin_create_service(text, text, text, text, text, boolean) to authenticated;
grant execute on function public.admin_update_service(text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.admin_save_offering(text, text, integer, integer, integer, boolean, boolean) to authenticated;

comment on function public.admin_create_service(text, text, text, text, text, boolean) is
  'Owner-only catalogue insert. Verification, source, and slug stay fixed after creation. No offering is created.';

comment on function public.admin_update_service(text, text, text, text, text, text, boolean) is
  'Owner-only catalogue edit. Identifier, slug, verification, source, and verification date are preserved.';

comment on function public.admin_save_offering(text, text, integer, integer, integer, boolean, boolean) is
  'Creates or updates one studio offering after manage_branch confirms access. Locks the service row before reading verification and listing. Bookable requires that locked row to be listed and studio_confirmed.';

comment on function private.lock_service_row(text) is
  'Locks one service row before an offering write or a catalogue change that can clear booking eligibility.';

comment on function private.sync_offering_booking_eligibility() is
  'Clears offering booking eligibility when a service is unlisted or is no longer studio confirmed. Offering rows are locked in branch_id order after the service row. Price, duration, buffer, and active status remain.';

create or replace function public.branch_services_require_verification()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  verified text;
  service_listed boolean;
begin
  if new.is_bookable then
    -- Insert has no offering row yet, so lock the service before the new row
    -- exists. Update already holds the offering row; locking the service there
    -- would deadlock with the service-then-offering order.
    if tg_op = 'INSERT' then
      select service.verification_status, service.is_listed
        into verified, service_listed
      from public.services service
      where service.id = new.service_id
      for update;
    else
      select service.verification_status, service.is_listed
        into verified, service_listed
      from public.services service
      where service.id = new.service_id;
    end if;

    if verified is distinct from 'studio_confirmed' then
      raise exception 'a treatment cannot be bookable until the studio confirms it';
    end if;
    if service_listed is not true then
      raise exception 'a treatment cannot be bookable while it is unlisted';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.recheck_offering_booking_eligibility()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  still_bookable boolean;
  verified text;
  service_listed boolean;
begin
  select offering.is_bookable
    into still_bookable
  from public.branch_services offering
  where offering.branch_id = new.branch_id
    and offering.service_id = new.service_id;

  if not coalesce(still_bookable, false) then
    return new;
  end if;

  select service.verification_status, service.is_listed
    into verified, service_listed
  from public.services service
  where service.id = new.service_id;

  if verified is distinct from 'studio_confirmed' then
    raise exception 'a treatment cannot be bookable until the studio confirms it';
  end if;
  if service_listed is not true then
    raise exception 'a treatment cannot be bookable while it is unlisted';
  end if;

  return new;
end;
$$;

revoke all on function private.recheck_offering_booking_eligibility()
  from public, anon, authenticated, service_role;

drop trigger if exists branch_services_booking_matches_service on public.branch_services;
create constraint trigger branch_services_booking_matches_service
  after insert or update on public.branch_services
  deferrable initially deferred
  for each row
  execute function private.recheck_offering_booking_eligibility();
