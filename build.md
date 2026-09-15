# StockPass build log

## Product direction

StockPass is an independent Solana xStock consumer/social product. The product identity, interaction model and visual system are original to StockPass.

## Current UI/UX redesign

The original workspace presentation has been replaced with a new StockPass interface built around clear product areas instead of one mixed dashboard.

### New navigation

- **Discover** — dedicated xStock discovery and market context page.
- **Feed** — completely separate proof-backed social feed.
- **Portfolio** — connected-wallet xStock holdings and tracked market value.
- **Alerts** — xStock price triggers.
- **Activity** — notifications and social/proof events.

### New Discover page

The new Discover experience is a dedicated xStock destination with:
- large editorial hero and mainnet context
- verified xStock market board
- featured xStock cards
- searchable Solana xStock directory
- asset detail sheet
- official xStocks live prices
- verified asset status
- direct alert creation

The page reads the verified Solana xStock catalog from `stockpass_xstock_catalog` and uses the free public xStocks API for market data.

### New Feed page

Feed is no longer embedded inside Discover. It is a first-class social page with:
- its own hero and navigation context
- Latest / Verified feed filters
- proof-backed position cards
- profile identity and wallet navigation
- mainnet verification indicators
- social actions and verified-post composer
- compact trust-model sidebar

### New visual system

The new interface uses a separate `stockpass-redesign.css` system rather than the former dashboard styling:
- warm off-white canvas
- white content surfaces
- restrained dark typography
- cobalt action accent
- subtle borders and shadows
- generous spacing
- desktop-first information hierarchy with mobile navigation
- separate page-level compositions instead of a single crowded workspace

The redesign is intentionally not a StockPassport clone and does not copy AgentMarket layouts.

## Core idea

> Anyone can post a screenshot. StockPass can prove what the wallet held on Solana when the claim was made.

StockPass combines three layers:
- **Utility** — live xStock portfolio, xStock market data, alerts, proof and future wallet-signed actions.
- **Proof** — mainnet wallet ownership and timestamped verification snapshots.
- **Signals/Social** — posts, follows, verified activity and notifications that sit on top of the utility layer.

## Current implementation

- Vite + React + TypeScript.
- Reown AppKit Solana wallet connection.
- Solana mainnet RPC verification.
- SPL Token + Token-2022 account scanning.
- Official xStocks metadata/mint resolution.
- Official xStocks public price data.
- Official xStocks public multiplier data for correct displayed valuation.
- Supabase-backed StockPass profiles, posts, verification snapshots, follows, alerts, activity events and notifications.
- Proof-backed post composer.
- Follower notification fan-out for verified posts.
- Public wallet profiles and shareable profile/proof links.
- Portfolio verification view for the connected wallet.
- Dedicated xStock discovery page.
- Dedicated proof-backed social feed page.
- Responsive mobile navigation and new visual system.

## xStock-only data policy

StockPass is intentionally limited to **xStocks**.

For live market data, StockPass uses the free public xStocks API only. The active portfolio-value path is:
1. Read actual supported xStock token accounts from Solana mainnet.
2. Match the mint against the verified xStock catalog.
3. Read official xStock price data.
4. Read the official xStock multiplier.
5. Apply the multiplier to the raw Solana balance.
6. Compute current tracked xStock value locally.

StockPass does not use Birdeye, Jupiter, generic token-market APIs, or paid third-party market-data providers for xStock tracking.

## Mainnet-only invariant

**Solana mainnet is the single source of truth for ownership, balances, supported asset state and transaction execution.**

There is no devnet trading environment, simulated portfolio balance or fake execution rail.

Any future supported buy, sell or swap will be a real Solana mainnet transaction signed by the connected wallet, with a confirmed transaction signature and resulting wallet state available for verification.

## Database/security

The shared Supabase project contains StockPass-specific `stockpass_*` tables alongside unrelated AgentMarket tables. Do not delete or rewrite the AgentMarket tables.

Wallet authentication and RLS remain active. Public catalog/profile/feed records can be read where required; wallet-owned records remain wallet-scoped.

## Current next targets

1. Expand connected Portfolio verification from the six starter assets to the complete verified Solana xStock catalog.
2. Make Feed price lookup asset-aware so any xStock appearing in posts can show its official public price without generic market APIs.
3. Upgrade xStock asset detail into richer dedicated screens with price history, multiplier context, provenance and proof receipts.
4. Finish Telegram connection/settings UX around xStock alerts.
5. Validate xStock-only activity decoding against real confirmed Solana transactions.
6. Judge-flow testing from wallet connection → xStock discovery → portfolio → proof → feed → follow → notification → alerts → public profile.

## Build verification

The UI redesign is on `main`. Vercel's latest successful production deployment before the redesign remains available while the new commits trigger their replacement production build.
