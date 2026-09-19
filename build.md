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
- Nasdaq's public earnings calendar endpoint is a current candidate source for a server-side earnings adapter; the adapter must remain server-side and should treat missing/ambiguous calendar data as unavailable rather than infer a report date. Current public references document `https://api.nasdaq.com/api/calendar/earnings?date=YYYY-MM-DD`. citeturn508859search0turn508859search4
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
- exposes xStock mint decimals so a later action builder can convert a USD collateral estimate into exact base units
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

The risk module contains a first-pass protection planner for target LTV and can calculate both estimated repayment and estimated additional collateral value.

The frontend now takes the next step when a position is actually `FLAGGED`:

- derives a protection target LTV from the live liquidation LTV and adjusted weekend-gap signal
- estimates the additional collateral value required to reach that target
- converts that collateral USD estimate into xStock base units using the real reserve mint decimals and the independent Pyth price
- reloads the current Kamino market and selected obligation
- builds a real `KaminoAction.buildDepositTxns()` action with the current Kamino SDK
- exposes the resulting instruction counts as a prepared action

This stage is still **prepare-only**: it does not sign, submit, or move funds. The SDK action is built against fresh on-chain state immediately before preparation. The current Kamino SDK documents `buildDepositTxns()` and `buildRepayTxns()` as supported lending-action builders, and `KaminoAction.actionToIxs()` converts the prepared action into its instruction set. fileciteturn797file0turn807file0

## Build-system verification milestone

The first browser bundle attempt exposed an Orca WASM dependency pulled in through the Kamino SDK. Vercel's build failed while Rollup was trying to load `orca_whirlpools_core_js_bindings_bg.wasm`.

The repository already contains `vite-plugin-wasm` in `devDependencies`. Because the existing `vite.config.ts` content could not be safely replaced through the connected GitHub contents action, the build now uses two new files instead:

- `vite.config.wasm.ts` — Vite + React + `vite-plugin-wasm` configuration.
- `vercel.json` — overrides the Vercel build command to run `tsc --noEmit && vite build --config vite.config.wasm.ts`.

The latest Vercel deployment for commit `1bbbb2b2e8fe4d088723d5ab6c4cf7aef2cfef7c` is currently queued; its current error log contains no error/stderr/exit events yet. It is not being marked READY until Vercel reports a completed state.

## Wallet-authenticated protection execution milestone

The protection path has now been split from the Supabase Edge runtime because bundling the Kamino SDK inside the Edge Function timed out.

Added:

- supabase/functions/wallet-auth version 2 with a validate action for existing wallet sessions.
- api/wgg-protection-prepare.ts as a Vercel serverless function running the Kamino transaction builder outside the browser and outside the Supabase Edge bundle.
- src/WeekendGapGuardWorkspace.tsx now calls the Vercel protection endpoint with the existing wallet-session token.
- vercel.json now gives the protection function a longer execution window.

The Vercel protection endpoint:

1. validates the existing wallet session through wallet-auth
2. rejects invalid Solana addresses
3. ignores browser-supplied RPC URLs and uses Solana mainnet directly
4. reloads the Kamino Main Market and current ledger state
5. verifies the selected obligation belongs to the authenticated wallet
6. builds either a Kamino repay or deposit action using fresh state
7. returns only unsigned instruction data and lookup-table addresses
8. leaves final signing and submission to the connected wallet

No private key, signing secret, or standing transaction authorization is introduced.

The obsolete Supabase wgg-protection-prepare Edge Function source was removed from the repository after the runtime bundle timeout. The browser no longer calls that function.

The latest Vercel build is compiling the revised serverless architecture. It must still reach READY before the protection endpoint is considered production-verified.

## Earnings-risk milestone

Added `src/lib/wggEarnings.ts`, a pure earnings-risk contract that:

- accepts only a trusted calendar event
- normalizes the symbol
- determines whether the event is within the next five calendar days
- retains the reported report timing (`before_open`, `after_close`, or `unspecified`)
- explicitly returns no risk when the event is missing or invalid
- provides a separate earnings multiplier helper for the existing weekend-risk engine

The module deliberately does **not** guess earnings dates and does not yet claim live earnings data. The next step is wiring a server-side calendar adapter and validating its response before enabling the multiplier in production risk output.

## Next implementation steps

1. Configure the server-side `PYTH_API_KEY` and verify live price + historical weekend-gap responses for the supported xStock underlyings.
2. Verify the new WASM-aware Vercel build reaches READY.
3. Complete wallet-signature integration for prepared Kamino actions without giving the app any standing authorization.
4. Add repay preparation alongside the current deposit preparation, including exact debt-reserve price/decimal handling from fresh Kamino state.
5. Wire a server-side earnings-calendar adapter and treat missing calendar data as unavailable rather than inferred.
6. Populate `wgg_monitored_positions` from trusted backend checks rather than browser-submitted balances.
7. Build the Friday monitoring worker and `wgg_alerts` records.
8. Reuse the existing Telegram connection pattern for opt-in notifications.
9. Add Surfpool fixtures/cheatcodes for deterministic flagged-position demos.
10. Run an end-to-end test before using real mainnet funds.

## Testing policy

Use Surfpool for deterministic development and demo testing. The first real-mainnet smoke test should use only a minimal amount needed for wallet/signature/transaction-fee validation. Never fabricate a real position in the UI.
