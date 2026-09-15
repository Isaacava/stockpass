-- StockPass migration 0004
-- Wallet-scoped RLS backed by the opaque wallet-signature session token.
-- The browser sends the session token inside x-client-info so PostgREST keeps its
-- normal publishable-key Authorization header while policies can resolve the wallet.

create extension if not exists pgcrypto;

create or replace function public.stockpass_current_wallet()
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  client_info text;
  token text;
  token_hash text;
  wallet text;
begin
  client_info := current_setting('request.headers', true)::jsonb ->> 'x-client-info';
  token := substring(client_info from 'stockpass-session=([^[:space:]]+)');
  if token is null or token = '' then
    return null;
  end if;

  token_hash := encode(digest(token, 'sha256'), 'hex');
  select s.wallet
    into wallet
    from public.stockpass_wallet_auth_sessions s
   where s.token_hash = token_hash
     and s.expires_at > now()
   limit 1;

  return wallet;
exception when others then
  return null;
end;
$$;

revoke all on function public.stockpass_current_wallet() from public;
grant execute on function public.stockpass_current_wallet() to anon, authenticated;

-- Public catalog/profile/feed data remains readable. Wallet-owned mutations require
-- the wallet resolved by the signed session.
alter table public.stockpass_profiles enable row level security;
alter table public.stockpass_assets enable row level security;
alter table public.stockpass_verification_snapshots enable row level security;
alter table public.stockpass_posts enable row level security;
alter table public.stockpass_follows enable row level security;
alter table public.stockpass_alerts enable row level security;
alter table public.stockpass_activity_events enable row level security;
alter table public.stockpass_notifications enable row level security;
alter table public.stockpass_telegram_links enable row level security;
alter table public.stockpass_xstock_catalog enable row level security;
alter table public.stockpass_wallet_auth_challenges enable row level security;
alter table public.stockpass_wallet_auth_sessions enable row level security;
alter table public.stockpass_position_events enable row level security;
alter table public.stockpass_trade_intents enable row level security;
alter table public.stockpass_pnl_snapshots enable row level security;

-- Remove any previous StockPass policies so this migration is deterministic.
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename like 'stockpass_%'
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

create policy stockpass_profiles_public_read
  on public.stockpass_profiles for select
  using (true);
create policy stockpass_profiles_owner_insert
  on public.stockpass_profiles for insert
  with check (wallet = (select public.stockpass_current_wallet()));
create policy stockpass_profiles_owner_update
  on public.stockpass_profiles for update
  using (wallet = (select public.stockpass_current_wallet()))
  with check (wallet = (select public.stockpass_current_wallet()));

create policy stockpass_assets_public_read
  on public.stockpass_assets for select
  using (true);

create policy stockpass_xstock_catalog_public_read
  on public.stockpass_xstock_catalog for select
  using (true);

create policy stockpass_verification_public_read
  on public.stockpass_verification_snapshots for select
  using (true);
create policy stockpass_verification_owner_insert
  on public.stockpass_verification_snapshots for insert
  with check (wallet = (select public.stockpass_current_wallet()));
create policy stockpass_verification_owner_delete
  on public.stockpass_verification_snapshots for delete
  using (wallet = (select public.stockpass_current_wallet()));

create policy stockpass_posts_public_read
  on public.stockpass_posts for select
  using (true);
create policy stockpass_posts_owner_insert
  on public.stockpass_posts for insert
  with check (wallet = (select public.stockpass_current_wallet()));
create policy stockpass_posts_owner_update
  on public.stockpass_posts for update
  using (wallet = (select public.stockpass_current_wallet()))
  with check (wallet = (select public.stockpass_current_wallet()));
create policy stockpass_posts_owner_delete
  on public.stockpass_posts for delete
  using (wallet = (select public.stockpass_current_wallet()));

create policy stockpass_follows_public_read
  on public.stockpass_follows for select
  using (true);
create policy stockpass_follows_owner_insert
  on public.stockpass_follows for insert
  with check (follower_wallet = (select public.stockpass_current_wallet()));
