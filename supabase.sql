-- ============================================================
-- wicend-twibbon — Skema Supabase
-- Aman dijalankan satu kali pada proyek BARU, dan boleh diulang.
-- Jalankan seluruh isi file ini di: Supabase Dashboard > SQL Editor.
-- JANGAN pernah menaruh service_role key di config.js atau di browser.
-- ============================================================

-- Ekstensi untuk UUID
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. Tabel profiles (1:1 dengan auth.users)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text default '',
  email text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- ------------------------------------------------------------
-- 2. Helper is_admin() — aman dari rekursi RLS
--    (security definer + search_path tetap, membaca profiles
--     tanpa memicu policy profiles lagi)
-- ------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ------------------------------------------------------------
-- 3. Trigger: buat profil otomatis saat user mendaftar
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    new.email,
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 4. Policies profiles: authenticated bisa baca sendiri;
--    admin bisa baca semua; user tidak bisa ganti role
-- ------------------------------------------------------------
drop policy if exists "profiles_read_own" on public.profiles;
create policy "profiles_read_own" on public.profiles
  for select
  using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_read_all_admin" on public.profiles;
create policy "profiles_read_all_admin" on public.profiles
  for select
  using (public.is_admin());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert
  with check (auth.uid() = id and role = 'user');

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- ------------------------------------------------------------
-- 5. Tabel campaigns
-- ------------------------------------------------------------
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) <= 200),
  category text not null default '' check (char_length(category) <= 100),
  theme text not null default 'green' check (theme ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '',
  caption text not null default '',
  frames text[] not null default '{}',
  owner uuid references public.profiles(id) on delete set null,
  owner_name text default '',
  published boolean not null default false,
  views integer not null default 0,
  downloads integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.campaigns enable row level security;

-- Kolom sensitif tidak boleh ditulis melalui API browser.
revoke insert, update, delete on public.campaigns from anon, authenticated;
grant select on public.campaigns to anon, authenticated;
grant insert (slug, title, category, theme, description, caption, frames, owner, owner_name, published)
  on public.campaigns to authenticated;
grant update (title, category, theme, description, caption, frames, owner_name, published)
  on public.campaigns to authenticated;
grant delete on public.campaigns to authenticated;

-- Role user tidak dapat dinaikkan melalui API browser, termasuk lewat upsert.
revoke all on public.profiles from anon, authenticated;
revoke all on public.profiles from public;
grant select on public.profiles to authenticated;
grant update (name) on public.profiles to authenticated;

-- Slug, owner, metrik, dan pola URL bingkai dijaga di level database.
create or replace function public.protect_campaign_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if cardinality(new.frames) < 1 or cardinality(new.frames) > 20 then
    raise exception 'Bingkai harus 1 sampai 20 berkas';
  end if;

  if exists (
    select 1 from unnest(new.frames) as f
    where f !~ '^\./assets/frames/[a-zA-Z0-9_-]+\.svg$'
      and f !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/frames/[0-9a-f-]{36}/[a-z0-9-]+/[a-zA-Z0-9_.-]+\.png$'
  ) then
    raise exception 'Alamat bingkai tidak diizinkan. Gunakan berkas bawaan repo atau Storage bucket frames.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_campaign_identity on public.campaigns;
create trigger protect_campaign_identity
  before insert or update on public.campaigns
  for each row execute function public.protect_campaign_identity();

-- ------------------------------------------------------------
-- 6. Policies campaigns
-- ------------------------------------------------------------
-- Publik bisa baca campaign published
drop policy if exists "campaigns_read_published" on public.campaigns;
create policy "campaigns_read_published" on public.campaigns
  for select
  using (published = true);

-- Owner bisa baca, insert, update, delete campaign sendiri
drop policy if exists "campaigns_owner_all" on public.campaigns;
create policy "campaigns_owner_all" on public.campaigns
  for all
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

-- Admin bisa baca, update, delete semua campaign
drop policy if exists "campaigns_admin_all" on public.campaigns;
create policy "campaigns_admin_all" on public.campaigns
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------------------------------------
-- 7. RPCs untuk increment views/downloads (atomic, security_definer)
-- ------------------------------------------------------------
create or replace function public.increment_views(campaign_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.campaigns
  set views = views + 1
  where slug = campaign_slug and published = true;
end;
$$;

create or replace function public.increment_downloads(campaign_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.campaigns
  set downloads = downloads + 1
  where slug = campaign_slug and published = true;
end;
$$;

revoke all on function public.increment_views(text) from public;
grant execute on function public.increment_views(text) to anon, authenticated;

revoke all on function public.increment_downloads(text) from public;
grant execute on function public.increment_downloads(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 8. Storage bucket 'frames' (publik)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('frames', 'frames', true, 5242880, array['image/png'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------
-- 9. Policies storage.objects untuk bucket 'frames'
-- ------------------------------------------------------------
-- Publik bisa read object
drop policy if exists "frames_read_public" on storage.objects;
create policy "frames_read_public" on storage.objects
  for select
  using (bucket_id = 'frames');

-- Authenticated bisa insert ke folder auth.uid()/{campaign_id}/...
drop policy if exists "frames_insert_own" on storage.objects;
create policy "frames_insert_own" on storage.objects
  for insert
  with check (
    bucket_id = 'frames'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated bisa update di folder auth.uid()/...
drop policy if exists "frames_update_own" on storage.objects;
create policy "frames_update_own" on storage.objects
  for update
  using (
    bucket_id = 'frames'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owner atau admin bisa delete
drop policy if exists "frames_delete_own_or_admin" on storage.objects;
create policy "frames_delete_own_or_admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'frames'
    and (
      (auth.role() = 'authenticated' and (storage.foldername(name))[1] = auth.uid()::text)
      or public.is_admin()
    )
  );

-- ------------------------------------------------------------
-- 10. Seed sample campaigns dengan frames lokal (opsional)
--     Frame ini merujuk ke assets/frames/*.svg di repo GitHub Pages.
-- ------------------------------------------------------------
insert into public.campaigns (slug, title, category, theme, description, caption, frames, owner, owner_name, published, created_at)
values
  (
    'bumi-lebih-hijau',
    'Bumi Lebih Hijau',
    'Lingkungan',
    'green',
    'Ajak teman dan keluarga menjaga lingkungan, mulai dari kebiasaan kecil.',
    'Langkah kecil hari ini, bumi lebih hijau esok hari. #BumiLebihHijau',
    array['./assets/frames/bumi.svg','./assets/frames/bumi-alt.svg'],
    null,
    'wicend-twibbon',
    true,
    now() - interval '14 days'
  ),
  (
    'semangat-merdeka',
    'Semangat Merdeka',
    'Hari Besar Nasional',
    'coral',
    'Rayakan kemerdekaan Indonesia bersama orang-orang terdekat.',
    'Dirgahayu Indonesia! #SemangatMerdeka',
    array['./assets/frames/merdeka.svg'],
    null,
    'wicend-twibbon',
    true,
    now() - interval '7 days'
  ),
  (
    'generasi-belajar',
    'Generasi Belajar',
    'Pendidikan',
    'blue',
    'Bagikan semangat belajar dan dukung pendidikan untuk semua.',
    'Belajar hari ini, berkarya esok hari. #GenerasiBelajar',
    array['./assets/frames/belajar.svg'],
    null,
    'wicend-twibbon',
    true,
    now() - interval '21 days'
  )
on conflict (slug) do nothing;

-- ------------------------------------------------------------
-- SELESAI!
-- Untuk jadikan user pertama sebagai admin, jalankan SQL di bawah
-- (ganti alamat email dengan email user yang sudah register):
--
--   update public.profiles
--   set role = 'admin'
--   where email = 'admin@example.com';
--
-- ------------------------------------------------------------
