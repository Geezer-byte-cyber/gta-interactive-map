-- Run this entire file in Supabase Dashboard > SQL Editor.
create table if not exists public.pins (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  category text not null default 'Other'
    check (category in ('Collectibles','Properties','Businesses','Vehicles','Secrets','Other')),
  image_url text,
  x double precision not null,
  y double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pins enable row level security;

-- Anyone can view published pins.
drop policy if exists "Pins are public to read" on public.pins;
create policy "Pins are public to read" on public.pins
for select using (true);

-- Only authenticated users can change pins. Create only your own admin user
-- in Authentication > Users; do not enable public sign-ups.
drop policy if exists "Admins can insert pins" on public.pins;
create policy "Admins can insert pins" on public.pins
for insert to authenticated with check (true);

drop policy if exists "Admins can update pins" on public.pins;
create policy "Admins can update pins" on public.pins
for update to authenticated using (true) with check (true);

drop policy if exists "Admins can delete pins" on public.pins;
create policy "Admins can delete pins" on public.pins
for delete to authenticated using (true);

-- Public image bucket: anyone can view images; authenticated users can upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pin-images', 'pin-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Pin images are public to view" on storage.objects;
create policy "Pin images are public to view" on storage.objects
for select using (bucket_id = 'pin-images');

drop policy if exists "Admins can upload pin images" on storage.objects;
create policy "Admins can upload pin images" on storage.objects
for insert to authenticated with check (bucket_id = 'pin-images');

drop policy if exists "Admins can update pin images" on storage.objects;
create policy "Admins can update pin images" on storage.objects
for update to authenticated using (bucket_id = 'pin-images') with check (bucket_id = 'pin-images');

drop policy if exists "Admins can delete pin images" on storage.objects;
create policy "Admins can delete pin images" on storage.objects
for delete to authenticated using (bucket_id = 'pin-images');
