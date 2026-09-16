# Weekend Gap Guard build log

## Project direction

Weekend Gap Guard is the new STOCKLANA project being built on the repository `main` branch.

It is a protection overlay for real Kamino xStock lending positions on Solana. It does not replace Kamino, custody user funds, or automatically move funds. The core flow is:

1. Discover the connected wallet's real Kamino obligations.
2. Filter obligations that use supported xStocks as collateral.
3. Read Kamino's current collateral, debt and health/liquidation state.
4. Estimate typical Friday-close → Monday/next-session-open gap risk.
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
- Pyth's current documentation distinguishes regular-session US equity feeds on Pyth Core from extended-hours equity feeds that moved to Pyth Pro. Weekend Gap Guard's risk model is designed around the requested regular-session close/open measurement rather than assuming every equity feed is 24/7 on Pyth Core.
- Surfpool is the planned local test environment for a fork of real Solana mainnet state so demo positions can be tested without real funds.
- STOCKLANA is currently live on the Solana hackathon site and is the target hackathon for this build.

## First implementation milestone

### Risk engine

Added `src/lib/wggRisk.ts` with a pure, backend-input-driven first-pass risk model. It accepts a current buffer, typical weekend gap and optional earnings adjustment and returns `safe`, `watch` or `flagged`.

The module now also contains two algebraic action-planning helpers:

- `calculateRepayUsdForTargetLtv()` estimates debt repayment required to reach a target LTV while holding collateral value constant.
- `calculateCollateralUsdForTargetLtv()` estimates additional collateral value required to reach a target LTV while holding debt constant.

These are planning estimates only. They do not construct or send a transaction, and final action construction must re-read current Kamino state immediately before a wallet signature.

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

The current buffer is deliberately conservative: the lowest liquidation threshold among the xStock collateral reserves is compared with Kamino's account LTV. It is a risk signal for Weekend Gap Guard and is not presented as a replacement for Kamino's own liquidation engine. The final risk model combines this live buffer with the independently modeled weekend gap.

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

## Historical weekend-gap milestone

Added:

- `supabase/functions/wgg-weekend-gap/index.ts` — server-side 13-week historical gap engine, capped at 26 weeks per request.
- `fetchWeekendGapSummaries()` in `src/lib/pyth.ts`.
- dashboard wiring in `src/WeekendGapGuardWorkspace.tsx`.
- deployed Supabase Edge Function: `wgg-weekend-gap` version 2.

The historical engine:

1. derives each discovered xStock's underlying symbol from the real Kamino position
2. resolves the corresponding Pyth Core equity feed server-side
3. requests a Friday 15:59 America/New_York near-close observation
4. requests the next available weekday 09:30 America/New_York session observation, with a weekday fallback for market holidays
5. calculates the Friday-to-next-session return and the downside-only gap `max(0, -return)`
6. reports median, 75th percentile, 90th percentile and maximum downside statistics
7. uses the 75th percentile of downside observations as `typicalWeekendGapPct` for the first-pass WGG risk model
8. returns the exact feed ID, sample count, date window and methodology so the frontend does not present an unexplained number

The Friday timestamp intentionally uses 15:59 rather than exactly 16:00 because the current Pyth v2 timestamp endpoint returns the first update whose publish time is at or after the requested timestamp. This avoids a Friday query accidentally jumping directly to a later session.

The frontend now feeds `current liquidation buffer + typical historical downside gap` into `evaluateWeekendRisk()` and shows the resulting `SAFE`, `WATCH` or `FLAGGED` state alongside each xStock.

No historical risk value is fabricated: when the Pyth API key is not configured or the feed has no usable observations, the UI shows an explicit unavailable state.

## Protection action-planning milestone

The risk module now exposes a first-pass protection planner. For a flagged obligation, the planner can derive:

- the worst adjusted weekend-gap signal among the obligation's xStock collateral
- a target LTV using the model's existing 120%-of-gap watch boundary below liquidation LTV
- an estimated debt repayment amount needed to reach that target
- an estimated additional collateral value needed to reach that target

The planner is intentionally non-executing. A final Kamino transaction must be constructed against fresh on-chain reserve/obligation data immediately before signing because debt accrual, token decimals, balances, current liquidation parameters and other state can change after the monitoring scan.

## Next implementation steps

1. Configure the server-side `PYTH_API_KEY` and verify live price + historical weekend-gap responses for the supported xStock underlyings.
2. Wire the protection-plan estimates into the dashboard presentation for flagged obligations.
3. Build exact Kamino repay/deposit transaction construction using the current `klend-sdk` action builders and wallet-signature flow.
4. Add a verified earnings-calendar adapter behind the server side.
5. Populate `wgg_monitored_positions` from trusted backend checks rather than browser-submitted balances.
6. Build the Friday monitoring worker and `wgg_alerts` records.
7. Reuse the existing Telegram connection pattern for opt-in notifications.
8. Add Surfpool fixtures/cheatcodes for deterministic flagged-position demos.
9. Run an end-to-end test before using real mainnet funds.

## Testing policy

Use Surfpool for deterministic development and demo testing. The first real-mainnet smoke test should use only a minimal amount needed for wallet/signature/transaction-fee validation. Never fabricate a real position in the UI.
