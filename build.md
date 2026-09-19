## Current implementation checkpoint

**Verified on 2026-09-19**

- Main branch uses the WGG workspace as the live entry point; Reown is the active wallet integration.
- The WGG protection API accepts `SOLANA_RPC_URL`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY` from the Vercel server environment.
- Duplicate/unreferenced WGG modules were removed: `WeekendGapGuardWorkspaceV2.tsx`, `kaminoProtection.ts`, `wggKamino.ts`, and `WalletAuthGate.tsx`.
- TypeScript is restricted to the live WGG source dependency graph instead of checking the legacy StockPass UI tree.
- The protection workspace compile error from the duplicate `targetLtvPct` declaration is fixed.
- Repay preparation no longer depends on a browser Pyth price for its amount; the Vercel endpoint recalculates the repay amount from fresh Kamino debt state, live debt-reserve oracle price and mint decimals.
- GitHub Actions now passes dependency installation, `tsc --noEmit --pretty false`, and the WASM production build.\n- Vercel reports the corrected WGG deployment as READY, and its deployment root returns HTTP 200.\n- The browser signer bridge now uses a local minimal wallet-provider interface, has no duplicate React hook imports, and reconstructs `TransactionInstruction.data` using the `Buffer` shape required by the installed Solana web3 types.\n- The remaining gate is runtime verification: production Pyth configuration plus one real wallet-authenticated protection-prepare/sign/submit smoke test.

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
- Pyth was investigated as a possible market-data provider, but the current 14-day Pyth Pro demo key is not entitled to the required US-equity feeds (the authenticated NVDA test returned "Not entitled" for the NVDA equity feed). Pyth is therefore **deferred and is not the source of truth for WGG market data in the current architecture**.
- The project instead uses xStocks-native public market/asset data for current xStock state and a separate historical OHLC provider for the 13-week weekend-gap model.
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
- explicit Kamino + xStocks data-source context
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

## Pyth investigation milestone — deferred

Pyth Pro/Lazer was tested with the project's real authenticated demo API key.

Verified behavior on 2026-09-19:
- The Playground can select a much larger catalog than the trial entitlement actually grants.
- An authenticated multi-feed test returned explicit `Not entitled` errors for many crypto/FX feeds.
- An authenticated NVDA test returned `Not entitled` for the NVDA equity feed and also reported one inactive feed.
- Therefore the current demo key cannot be treated as a reliable source for the US-equity data required by Weekend Gap Guard.

Decision:
- **Do not make Pyth Pro a required StockPass dependency.**
- Keep the existing Pyth adapters dormant for possible future independent cross-checking.
- Do not expose any Pyth API key in the frontend.
- Do not pay for a Pyth Pro equity plan unless a later product requirement specifically justifies it.

The current WGG market-data architecture is xStocks-first instead.

## xStocks-native market-data milestone — 2026-09-19

The project is explicitly built around Solana xStocks, so the xStocks public developer API becomes the primary source for current asset metadata and current xStock market data.

Current xStocks documentation states that public endpoints expose:
- asset metadata
- market price data
- multiplier values
- proof-of-reserves information
- oracle feeds
- corporate-action schedules
- public xStocks wallet addresses

For Solana xStocks:
- tokens use SPL Token-2022 with the Scaled UI Amount extension
- raw on-chain balance remains constant through corporate actions
- displayed/scaled balance is derived as raw amount × multiplier
- raw amounts are used when building transactions

Current xStock price data is sourced through the xStocks price-data endpoint, while execution/reference quotes are available through xChange RFQ. The app should therefore keep these concerns separate:
- **current position valuation:** xStocks asset price + Solana raw balance + xStocks multiplier
- **execution quote/reference:** xChange where needed
- **lending state:** Kamino
- **historical risk model:** separate daily OHLC source

This architecture avoids using an unrelated oracle as the primary xStock price authority.

## Historical weekend-gap milestone — revised 2026-09-19

The WGG risk model still needs approximately 13 weeks of:

`Friday close → next trading-session open`

observations.

Pyth is no longer the required historical source.

The selected first implementation source is **Twelve Data daily OHLC**:
- current public documentation advertises 800 free API requests/day
- daily historical range reaches back many years depending on symbol/market
- US equities are supported
- the WGG engine only needs daily open/close values for this calculation, not a high-frequency stream

Historical calculation:
1. Map the xStock symbol to its underlying equity symbol (for example AAPLx → AAPL, TSLAx → TSLA, NVDAx → NVDA).
2. Fetch daily OHLC history for the underlying symbol.
3. Identify valid Friday trading sessions and the next valid trading session.
4. Record Friday close and next-session open.
5. Calculate `gapPct = ((nextOpen - fridayClose) / fridayClose) * 100`.
6. Calculate downside-only gap as `max(0, -gapPct)`.
7. Produce median, p75, p90 and maximum downside statistics.
8. Use the p75 downside statistic as the first-pass `typicalWeekendGapPct` input to the WGG risk model.
9. Persist methodology, sample count and date window so the UI never presents an unexplained risk number.

Important implementation rule:
- Corporate-action-aware valuation must remain xStocks-native. xStocks' multiplier system handles dividends/splits/reverse splits; do not substitute an external provider's adjusted token balance for Solana raw xStock balance.
- The historical provider is used only for the **risk-model dataset**, not as the authority for the user's actual xStock balance or Kamino collateral value.
- If historical data is unavailable or insufficient, WGG must show an explicit unavailable state instead of fabricating a gap statistic.

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

1. Replace the current Pyth-backed WGG price/history adapters with the xStocks-native current-price path and Twelve Data daily-history path.
2. Verify the revised market-data adapters against real xStock symbols and their underlying tickers.
3. Verify the new WASM-aware Vercel build reaches READY.
4. Complete wallet-signature integration for prepared Kamino actions without giving the app any standing authorization.
5. Add repay preparation alongside the current deposit preparation, including exact debt-reserve price/decimal handling from fresh Kamino state.
6. Wire a server-side earnings-calendar adapter and treat missing calendar data as unavailable rather than inferred.
7. Populate `wgg_monitored_positions` from trusted backend checks rather than browser-submitted balances.
8. Build the Friday monitoring worker and `wgg_alerts` records.
9. Reuse the existing Telegram connection pattern for opt-in notifications.
10. Add Surfpool fixtures/cheatcodes for deterministic flagged-position demos.
11. Run an end-to-end test before using real mainnet funds.

## Testing policy

Use Surfpool for deterministic development and demo testing. The first real-mainnet smoke test should use only a minimal amount needed for wallet/signature/transaction-fee validation. Never fabricate a real position in the UI.


## Native Kamino action milestone — 2026-09-19

Added the first end-to-end native lending control surface.

- src/KaminoActionConsole.tsx adds Borrow, Lend/Supply, Add Collateral, Repay, Withdraw Collateral, and Close Position controls.
- api/kamino-market.ts reads the active Kamino Main Market reserve catalog from a server-side dedicated RPC.
- api/kamino-actions-prepare.ts uses the current klend SDK builders directly: buildDepositReserveLiquidityTxns for pure liquidity supply, buildDepositTxns for collateral, buildBorrowTxns for borrow, buildRepayTxns for repay, buildWithdrawTxns for collateral withdrawal, and buildRepayAndWithdrawTxns for the self-service close flow.
- Every obligation action reloads the current Kamino Main Market and verifies the obligation belongs to the authenticated wallet before building instructions.
- Prepared actions are recorded in wgg_platform_actions server-side.
- api/kamino-actions-verify.ts verifies the confirmed transaction on mainnet, checks the authenticated wallet signer and Kamino program ID, then records the action as confirmed.
- Verified actions trigger a fresh Kamino xStock position sync into wgg_monitored_positions.
- No private key, custody, standing authorization, or automatic transaction execution was added.

### Required Vercel server environment

- SOLANA_RPC_URL — dedicated authenticated Solana mainnet RPC; do not use the public Solana endpoint.
- SUPABASE_SERVICE_ROLE_KEY — server-only Supabase service-role key used only by the action ledger and verification endpoints.

### Required browser environment

- VITE_SOLANA_RPC_URL — authenticated Solana mainnet RPC used by the browser to fetch lookup tables and confirm the wallet-signed transaction.


## Market-data architecture decision — 2026-09-19

### Current source-of-truth split

| Concern | Source |
| --- | --- |
| xStock identity, mint, asset metadata | xStocks public API + official xStocks catalog |
| Solana xStock raw balance | Solana mainnet RPC / Token-2022 |
| Solana xStock multiplier | xStocks multiplier data / Token-2022 metadata |
| Current xStock market price | xStocks public asset price-data endpoint |
| Execution quote/reference when needed | xChange RFQ |
| Collateral, debt, LTV, liquidation state | Kamino |
| Historical Friday-close → next-session-open | Twelve Data daily OHLC |
| Weekend-gap statistics | StockPass WGG engine |
| Pyth | Deferred/optional; not required for current WGG path |

### xStocks valuation rule

For Solana Token-2022 xStocks:
- raw amount is the transaction/on-chain balance
- displayed/scaled amount = raw amount × current multiplier
- current equity value must use the xStocks market price
- corporate-action multipliers must be respected

### Non-negotiable data-integrity rule

Do not mix external historical pricing with token-balance authority:
- xStocks/Solana determines what the user actually owns
- Kamino determines what is actually collateralized/debt
- Twelve Data only supplies the historical market series used to model weekend-gap risk

### Pyth status

Pyth integration remains in the repository from earlier implementation work, but it is **not the active source-of-truth path** after the 2026-09-19 entitlement test. Future cleanup can remove or archive the Pyth adapters after the xStocks/Twelve Data path is runtime-verified.

### Documentation references

- xStocks developer docs: https://docs.xstocks.fi/developers
- xStocks multiplier docs: https://docs.xstocks.fi/developers/multipliers
- Twelve Data stock/historical data: https://twelvedata.com/stocks
