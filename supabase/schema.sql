-- StockPass schema for the shared Supabase project.
-- The AgentMarket tables in this project are intentionally untouched.
-- StockPass owns the isolated stockpass_* tables below.

create table if not exists public.stockpass_profiles (
  wallet text primary key,
  handle text unique,
  display_name text,
  bio text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stockpass_assets (
  mint text primary key,
  symbol text unique not null,
  name text not null,
  icon text,
  source text not null default 'xStocks',
  created_at timestamptz not null default now()
);

create table if not exists public.stockpass_verification_snapshots (
  id uuid primary key default gen_random_uuid(),
  wallet text not null references public.stockpass_profiles(wallet) on delete cascade,
  mint text not null references public.stockpass_assets(mint) on delete restrict,
  balance numeric not null,
  slot bigint,
  observed_at timestamptz not null default now(),
  transaction_signature text
);

create table if not exists public.stockpass_posts (
  id uuid primary key default gen_random_uuid(),
  wallet text not null references public.stockpass_profiles(wallet) on delete cascade,
  mint text references public.stockpass_assets(mint) on delete set null,
  body text not null,
  proof_type text not null,
  verification_snapshot_id uuid references public.stockpass_verification_snapshots(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.stockpass_follows (
  follower_wallet text not null references public.stockpass_profiles(wallet) on delete cascade,
  followed_wallet text not null references public.stockpass_profiles(wallet) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_wallet, followed_wallet),
  check (follower_wallet <> followed_wallet)
);

create table if not exists public.stockpass_alerts (
  id uuid primary key default gen_random_uuid(),
  wallet text not null references public.stockpass_profiles(wallet) on delete cascade,
  mint text references public.stockpass_assets(mint) on delete set null,
  direction text not null check (direction in ('above', 'below')),
  target_price numeric not null,
  channel text not null default 'in_app',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.stockpass_activity_events (
  id uuid primary key default gen_random_uuid(),
  wallet text not null references public.stockpass_profiles(wallet) on delete cascade,
  mint text references public.stockpass_assets(mint) on delete set null,
  event_type text not null,
  transaction_signature text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_stockpass_posts_created on public.stockpass_posts(created_at desc);
create index if not exists idx_stockpass_events_created on public.stockpass_activity_events(created_at desc);
create index if not exists idx_stockpass_alerts_wallet on public.stockpass_alerts(wallet, created_at desc);
create index if not exists idx_stockpass_snapshots_wallet_mint on public.stockpass_verification_snapshots(wallet, mint, observed_at desc);

-- Security note:
-- The current deployed stockpass_* tables have RLS disabled so the browser-only
-- prototype can write with the public Supabase key. Before treating the app as
-- production-ready, enable RLS and add narrow policies for public reads plus
-- wallet-scoped authenticated writes. See supabase/rls-remediation.sql.
