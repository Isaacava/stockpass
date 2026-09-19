-- StockPass migration 0006
-- One-time Telegram linking challenges for opt-in WGG alerts.

create table if not exists public.wgg_telegram_link_challenges (
  token_hash text primary key,
  wallet text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_wgg_telegram_link_challenges_wallet
  on public.wgg_telegram_link_challenges(wallet, expires_at desc);

alter table public.wgg_telegram_link_challenges enable row level security;

create index if not exists idx_wgg_alerts_position_severity_created
  on public.wgg_alerts(position_id, severity, created_at desc);

create index if not exists idx_wgg_alerts_unsent
  on public.wgg_alerts(telegram_sent_at, created_at desc);
