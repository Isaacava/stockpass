# StockPass build log

## Product direction

StockPass is an independent Solana consumer/social-trading product. The product identity, interaction model and visual system are original to StockPass. External products may be studied for quality standards, but StockPass does not reproduce their branding, layouts or architecture.

## Core idea

> Anyone can post a screenshot. StockPass can prove what the wallet held on Solana when the claim was made.

StockPass combines three layers:
- **Proof** — mainnet wallet ownership and timestamped verification snapshots.
- **Signals** — social posts, follows, verified activity and notifications.
- **Action** — live market data, alerts and eventually signed mainnet trading.

## Current implementation

- Vite + React + TypeScript.
- Reown AppKit / WalletConnect-compatible Solana wallet connection.
- Solana mainnet RPC verification.
- SPL Token + Token-2022 account scanning.
- Official xStocks metadata/mint resolution.
- Official xStocks public price data.
- Supabase-backed StockPass profiles, posts, verification snapshots, follows, alerts, activity events and notifications.
- Proof-backed post composer.
- Follower notification fan-out for verified posts.
- Public wallet profiles and shareable profile/proof links.
- Portfolio verification view.
- Alert persistence.
- Mobile navigation and responsive layouts.
- Original StockPass visual language: signal-console layout, dark navigation rail, blue/cyan evidence accents, compact monospaced metadata, market-signal cards and proof-first interaction patterns.

## UX principles

StockPass should feel like a **social market intelligence product**, not a generic crypto dashboard and not a passport/document clone.

The UI emphasizes:
- clear hierarchy over decorative cards
- proof state next to the claim it validates
- market context beside social activity
- fast wallet/profile navigation
- compact information density without clutter
- original StockPass visual patterns rather than copying another product
- mobile-first interaction with desktop information density

## Mainnet-only invariant

**Solana mainnet is the single source of truth for ownership, balances, supported asset state and transaction execution.**

There is no devnet trading environment, simulated portfolio balance or fake execution rail.

Any supported buy, sell or swap will eventually be a real Solana mainnet transaction signed by the connected wallet, with the resulting transaction signature and confirmed wallet state available for verification.

## Database/security

The shared Supabase project contains the StockPass-specific `stockpass_*` tables alongside unrelated AgentMarket tables. Do not delete or rewrite the AgentMarket tables.

The StockPass browser client currently uses publishable Supabase credentials. RLS still needs to be enabled with proper wallet-scoped authorization policies before treating the social database as production-secure.

## Current next targets

1. Wallet-signature authentication and wallet-scoped RLS.
2. Real transaction history/provenance records for supported xStocks.
3. Mainnet buy/sell/swap execution with wallet signing and confirmed receipts.
4. Position-cost basis and realized/unrealized PnL derived from transaction history.
5. Seller proof for reductions/sells, not just holder proof.
6. Price-alert evaluation worker and notification delivery.
7. Milestone-generated post drafts from verified portfolio events.
8. Judge-flow testing from wallet connection → proof → trade → PnL → post → follow → notification → public proof card.
