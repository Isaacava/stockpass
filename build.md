# Weekend Gap Guard build log

## Project direction

Weekend Gap Guard is the new STOCKLANA project being built on the repository `main` branch.

It is a protection overlay for real Kamino xStock lending positions on Solana. It does not replace Kamino, custody user funds, or automatically move funds. The core flow is:

1. Discover the connected wallet's real Kamino obligations.
2. Filter obligations that use supported xStocks as collateral.
3. Read Kamino's current collateral, debt and health/liquidation state.
4. Estimate typical Friday-close → Monday-open gap risk.
5. Overlay upcoming earnings risk where relevant.
6. Run the protection check before the weekend.
7. Alert the user when the current buffer may not cover the modeled gap.
8. Prepare a specific Kamino repay/deposit action for the user to review and sign.

Every fund-moving action remains wallet-signed by the user. No standing authorization and no custody.

## Important environment rule

- `main` = Weekend Gap Guard.
- `stockpass` = preserved previous StockPass application.
- AgentMarket infrastructure is completely out of scope and must not be changed.
- Existing StockPass Supabase project is reused for this project because no additional Supabase project is available on the current plan.
- New tables are namespaced with `wgg_` to keep the old StockPass data isolated.

## Current research verification

Current-source verification was performed before implementation began.

- Kamino's current TypeScript SDK is `@kamino-finance/klend-sdk`. The current package is published as 12.0.0 and documents `KaminoMarket` reads plus `KaminoAction` lending operations. The official repository and package should remain the source of truth for API changes.
- Kamino's current mainnet Main Market address used by the SDK examples is `7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF`.
- Pyth Core was upgraded on August 26, 2026. Current Hermes/Benchmarks requests require API-key authentication, and current historical Benchmarks queries are timestamp-based. The API key must stay server-side.
- Pyth's current documentation distinguishes regular-session US equity feeds on Pyth Core from extended-hours equity feeds that moved to Pyth Pro. Weekend Gap Guard's risk model is designed around the official data source appropriate to the requested market session, rather than assuming every equity feed is 24/7 on Pyth Core.
- Surfpool is the planned local test environment for a fork of real Solana mainnet state so demo positions can be tested without real funds.
- STOCKLANA is currently live on the Solana hackathon site and is the target hackathon for this build.

## First implementation milestone

### Risk engine

Added `src/lib/wggRisk.ts` with a pure, backend-input-driven first-pass risk model. It accepts a current buffer, typical weekend gap and optional earnings adjustment and returns `safe`, `watch` or `flagged`.

This module does not fetch market data and does not invent positions. It is intentionally isolated so the mathematical rule can be tested independently from Kamino/Pyth integrations.

### Supabase

Added the following Weekend Gap Guard tables to the existing StockPass Supabase project:

- `wgg_monitored_positions`
- `wgg_alerts`
- `wgg_telegram_links`
- `wgg_check_runs`

RLS is enabled. These tables are intended to be populated by trusted backend workers rather than fabricated from frontend state.

### Frontend shell

Replaced the old main-branch StockPass workspace entry point with `WeekendGapGuardWorkspace`.

The first UI establishes:

- Weekend Gap Guard identity
- Solana mainnet status
- wallet connection
- protection-oriented dashboard
- explicit Kamino + Pyth data-source context
- empty-state position discovery area
- explanation of Discover → Assess → Protect flow

The UI intentionally does not show fake Kamino balances or fake risk readings.

## Live Kamino discovery milestone

### Current SDK integration

Added `@kamino-finance/klend-sdk` 12.x and the SDK's required Solana Kit dependencies to the main-branch application.

Added `src/lib/kamino.ts` which:

- connects to the configured Solana mainnet RPC
- loads Kamino's Main Market using the current SDK
- obtains the SDK's current ledger instant
- reads all user obligations for the connected wallet
- resolves reserve liquidity mints through Kamino's current reserve API
- resolves the supported Solana xStock catalog through the existing official xStocks API adapter
- filters the wallet's Kamino obligations to those containing an official xStock reserve
- returns the real obligation address, xStock mint/symbol, collateral amount, debt reserves, account LTV and SDK-provided deposit/borrow values
- extracts the applicable xStock reserve liquidation threshold and exposes a conservative liquidation buffer signal as `liquidation LTV - current account LTV`

The dashboard now has a real **Scan my Kamino positions** action. It performs a read-only mainnet scan and displays only positions actually returned by Kamino. No test balance is injected when the wallet has no matching position.

The UI also exposes the latest scan time, errors, refresh action, obligation identifier, xStock collateral amounts, LTV, liquidation LTV, current liquidation buffer, deposit value, borrow value and debt-asset count.

### Liquidation-buffer scope note

The current buffer is deliberately conservative: the lowest liquidation threshold among the xStock collateral reserves is compared with Kamino's account LTV. It is a risk signal for Weekend Gap Guard and is not presented as a replacement for Kamino's own liquidation engine. The final risk model will combine this live buffer with the independently modeled weekend gap.

## Pyth live-price milestone

Added:

- `src/lib/pyth.ts` — browser-safe client adapter that calls the protected backend function rather than embedding a Pyth key.
- `supabase/functions/wgg-pyth/index.ts` — server-side Pyth adapter.
- deployed Supabase Edge Function: `wgg-pyth`.

The function:

1. receives a list of underlying equity symbols derived from the actual xStock collateral found by Kamino
2. resolves the corresponding current Pyth feed
3. retrieves the latest parsed Pyth price update
4. converts Pyth fixed-point price/exponent data into a normal USD price
5. returns the price, confidence, publish time and feed ID

The Pyth API key is read only from the server-side `PYTH_API_KEY` secret and is never included in the frontend bundle. The deployed function intentionally returns a clear `PYTH_NOT_CONFIGURED` state until the project secret is supplied.

The UI now displays the independent Pyth price beside each discovered xStock position and clearly separates it from Kamino's account state.

## Next implementation steps

1. Configure the server-side `PYTH_API_KEY` and verify live price responses for the supported xStock underlyings.
2. Add the historical Friday-close/Monday-open calculation as a backend job rather than a frontend request path.
3. Add a verified earnings-calendar adapter behind the server side.
4. Combine current liquidation buffer + historical gap + earnings overlay into the final `safe` / `watch` / `flagged` assessment.
5. Populate `wgg_monitored_positions` from trusted backend checks rather than browser-submitted balances.
6. Build the Friday monitoring worker and `wgg_alerts` records.
7. Reuse the existing Telegram connection pattern for opt-in notifications.
8. Build exact Kamino repay/deposit transaction construction and user-signature flow.
9. Add Surfpool fixtures/cheatcodes for deterministic flagged-position demos.
10. Run an end-to-end test before using real mainnet funds.

## Testing policy

Use Surfpool for deterministic development and demo testing. The first real-mainnet smoke test should use only a minimal amount needed for wallet/signature/transaction-fee validation. Never fabricate a real position in the UI.
