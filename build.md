# StockPass build log

## Product direction

StockPass is an independent Solana xStock consumer/social product. The product identity, interaction model and visual system are original to StockPass.

## Current UI/UX redesign

The original workspace presentation has been replaced with a new StockPass interface built around clear product areas instead of one mixed dashboard.

### New navigation

- **Discover** — dedicated xStock discovery and market context page.
- **Feed** — completely separate general social feed.
- **Portfolio** — connected-wallet xStock holdings and tracked market value.
- **Alerts** — xStock price triggers.
- **Activity** — notifications and social/proof events.
- **Swap** — dedicated action screen opened from a tagged xStock in the feed.

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

Feed is a first-class social page with:
- **General** and **Verified** tabs
- proof-backed real user posts
- 100 clearly marked demo bot accounts for hackathon UI population
- 1,000 demo social posts, 10 per demo bot
- bot avatars, display names and handles
- feed content focused on supported xStocks
- tagged xStock market cards directly under posts
- official xStock price on the card
- current movement indicator when public price history provides a prior point
- alert and swap actions from the card
- bot profile navigation

Demo accounts are presentation data only. They are labeled as demo accounts/social posts and do not represent real wallets or real holdings.

### Feed → Swap flow

Clicking the tagged xStock market card opens the StockPass Swap page for that exact asset.

The Swap page:
- resolves the official Solana xStock mint from the xStocks public API
- displays the official xStock reference price
- keeps the action flow mainnet-only
- provides the SOL input and xStock destination context
- hands the actual wallet-signed swap off to the configured Solana swap venue

StockPass does not fabricate swap balances or pretend a social bot owns a token. The bot content is explicitly demo social content, while actual trading remains wallet-signed mainnet execution.

## New demo feed dataset

Supabase now contains exactly:
- **100 demo bot profiles** (`is_demo_bot = true`)
- **1,000 demo posts** (`proof_type = 'demo_social'`)
- 10 demo posts per bot
- six starter xStocks distributed across the posts: AAPLx, NVDAx, TSLAx, MSFTx, METAx and SPYx

The first four presentation bots are:
- MarketPulse AI
- LongTerm Lane
- XStock Scout
- Closing Bell Bot

The remaining accounts use the `Market Bot 005` … `Market Bot 100` naming pattern.

## New visual system

The new interface uses a separate `stockpass-redesign.css` system rather than the former dashboard styling:
- warm off-white canvas
- white content surfaces
- restrained dark typography
- cobalt action accent
- subtle borders and shadows
- generous spacing
- desktop information hierarchy with mobile navigation
- separate page-level compositions instead of a single crowded workspace

Feed market cards and the Swap page have a dedicated `feed-swap.css` layer for the new interaction pattern.

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
- Official xStocks price-signal lookup for feed movement cards.
- Supabase-backed StockPass profiles, posts, verification snapshots, follows, alerts, activity events and notifications.
- Proof-backed post composer.
- Follower notification fan-out for verified posts.
- Public wallet profiles and shareable profile/proof links.
- Portfolio verification view for the connected wallet.
- Dedicated xStock discovery page.
- Dedicated proof-backed social feed page.
- Dedicated StockPass Swap page from feed asset cards.
- Responsive mobile navigation and new visual system.

## xStock-only data policy

StockPass is intentionally limited to **xStocks**.

For live market data, StockPass uses the free public xStocks API only. The active portfolio/feed data path is:
1. Read actual supported xStock token accounts from Solana mainnet.
2. Match the mint against the verified xStock catalog.
3. Read official xStock price data.
4. Read the official xStock multiplier where valuation requires it.
5. Compute current tracked xStock value or feed market context locally.

StockPass does not use Birdeye, generic token-market APIs, or paid third-party market-data providers for xStock tracking.

A swap venue may be opened for real mainnet execution, but StockPass does not treat the swap venue as the source of truth for xStock market data.

## Mainnet-only invariant

**Solana mainnet is the single source of truth for ownership, balances, supported asset state and transaction execution.**

There is no devnet trading environment, simulated portfolio balance or fake execution rail.

Any supported buy, sell or swap will be a real Solana mainnet transaction signed by the connected wallet, with a confirmed transaction signature and resulting wallet state available for verification.

## Database/security

The shared Supabase project contains StockPass-specific `stockpass_*` tables alongside unrelated AgentMarket tables. Do not delete or rewrite the AgentMarket tables.

Wallet authentication and RLS remain active. Public catalog/profile/feed records can be read where required; wallet-owned records remain wallet-scoped.

## Current next targets

1. Expand connected Portfolio verification from the six starter assets to the complete verified Solana xStock catalog.
2. Make all xStocks in Discover/Feed asset-aware so any catalog asset can show its official public price and signal data.
3. Upgrade xStock asset detail into richer dedicated screens with price history, multiplier context, provenance and proof receipts.
4. Finish Telegram connection/settings UX around xStock alerts.
5. Validate xStock-only activity decoding against real confirmed Solana transactions.
6. Judge-flow testing from wallet connection → xStock discovery → portfolio → proof → feed → tagged asset → swap → follow → notification → alerts → public profile.
