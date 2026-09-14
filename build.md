# StockPass build log

## Product direction

StockPass is an independent Solana utility + social-trading product. The product identity, interaction model and visual system are original to StockPass. External products may be studied for quality standards, but StockPass does not reproduce their branding, layouts or architecture.

## Core idea

> Anyone can post a screenshot. StockPass can prove what the wallet held on Solana when the claim was made.

StockPass is utility-first with social built around the utility:
- **Utility** — portfolio, xStock balances, official market data, proof snapshots, alerts and eventually signed mainnet actions.
- **Signals** — asset context, wallet activity and useful alerts.
- **Social** — posts, profiles, follows and notifications that make verified information easier to discover and share.

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
- Portfolio verification view for the connected wallet.
- Alert persistence.
- Mobile navigation and responsive layouts.
- Social timeline visual language inspired by modern consumer feeds: name + @username identity, flat timeline posts, profile tabs, follow actions and compact proof indicators, while retaining original StockPass styling and terminology.
- Landing page is the default disconnected experience; the full workspace is lazy-loaded only after a wallet connects so workspace imports cannot block the public landing page.
- Landing page now presents StockPass as a **utility-first xStock platform**: live portfolio, mainnet proof, market context, alerts and future action are the primary story; profiles and social discovery are explicitly secondary context.

## Additions from the StockPass additions pack

- `stockpass_telegram_links` database table for wallet → Telegram chat linking.
- Telegram deep-link client helper.
- Telegram webhook Edge Function source with webhook-secret validation and Solana-address validation.
- Scheduled price-alert worker source using Jupiter Price API, in-app activity events and optional Telegram delivery.
- xStock-scoped portfolio PnL helper using Birdeye's Wallet PnL endpoint.
- Compact connected-workspace tools panel that exposes Telegram alerts and PnL when the corresponding integrations are configured.

The Telegram migration has been applied to the existing StockPass Supabase project. The Edge Functions are committed to the repository but are not deployed until their required Telegram secrets are configured. The PnL browser helper is optional; for production the Birdeye key should be moved behind an Edge Function rather than exposed to the browser.

## UX principles

StockPass should feel like a **useful onchain market utility with a social context**, not a generic crypto dashboard and not a social network that happens to display balances.

The hierarchy is:
1. Portfolio and market utility.
2. Proof and verification.
3. Alerts and useful signals.
4. Social discovery and identity.

The UI emphasizes:
- clear hierarchy over decorative cards
- proof state next to the claim it validates
- live portfolio utility before social mechanics
- market context beside positions and alerts
- fast wallet/profile navigation
- profile identity built around display name + @username, with wallet address as verifiable secondary identity
- profile sections that combine social content with the user's live supported xStock holdings
- fast switching between Posts, Portfolio and Proof without leaving the public profile
- compact information density without clutter
- original StockPass visual patterns rather than copying another product
- mobile-first interaction with desktop information density
- public landing page first, workspace only after wallet connection

## Mainnet-only invariant

**Solana mainnet is the single source of truth for ownership, balances, supported asset state and transaction execution.**

There is no devnet trading environment, simulated portfolio balance or fake execution rail.

Any supported buy, sell or swap will eventually be a real Solana mainnet transaction signed by the connected wallet, with the resulting transaction signature and confirmed wallet state available for verification.

The public profile portfolio also follows this invariant: xStock balances are not copied from Supabase or manually entered profile data. They are read from the wallet's supported Solana token accounts at profile-view time.

## Database/security

The shared Supabase project contains the StockPass-specific `stockpass_*` tables alongside unrelated AgentMarket tables. Do not delete or rewrite the AgentMarket tables.

The StockPass browser client currently uses publishable Supabase credentials. RLS is still disabled on the StockPass-specific tables and must be addressed with wallet-signature authentication and wallet-scoped policies before treating the social database as production-secure.

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

1. Wallet-signature authentication and wallet-scoped RLS.
2. Real transaction history/provenance records for supported xStocks.
3. Mainnet buy/sell/swap execution with wallet signing and confirmed receipts.
4. Position-cost basis and realized/unrealized PnL derived from transaction history.
5. Seller proof for reductions/sells, not just holder proof.
6. Deploy and schedule the StockPass alerts worker.
7. Finish Telegram connection UX and notification settings.
8. Milestone-generated post drafts from verified portfolio events.
9. Improve Discover with first-class profile identities, following-aware feeds and search/discovery.
10. Judge-flow testing from wallet connection → profile setup → proof → portfolio → trade → PnL → post → follow → notification → public profile.
