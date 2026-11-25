-- Run after supabase.sql in Supabase SQL Editor. Safe to rerun.
-- Existing confirmed auth account only; rerun after confirmation if needed.
begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('user', 'admin', 'superadmin'));

-- Keep the existing own-name policy, but close role writes at the grant boundary.
revoke all on public.profiles from public, anon, authenticated;
revoke insert (id, name, email, role, created_at), update (id, name, email, role, created_at)
  on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (name) on public.profiles to authenticated;
drop policy if exists profiles_insert_own on public.profiles;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin'));
$$;
create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin');
$$;
revoke all on function public.is_admin(), public.is_superadmin() from public;
grant execute on function public.is_admin(), public.is_superadmin() to anon, authenticated;

-- Backfill a missing profile only for the eligible, already-existing auth user.
insert into public.profiles (id, email, name, role)
select id, email, coalesce(raw_user_meta_data->>'name', ''), 'superadmin'
from auth.users
where lower(email) = 'sit.wicend@gmail.com' and email_confirmed_at is not null
on conflict (id) do update set role = excluded.role where profiles.role <> excluded.role;

create or replace function public.valid_site_settings(input jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  k text;
  v jsonb;
  s text;
  maximum integer;
begin
  if input is null or jsonb_typeof(input) <> 'object' or octet_length(input::text) > 8192 then
    return false;
  end if;
  for k, v in select key, value from jsonb_each(input) loop
    maximum := case k
      when 'site_title' then 100 when 'site_description' then 320
      when 'hero_heading' then 160 when 'hero_description' then 600
      when 'hero_cta_text' then 80 when 'favicon_url' then 512 when 'og_image_url' then 512
      else 0 end;
    if maximum = 0 or jsonb_typeof(v) <> 'string' then return false; end if;
    s := v #>> '{}';
    if char_length(s) > maximum then return false; end if;
    if k in ('favicon_url', 'og_image_url') and s <> '' and
       s !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/site-assets/[a-zA-Z0-9_-]+\.(png|jpg|webp|ico)$' then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create table if not exists public.site_settings (
  id integer primary key default 1,
  settings jsonb not null default '{}'::jsonb
);
alter table public.site_settings drop constraint if exists site_settings_singleton;
alter table public.site_settings add constraint site_settings_singleton check (id = 1);
alter table public.site_settings drop constraint if exists site_settings_safe;
alter table public.site_settings add constraint site_settings_safe check (public.valid_site_settings(settings));
insert into public.site_settings (id) values (1) on conflict (id) do nothing;

alter table public.site_settings enable row level security;
revoke all on public.site_settings from public, anon, authenticated;
revoke insert (id, settings), update (id, settings) on public.site_settings from public, anon, authenticated;
grant select (id, settings) on public.site_settings to anon, authenticated;
grant update (settings) on public.site_settings to authenticated;
drop policy if exists site_settings_read on public.site_settings;
create policy site_settings_read on public.site_settings for select to anon, authenticated using (id = 1);
drop policy if exists site_settings_update on public.site_settings;
create policy site_settings_update on public.site_settings for update to authenticated
  using (id = 1 and public.is_superadmin()) with check (id = 1 and public.is_superadmin());
-- Restrictive guard also applies if another permissive update policy exists.
drop policy if exists site_settings_update_guard on public.site_settings;
create policy site_settings_update_guard on public.site_settings as restrictive for update to anon, authenticated
  using (id = 1 and public.is_superadmin()) with check (id = 1 and public.is_superadmin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-assets', 'site-assets', true, 5242880,
        array['image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public URLs serve images without granting callers bucket listing rights.
drop policy if exists site_assets_manage on storage.objects;
create policy site_assets_manage on storage.objects for all to authenticated
  using (bucket_id = 'site-assets' and public.is_superadmin())
  with check (bucket_id = 'site-assets' and public.is_superadmin());
-- Preserve frames policies; prevent other permissive policies granting site-assets writes.
drop policy if exists site_assets_insert_guard on storage.objects;
create policy site_assets_insert_guard on storage.objects as restrictive for insert to anon, authenticated
  with check (bucket_id <> 'site-assets' or public.is_superadmin());
drop policy if exists site_assets_update_guard on storage.objects;
create policy site_assets_update_guard on storage.objects as restrictive for update to anon, authenticated
  using (bucket_id <> 'site-assets' or public.is_superadmin())
  with check (bucket_id <> 'site-assets' or public.is_superadmin());
drop policy if exists site_assets_delete_guard on storage.objects;
create policy site_assets_delete_guard on storage.objects as restrictive for delete to anon, authenticated
  using (bucket_id <> 'site-assets' or public.is_superadmin());

-- Fail closed if browser grants or the settings allowlist are incorrect.
do $$
begin
  if has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE')
     or has_column_privilege('authenticated', 'public.profiles', 'role', 'INSERT')
     or has_column_privilege('anon', 'public.profiles', 'role', 'UPDATE')
     or has_column_privilege('anon', 'public.profiles', 'role', 'INSERT')
     or has_column_privilege('anon', 'public.site_settings', 'settings', 'UPDATE')
     or not has_column_privilege('anon', 'public.site_settings', 'settings', 'SELECT') then
    raise exception 'Unsafe browser grants on profiles or site_settings';
  end if;
  if not public.valid_site_settings('{"site_title":"Example"}')
     or public.valid_site_settings('{"secret":"no"}')
     or public.valid_site_settings('{"hero_heading":null}')
     or public.valid_site_settings('{"favicon_url":"javascript:alert(1)"}')
     or public.valid_site_settings(jsonb_build_object('site_title', repeat('x', 101))) then
    raise exception 'Unexpected settings validator result';
  end if;
  if not exists (select 1 from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) = 'sit.wicend@gmail.com' and u.email_confirmed_at is not null
      and p.role = 'superadmin') then
    raise notice 'No matching confirmed auth account was promoted.';
  end if;
end;
$$;
commit;