create policy stockpass_follows_owner_delete
  on public.stockpass_follows for delete
  using (follower_wallet = (select public.stockpass_current_wallet()));

create policy stockpass_alerts_owner_read
  on public.stockpass_alerts for select
  using (wallet = (select public.stockpass_current_wallet()));
create policy stockpass_alerts_owner_insert
  on public.stockpass_alerts for insert
  with check (wallet = (select public.stockpass_current_wallet()));
create policy stockpass_alerts_owner_update
  on public.stockpass_alerts for update
  using (wallet = (select public.stockpass_current_wallet()))
  with check (wallet = (select public.stockpass_current_wallet()));
create policy stockpass_alerts_owner_delete
  on public.stockpass_alerts for delete
  using (wallet = (select public.stockpass_current_wallet()));

create policy stockpass_activity_public_read
  on public.stockpass_activity_events for select
  using (true);
create policy stockpass_activity_owner_insert
  on public.stockpass_activity_events for insert
  with check (wallet = (select public.stockpass_current_wallet()));

create policy stockpass_notifications_recipient_read
  on public.stockpass_notifications for select
  using (recipient_wallet = (select public.stockpass_current_wallet()));
create policy stockpass_notifications_actor_insert
  on public.stockpass_notifications for insert
  with check (actor_wallet = (select public.stockpass_current_wallet()));
create policy stockpass_notifications_recipient_update
  on public.stockpass_notifications for update
  using (recipient_wallet = (select public.stockpass_current_wallet()))
  with check (recipient_wallet = (select public.stockpass_current_wallet()));

create policy stockpass_telegram_owner_read
  on public.stockpass_telegram_links for select
  using (wallet = (select public.stockpass_current_wallet()));
create policy stockpass_telegram_owner_insert
  on public.stockpass_telegram_links for insert
  with check (wallet = (select public.stockpass_current_wallet()));
create policy stockpass_telegram_owner_update
  on public.stockpass_telegram_links for update
  using (wallet = (select public.stockpass_current_wallet()))
  with check (wallet = (select public.stockpass_current_wallet()));
create policy stockpass_telegram_owner_delete
  on public.stockpass_telegram_links for delete
  using (wallet = (select public.stockpass_current_wallet()));

create policy stockpass_position_public_read
  on public.stockpass_position_events for select
  using (true);
create policy stockpass_position_owner_insert
  on public.stockpass_position_events for insert
  with check (wallet = (select public.stockpass_current_wallet()));
create policy stockpass_position_owner_update
  on public.stockpass_position_events for update
  using (wallet = (select public.stockpass_current_wallet()))
  with check (wallet = (select public.stockpass_current_wallet()));

create policy stockpass_trade_owner_read
  on public.stockpass_trade_intents for select
  using (wallet = (select public.stockpass_current_wallet()));
create policy stockpass_trade_owner_insert
  on public.stockpass_trade_intents for insert
  with check (wallet = (select public.stockpass_current_wallet()));
create policy stockpass_trade_owner_update
  on public.stockpass_trade_intents for update
  using (wallet = (select public.stockpass_current_wallet()))
  with check (wallet = (select public.stockpass_current_wallet()));

create policy stockpass_pnl_owner_read
  on public.stockpass_pnl_snapshots for select
  using (wallet = (select public.stockpass_current_wallet()));
create policy stockpass_pnl_owner_insert
  on public.stockpass_pnl_snapshots for insert
  with check (wallet = (select public.stockpass_current_wallet()));
create policy stockpass_pnl_owner_update
  on public.stockpass_pnl_snapshots for update
  using (wallet = (select public.stockpass_current_wallet()))
  with check (wallet = (select public.stockpass_current_wallet()));

-- Auth challenge/session rows are server-only. The wallet-auth Edge Function uses
-- the service-role client and therefore bypasses RLS for these tables.
comment on function public.stockpass_current_wallet() is
  'Resolve StockPass wallet identity from a hashed opaque wallet-signature session carried in x-client-info.';
