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
- New **mainnet xStock activity sync**: reads recent confirmed wallet transactions, detects supported xStock balance changes, and records them with slots, block times and confirmed transaction signatures. The decoder now conservatively classifies an xStock increase/decrease as `buy`/`sell` only when an opposite wallet-owned token movement or native-SOL payment movement exists in the same transaction; otherwise it records `receive`/`send`. Classification metadata is stored as inferred rather than presented as a guaranteed protocol-level trade fact.
- New **mainnet proof receipt**: a positive xStock holding can be saved as a timestamped `stockpass_verification_snapshots` record with the current confirmed slot, and the utility can copy a human-readable proof receipt.
- New **wallet-signature authentication**: a 5-minute challenge message, Ed25519/NaCl signature verification in a Supabase Edge Function, one-use challenge protection and a 7-day opaque wallet session stored server-side as a SHA-256 token hash.
- New **connected-wallet auth gate**: the workspace now waits for a real Solana wallet `signMessage` verification before loading profile/workspace data. Signing is explicitly non-transactional.
- New **Supabase session propagation**: the opaque signed-wallet session is attached to PostgREST requests without replacing Supabase's normal publishable-key Authorization header.
- New **wallet-scoped RLS**: all StockPass tables now have RLS enabled. Public catalog/profile/feed tables retain public-read policies; wallet-owned records require the active signed wallet session. Wallet auth challenge/session rows remain server-only and have no browser policies.
- New **Discover identity resolution**: feed posts now resolve each unique author wallet against `stockpass_profiles` and pass the saved display name plus `@username` into post cards, while retaining the wallet/profile navigation fallback for accounts without a profile.
- New **connected-workspace Market mount**: the StockPass Market Utility is now mounted alongside the main workspace rather than existing as an unused component, so the 732-asset catalog, asset detail, proof, alert and provenance surface is reachable from the connected app.
- New **server-side PnL proxy**: StockPass PnL requests now go through the `stockpass-pnl` Supabase Edge Function instead of exposing a Birdeye API key in the browser. The proxy uses Birdeye's current `token_addresses` parameter and WAC PnL method, while limiting requests to StockPass-approved xStock mints. The API key is read only from the Edge Function environment.
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

StockPass-specific tables include:
- `stockpass_wallet_auth_challenges` for wallet-signature authentication/nonces.
- `stockpass_wallet_auth_sessions` for hashed opaque authentication sessions.
- `stockpass_position_events` for mainnet ownership/provenance events and transaction signatures.
- `stockpass_trade_intents` for quote/sign/submit/confirm state around eventual real wallet-signed actions.
- `stockpass_pnl_snapshots` for durable portfolio/PnL snapshots.

These tables are data foundations only; they do not create simulated balances or execute trades by themselves.

## Additions from the StockPass additions pack

- `stockpass_telegram_links` database table for wallet → Telegram chat linking.
- Telegram deep-link client helper.
- Telegram webhook Edge Function source with webhook-secret validation and Solana-address validation.
- Scheduled price-alert worker source using Jupiter Price API, in-app activity events and optional Telegram delivery.
- xStock-scoped portfolio PnL helper originally supplied as a browser-side Birdeye integration.
- Compact connected-workspace tools panel that exposes Telegram alerts and PnL when the corresponding integrations are configured.
- The PnL browser key exposure has now been removed: the client calls `stockpass-pnl`, and the Birdeye key belongs in Supabase secrets instead.

The Telegram migration has been applied to the existing StockPass Supabase project. The Telegram Edge Functions remain source-only until bot credentials and scheduling are configured. The `stockpass-pnl` Edge Function is now deployed; it returns a clear configuration error until `BIRDEYE_API_KEY` is supplied as a Supabase secret.

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

**Wallet authentication and RLS are now active.** The browser obtains a short-lived challenge from the `wallet-auth` Edge Function, signs it with the connected Solana wallet, receives a 7-day opaque session token, and keeps only the token client-side. The database stores only its SHA-256 hash. Supabase requests carry the opaque token through the existing `x-client-info` header while retaining the normal publishable-key Authorization header. The RLS resolver hashes that token and maps it to the authenticated wallet before wallet-owned policies are evaluated.

The current database verification shows all 15 StockPass tables have RLS enabled. The public catalog/assets/profile/feed records have read policies where required; wallet-owned profile, alert, follow, notification, activity, Telegram, position, trade-intent and PnL mutations are wallet-scoped. Challenge/session tables have RLS enabled with zero browser policies because only the wallet-auth Edge Function's service-role client should access them.

## Integration setup still required

Telegram delivery requires:
- a Telegram bot created through BotFather
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `VITE_TELEGRAM_BOT_USERNAME`
- deployed `telegram-webhook` and `alerts-worker` Edge Functions
- a scheduled worker invocation

PnL requires a `BIRDEYE_API_KEY` Supabase secret for the new `stockpass-pnl` Edge Function.

## Current next targets

1. Validate the new buy/sell/receive/send activity decoder against real mainnet transactions and tune false-positive boundaries.
2. Build the remaining Telegram connection/settings UX and notification controls.
3. Deploy the StockPass alerts worker once the required bot/Jupiter secrets and schedule are available.
4. Derive durable cost basis and realized/unrealized PnL from transaction/provenance history and persist snapshots server-side.
5. Detect position reductions/sells and create seller-proof records tied to confirmed signatures.
6. Upgrade Discover into a first-class 732-asset xStock discovery experience with following-aware feed tabs, search and direct asset navigation.
7. Expand the Market utility hub into dedicated asset screens with charts, provenance, holder context and action receipts.
8. Keep the official xStock catalog synchronized as new Solana assets are issued or retired.
9. Judge-flow testing from wallet connection → signature verification → profile setup → market utility → proof → portfolio → alerts/Telegram → PnL → post → follow → notification → public profile.

## Build verification

The latest StockPass production deployment before the PnL hardening is `dpl_7zS63EZjNSanzqcmQiikNXBhgPvp`, triggered by the workspace-market mount. The PnL hardening commits are now on `main`, and Vercel should create the next production deployment automatically.
