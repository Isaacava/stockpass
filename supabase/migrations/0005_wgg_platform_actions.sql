-- StockPass migration 0005
-- Server-verifiable Kamino actions performed through Weekend Gap Guard.

create table if not exists public.wgg_platform_actions (
  id uuid primary key default gen_random_uuid(),
  wallet text not null,
  action_type text not null check (
    action_type = any (array[
      'supply'::text,
      'deposit'::text,
      'borrow'::text,
      'repay'::text,
      'withdraw'::text,
      'close'::text
    ])
  ),
  obligation_address text,
  reserve_address text,
  withdraw_reserve_address text,
  amount_base_units text,
  withdraw_amount_base_units text,
  status text not null default 'prepared' check (
    status = any (array[
      'prepared'::text,
      'submitted'::text,
      'confirmed'::text,
      'failed'::text,
      'expired'::text
    ])
  ),
  transaction_signature text unique,
  kamino_program_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  confirmed_at timestamptz
);

create index if not exists idx_wgg_platform_actions_wallet_created
  on public.wgg_platform_actions(wallet, created_at desc);

create index if not exists idx_wgg_platform_actions_status
  on public.wgg_platform_actions(status, created_at desc);

alter table public.wgg_platform_actions enable row level security;

comment on table public.wgg_platform_actions is
  'Server-verifiable record of Kamino actions prepared and confirmed through StockPass.';
