# StockPass build log

## Product direction

StockPass is an independent Solana consumer/social-trading product. The product identity, interaction model and visual system are original to StockPass. External products may be studied for quality standards, but StockPass does not reproduce their branding, layouts or architecture.

## Core idea

> Anyone can post a screenshot. StockPass can prove what the wallet held on Solana when the claim was made.

StockPass combines three layers:
- **Utility** — live supported xStock portfolio, market data, alerts, proof and future wallet-signed actions.
- **Proof** — mainnet wallet ownership and timestamped verification snapshots.
- **Signals/Social** — posts, follows, verified activity and notifications that sit on top of the utility layer.

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
- Profile identity setup with first/full name plus unique-style username/handle.
- X-like public profile structure with profile header, follow/share/edit actions, profile tabs and social counts.
- Public profile **Posts** tab for proof-backed posts.
- Public profile **Portfolio** tab showing every supported xStock currently held by that wallet, read directly from Solana mainnet and paired with live xStock prices when available.
- Public profile **Proof** tab explaining the wallet verification model and showing current proof statistics.
- Public profile **holding badges**: current positive-balance xStocks are displayed beside the user's name as actual official token-logo circles, with overflow collapsed into a `+N` indicator.
- Portfolio verification view for the connected wallet.
- Workspace utility panel showing live supported xStock holdings, estimated live value when prices are available, optional PnL, and Telegram alert connection.
- New **Market utility hub** available from the connected workspace: searchable verified Solana xStock catalog, per-asset live price lookup, official Solana mint, current connected-wallet balance, alert creation, and saved provenance-event history.
- Mobile navigation and responsive layouts.
- Social timeline visual language inspired by modern consumer feeds: name + @username identity, flat timeline posts, profile tabs, follow actions and compact proof indicators, while retaining original StockPass styling and terminology.
- Utility-first landing page focused on portfolio, mainnet proof, market context, alerts and future signed actions.
- Landing preview avoids fake wallet balances; live balances appear after wallet connection.
- Landing page is the default disconnected experience; the full workspace is lazy-loaded only after a wallet connects so workspace imports cannot block the public landing page.

## xStock catalog

StockPass keeps a dedicated `stockpass_xstock_catalog` table for the official xStocks utility catalog. The catalog stores symbol, name, Solana mint, network, verification/badge flags, source and logo metadata.

The live xStocks public API query used for `network=Solana` returned **732 unique Solana xStock assets** at the time of this build. Those assets were inserted into both `stockpass_xstock_catalog` and the existing `stockpass_assets` table. The public xStocks products page can expose a different global count, so StockPass does not hardcode an assumed global number; the network-filtered API catalog is the source used for Solana holdings, discovery and badges.

The catalog is the product allowlist, while individual wallet badges are earned dynamically only when the wallet has a positive onchain balance for that official Solana xStock mint.

## Utility/trading data foundation

A new Supabase migration created these StockPass-specific tables:
- `stockpass_wallet_auth_challenges` for future signed-wallet authentication/nonces.
- `stockpass_position_events` for mainnet ownership/provenance events and transaction signatures.
- `stockpass_trade_intents` for quote/sign/submit/confirm state around eventual real wallet-signed trades.
- `stockpass_pnl_snapshots` for durable portfolio/PnL snapshots.

These tables are data foundations only; they do not create simulated balances or execute trades by themselves.

## Additions from the StockPass additions pack

- `stockpass_telegram_links` database table for wallet → Telegram chat linking.
- Telegram deep-link client helper.
- Telegram webhook Edge Function source with webhook-secret validation and Solana-address validation.
- Scheduled price-alert worker source using Jupiter Price API, in-app activity events and optional Telegram delivery.
- xStock-scoped portfolio PnL helper using Birdeye's Wallet PnL endpoint.
- Compact connected-workspace tools panel that exposes Telegram alerts and PnL when the corresponding integrations are configured.

The Telegram migration has been applied to the existing StockPass Supabase project. The Edge Functions are committed to the repository; Telegram delivery still requires the user-provided bot secrets and scheduled invocation. The PnL browser helper is optional; for production the Birdeye key should be moved behind a server-side Edge Function rather than exposed to the browser.

## UX principles

StockPass should feel like a **utility-first onchain xStock product with a social layer**, not a generic crypto dashboard, not a social network that merely displays balances, and not a passport/document clone.

The UI emphasizes:
- portfolio and market utility before social activity
- proof state next to the claim it validates
- market context beside wallet state
- fast wallet/profile navigation
- profile identity built around display name + @username, with wallet address as verifiable secondary identity
- live xStock holding badges attached to the public profile identity
- profile sections that combine social content with the user's live supported xStock holdings
- fast switching between Posts, Portfolio and Proof without leaving the public profile
- compact information density without clutter
- original StockPass visual patterns rather than copying another product
- mobile-first interaction with desktop information density
- public landing page first, workspace only after wallet connection
- no fabricated portfolio balances or simulated mainnet state in the product UI

## Mainnet-only invariant

**Solana mainnet is the single source of truth for ownership, balances, supported asset state and transaction execution.**

There is no devnet trading environment, simulated portfolio balance or fake execution rail.

Any supported buy, sell or swap will eventually be a real Solana mainnet transaction signed by the connected wallet, with the resulting transaction signature and confirmed wallet state available for verification.

The public profile portfolio and workspace utility view follow this invariant: xStock balances are not copied from Supabase or manually entered profile data. They are read from the wallet's supported Solana token accounts. The database catalogs official mint metadata; it does not manufacture holdings.

## Database/security

The shared Supabase project contains the StockPass-specific `stockpass_*` tables alongside unrelated AgentMarket tables. Do not delete or rewrite the AgentMarket tables.

**Security work is still outstanding:** Supabase's security advisor currently reports that the 10 public StockPass tables have RLS disabled. Do not enable RLS blindly, because the existing browser client is not yet using wallet-signature auth. The intended sequence is to finish wallet-signature authentication, then add wallet-scoped policies, then enable RLS without breaking the public catalog/profile read paths.

## Integration setup still required

Telegram delivery requires:
- a Telegram bot created through BotFather
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `VITE_TELEGRAM_BOT_USERNAME`
- deployed `telegram-webhook` and `alerts-worker` Edge Functions
- a scheduled worker invocation

PnL requires a Birdeye API key. The current helper uses `VITE_BIRDEYE_API_KEY` for the hackathon path; production should proxy this through a server-side Edge Function.

## Current next targets

1. Finish wallet-signature authentication using the new challenge table and then enable wallet-scoped RLS policies.
2. Populate `stockpass_position_events` from Solana transaction/signature history, not just verification snapshots.
3. Wire `stockpass_trade_intents` into a wallet-signed mainnet quote/submit/confirm flow; no simulated execution.
4. Derive durable cost basis and realized/unrealized PnL from transaction/provenance history.
5. Detect position reductions/sells and create seller-proof records tied to confirmed signatures.
6. Deploy and schedule the StockPass alerts worker once required secrets/scheduling are available.
7. Finish Telegram connection UX and notification settings.
8. Generate milestone post drafts from verified portfolio events.
9. Upgrade Discover into a first-class 732-asset xStock discovery experience with following-aware feed tabs, search and direct asset navigation.
10. Expand the Market utility hub into dedicated asset screens with charts, provenance, holder context and action receipts.
11. Keep the official xStock catalog synchronized as new Solana assets are issued or retired.
12. Judge-flow testing from wallet connection → profile setup → market utility → proof → portfolio → trade → PnL → post → follow → notification → public profile.
