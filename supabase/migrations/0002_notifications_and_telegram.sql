-- StockPass migration 0002
-- Additive only. Keeps the existing notification table compatible and adds
-- the wallet-to-Telegram link used by alert delivery.

create table if not exists public.stockpass_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_wallet text not null references public.stockpass_profiles(wallet) on delete cascade,
  actor_wallet text references public.stockpass_profiles(wallet) on delete set null,
  event_type text not null,
  post_id uuid references public.stockpass_posts(id) on delete set null,
  asset_mint text references public.stockpass_assets(mint) on delete set null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_stockpass_notifications_recipient
  on public.stockpass_notifications(recipient_wallet, created_at desc);

create table if not exists public.stockpass_telegram_links (
  wallet text primary key references public.stockpass_profiles(wallet) on delete cascade,
  chat_id bigint not null,
  linked_at timestamptz not null default now()
);

create index if not exists idx_stockpass_telegram_links_chat_id
  on public.stockpass_telegram_links(chat_id);

-- RLS remains intentionally unchanged here. StockPass still needs wallet
-- signature authentication and matching policies before these tables are
-- considered production-secure.
