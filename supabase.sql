-- ============================================================
-- SafeRoute database. Paste ALL of this into
-- Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================

-- 1. TABLES -------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  phone      text,
  email      text,
  role       text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz default now()
);

create table public.emergency_contacts (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  phone      text not null,
  created_at timestamptz default now()
);

create table public.sos_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  lat        double precision not null,
  lng        double precision not null,
  created_at timestamptz default now()
);

create table public.safe_spots (
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
  values (new.id,
          new.raw_user_meta_data->>'full_name',
          new.raw_user_meta_data->>'phone',
          new.email);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. HELPER: is the current user an admin? -----------------
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- 4. ROW LEVEL SECURITY (this is what actually protects data)
alter table public.profiles           enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.sos_events         enable row level security;
alter table public.safe_spots         enable row level security;

-- profiles
create policy "read own or admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "update own" on public.profiles
  for update using (id = auth.uid());
-- users may only edit name/phone, never their own role:
revoke update on public.profiles from authenticated, anon;
grant  update (full_name, phone) on public.profiles to authenticated;

-- emergency contacts: only the owner (admin can view)
create policy "contacts owner all" on public.emergency_contacts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "contacts admin read" on public.emergency_contacts
  for select using (public.is_admin());

-- SOS log: user inserts/reads own, admin reads all
create policy "sos insert own" on public.sos_events
  for insert with check (user_id = auth.uid());
create policy "sos read own or admin" on public.sos_events
  for select using (user_id = auth.uid() or public.is_admin());

-- safe spots: everyone can read active ones, only admin can change
create policy "spots public read" on public.safe_spots
  for select using (active or public.is_admin());
create policy "spots admin write" on public.safe_spots
  for all using (public.is_admin()) with check (public.is_admin());

-- 5. SAMPLE SAFE SPOTS (edit coordinates to your city) -----
insert into public.safe_spots (type,name,lat,lng,phone,details) values
 ('police','Central Women Safety Police Desk',28.6194,77.2132,'1091 / 112','24/7 women police helpdesk'),
 ('hospital','Apex 24/7 Emergency Care',28.6209,77.2030,'108','24-hour emergency entrance');

-- 6. MAKE YOURSELF ADMIN (register in the app first, then run this
--    with your own email) ------------------------------------
-- update public.profiles set role = 'admin' where email = 'you@example.com';
