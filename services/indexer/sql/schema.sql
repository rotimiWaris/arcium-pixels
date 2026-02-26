create table if not exists public.pixels (
  pixel_id integer primary key,
  owner text not null,
  username text not null default '',
  image_url text not null default '',
  metadata_uri text not null default '',
  claimed_at timestamptz null,
  slot bigint not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists idx_pixels_owner on public.pixels(owner);
create index if not exists idx_pixels_updated_at on public.pixels(updated_at desc);

create table if not exists public.sync_state (
  key text primary key,
  last_slot bigint not null default 0,
  last_synced_at timestamptz not null default now(),
  notes text null
);

create table if not exists public.pixel_policies (
  pixel_id integer primary key references public.pixels(pixel_id) on delete cascade,
  policy_ciphertext text not null,
  updated_by text null,
  updated_at timestamptz not null default now()
);

create table if not exists public.pixel_access_grants (
  id bigserial primary key,
  pixel_id integer not null references public.pixels(pixel_id) on delete cascade,
  viewer_id text not null,
  granted_until timestamptz not null,
  granted_by text null,
  payment_ref text null,
  created_at timestamptz not null default now(),
  unique (pixel_id, viewer_id)
);

create index if not exists idx_pixel_access_grants_viewer
  on public.pixel_access_grants(viewer_id, granted_until desc);
