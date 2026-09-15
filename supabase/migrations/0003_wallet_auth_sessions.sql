-- StockPass migration 0003
-- Wallet-signature authentication foundation.
-- RLS stays unchanged until the browser flow consumes the returned session token.

create table if not exists public.stockpass_wallet_auth_sessions (
  token_hash text primary key,
  wallet text not null references public.stockpass_profiles(wallet) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz
);

create index if not exists idx_stockpass_wallet_auth_sessions_wallet
  on public.stockpass_wallet_auth_sessions(wallet, expires_at desc);

create index if not exists idx_stockpass_wallet_auth_sessions_expires
  on public.stockpass_wallet_auth_sessions(expires_at);

comment on table public.stockpass_wallet_auth_sessions is
  'Opaque wallet-signature sessions used by StockPass edge functions before Supabase RLS is enabled.';
