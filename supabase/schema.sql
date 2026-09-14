create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  wallet_address text unique not null,
  handle text unique,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  symbol text unique not null,
  name text not null,
  mint_address text unique,
  source text not null default 'xStocks',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  balance numeric not null default 0,
  average_cost numeric,
  verified_at timestamptz,
  verification_signature text,
  verification_slot bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile_id, asset_id)
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  body text not null check (char_length(body) between 1 and 500),
  proof_type text not null default 'none' check (proof_type in ('verified_holder','verified_seller','watching','none')),
  snapshot_balance numeric,
  snapshot_value_usd numeric,
  snapshot_pnl_pct numeric,
  snapshot_slot bigint,
  snapshot_signature text,
  created_at timestamptz not null default now()
);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  direction text not null check (direction in ('above','below')),
  target_price numeric not null,
  delivery_email text,
  delivery_telegram text,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  event_type text not null check (event_type in ('position_verified','position_added','position_reduced','post_created')),
  quantity_delta numeric,
  price_usd numeric,
  proof_signature text,
  proof_slot bigint,
  created_at timestamptz not null default now()
);

create index if not exists idx_positions_profile on public.positions(profile_id);
create index if not exists idx_posts_created on public.posts(created_at desc);
create index if not exists idx_events_created on public.activity_events(created_at desc);
create index if not exists idx_alerts_enabled on public.alerts(enabled) where enabled = true;

alter table public.profiles enable row level security;
alter table public.assets enable row level security;
alter table public.positions enable row level security;
alter table public.posts enable row level security;
alter table public.follows enable row level security;
alter table public.alerts enable row level security;
alter table public.activity_events enable row level security;

create policy "public can read active assets" on public.assets for select using (is_active = true);
create policy "public can read public profiles" on public.profiles for select using (true);
create policy "public can read posts" on public.posts for select using (true);
create policy "public can read follows" on public.follows for select using (true);
create policy "public can read verified positions" on public.positions for select using (verified_at is not null);
create policy "public can read activity" on public.activity_events for select using (true);

comment on table public.positions is 'Cached verification state; source of truth remains Solana token accounts and immutable proof data.';
comment on table public.posts is 'Each proof-backed post stores the verification snapshot needed to audit the badge later.';
