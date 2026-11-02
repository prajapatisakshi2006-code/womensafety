-- ============================================================
-- SafeRoute Database Schema & Security Policies (RLS)
-- Paste this script into:
-- Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================

-- 1. TABLES -------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  phone      text,
  email      text,
  role       text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz default now()
);

create table if not exists public.emergency_contacts (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  phone      text not null,
  created_at timestamptz default now()
);

create table if not exists public.sos_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  lat        double precision not null,
  lng        double precision not null,
  created_at timestamptz default now()
);

create table if not exists public.safe_spots (
  id      bigint generated always as identity primary key,
  type    text not null check (type in ('police','hospital')),
  name    text not null,
  lat     double precision not null,
  lng     double precision not null,
  phone   text default '112',
  details text,
  active  boolean default true
);

-- 2. AUTO-CREATE A PROFILE WHEN SOMEONE REGISTERS ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    new.email
  )
  on conflict (id) do update set
    full_name = coalesce(nullif(excluded.full_name, ''), profiles.full_name),
    phone = coalesce(nullif(excluded.phone, ''), profiles.phone),
    email = coalesce(excluded.email, profiles.email);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. HELPER: is the current user an admin? -----------------
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- 4. ROW LEVEL SECURITY (RLS) -------------------------------
alter table public.profiles           enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.sos_events         enable row level security;
alter table public.safe_spots         enable row level security;

-- Drop existing policies if re-running
drop policy if exists "read own or admin" on public.profiles;
drop policy if exists "insert own profile" on public.profiles;
drop policy if exists "update own profile" on public.profiles;
drop policy if exists "update own" on public.profiles;

-- Profiles policies
create policy "read own or admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

create policy "insert own profile" on public.profiles
  for insert with check (id = auth.uid());

create policy "update own profile" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Permissions: authenticated users can insert and update their profile details
grant select, insert on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- Emergency contacts policies
drop policy if exists "contacts owner all" on public.emergency_contacts;
drop policy if exists "contacts admin read" on public.emergency_contacts;

create policy "contacts owner all" on public.emergency_contacts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "contacts admin read" on public.emergency_contacts
  for select using (public.is_admin());

grant select, insert, update, delete on public.emergency_contacts to authenticated;

-- SOS log policies
drop policy if exists "sos insert own" on public.sos_events;
drop policy if exists "sos read own or admin" on public.sos_events;

create policy "sos insert own" on public.sos_events
  for insert with check (user_id = auth.uid());

create policy "sos read own or admin" on public.sos_events
  for select using (user_id = auth.uid() or public.is_admin());

grant select, insert on public.sos_events to authenticated;

-- Safe spots policies: public can read active spots, admin can manage
drop policy if exists "spots public read" on public.safe_spots;
drop policy if exists "spots admin write" on public.safe_spots;

create policy "spots public read" on public.safe_spots
  for select using (active or public.is_admin());

create policy "spots admin write" on public.safe_spots
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.safe_spots to anon, authenticated;
grant all on public.safe_spots to authenticated;

-- 5. SAMPLE SAFE SPOTS (Delhi Safe Havens) ------------------
insert into public.safe_spots (type, name, lat, lng, phone, details)
select 'police', 'Central Women Safety Police Desk', 28.6194, 77.2132, '1091 / 112', '24/7 women police helpdesk'
where not exists (select 1 from public.safe_spots where name = 'Central Women Safety Police Desk');

insert into public.safe_spots (type, name, lat, lng, phone, details)
select 'hospital', 'Apex 24/7 Emergency Care', 28.6209, 77.2030, '108', '24-hour emergency entrance'
where not exists (select 1 from public.safe_spots where name = 'Apex 24/7 Emergency Care');

-- 6. MAKE YOURSELF ADMIN -----------------------------------
-- After registering your account, run this query with your email:
-- update public.profiles set role = 'admin' where email = 'your-email@example.com';
