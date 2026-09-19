# StockPass — Weekend Gap Guard Build Log

**Repository:** `Isaacava/stockpass`  
**Branch:** `main`  
**Project:** StockPass / Weekend Gap Guard (WGG)  
**Checkpoint:** 2026-09-19  
**Purpose:** Current implementation state and handoff source of truth for future work.

> **Important:** `main` is the current Weekend Gap Guard build. The `stockpass` branch is the preserved older StockPass application. AgentMarket is completely out of scope.

---

## 1. Product direction

Weekend Gap Guard is a non-custodial protection and monitoring layer for real **Solana xStocks positions used with Kamino**.

The product does not replace Kamino, does not custody user funds, and does not receive standing transaction authority.

Core flow:

1. Connect the user's Solana wallet.
2. Discover real Kamino obligations for that wallet.
3. Identify supported xStock collateral.
4. Read actual Kamino collateral, debt, account LTV and liquidation thresholds.
5. Value the user's xStock using the xStocks-native asset price and Token-2022 multiplier rules.
6. Build a historical weekend-gap profile for the underlying equity.
7. Combine the current Kamino liquidation buffer with the modeled downside weekend gap.
8. Surface a risk state and explain the evidence behind it.
9. Offer a concrete Kamino protection action for the user to review and sign.
10. Continue monitoring and alert the user before/around high-risk weekends.

No fabricated balances, fake Kamino positions, fake risk values, automatic liquidation, or custodial signing.

---

## 2. Authoritative data architecture — current decision

The current source-of-truth split is:

| Concern | Source of truth |
| --- | --- |
| xStock identity, symbol, mint, asset metadata | xStocks official API/catalog |
| Solana xStock raw balance | Solana mainnet RPC / Token-2022 |
| xStock Token-2022 multiplier | xStocks multiplier data / Token-2022 metadata |
| Current xStock market price | xStocks public asset price-data |
| Optional execution/reference quote | xChange RFQ |
| Collateral, debt, account LTV, liquidation state | Kamino |
| Historical Friday-close → next-session-open series | Twelve Data daily OHLC |
| Weekend-gap statistics | StockPass WGG risk engine |
| Wallet transaction context | Solana mainnet activity |
| Pyth | **Deferred / optional; not required for the current WGG path** |

### Non-negotiable integrity rule

Do not mix authorities:

- **Solana** determines what the wallet actually owns.
- **xStocks** determines current xStock asset pricing and multiplier/corporate-action context.
- **Kamino** determines actual collateral, debt, LTV and liquidation state.
- **Twelve Data** is used only for historical market data needed by the statistical weekend-gap model.
- Historical pricing must never be used to invent token balances or Kamino balances.

---

## 3. Why Pyth was removed from the required path

Pyth was originally used for two WGG jobs:

1. current asset price
2. historical Friday-close → next-session-open samples

The real authenticated Pyth Pro/Lazer trial key was tested in the official Playground.

The result showed:

- the Playground can display/select a much larger global feed catalog than the current grant permits;
- many selected feeds returned explicit `Not entitled` errors;
- an authenticated NVDA test returned `Not entitled` for the NVDA equity feed and also reported an inactive feed.

Therefore the current Pyth demo key must **not** be treated as the reliable US-equity source for WGG.

Decision:

- Do not make Pyth Pro a required StockPass dependency.
- Do not pay for a Pyth equity plan solely for this project at the current stage.
- Keep the existing Pyth adapters dormant temporarily for possible future independent price cross-checking.
- Never expose a Pyth API key in the browser.

Pyth can be reconsidered later as an independent oracle/check, but it is not required for the current end-to-end architecture.

---

## 4. xStocks-first market-data model

StockPass is specifically built around xStocks, so the asset layer should be xStocks-native.

Current xStocks documentation exposes public developer data for:

- asset metadata
- current price data
- multiplier information
- proof of reserves
- oracle-related data
- corporate actions
- public addresses

For Solana xStocks:

- they use Token-2022;
- the Scaled UI Amount extension is relevant to displayed amounts;
- raw token amounts are the actual on-chain amounts;
- displayed/scaled amounts are derived using the applicable multiplier;
- transaction amounts must use the correct raw/base-unit amount.

### xStock valuation rule

Example:

`AAPLx → AAPL`

1. Read actual AAPLx raw balance from Solana.
2. Read the applicable xStocks multiplier.
3. Derive the displayed/scaled xStock amount.
4. Obtain current xStocks asset price.
5. Calculate current position value.
6. Keep raw balance and transaction amount separate from display/scaled value.

Do not substitute an external provider's adjusted balance for the real Token-2022 balance.

### Current price vs execution quote

These are separate concepts:

- **Position valuation:** xStocks current price.
- **Execution/reference quote:** xChange RFQ where the product flow needs an executable/reference quote.

---

## 5. Historical weekend-gap model

WGG still needs a historical dataset for:

**Friday close → next trading-session open**

The first-pass window is approximately **13 weeks**.

### Historical source

Use **Twelve Data daily OHLC** as the first implementation source.

The model only needs:

- trading date
- open
- close

It does not need a 200ms live stream for this calculation.

### Symbol mapping

The historical provider is queried using the **underlying equity symbol**, not the Solana token symbol.

Examples:

- AAPLx → AAPL
- TSLAx → TSLA
- NVDAx → NVDA
- SPYx → SPY
- QQQx → QQQ

The xStock mapping must come from the trusted xStocks catalog rather than free-form user input.

### Calculation

For each valid week:

`gapPct = ((nextSessionOpen - fridayClose) / fridayClose) * 100`

Downside-only gap:

`downsideGapPct = max(0, -gapPct)`

Aggregate:

- sample count
- median gap
- p75 gap
- p90 gap
- maximum downside gap
- typical downside weekend gap

First-pass WGG policy:

- use the **75th percentile of downside observations** as `typicalWeekendGapPct`;
- retain the methodology and date window;
- never show a fabricated number when data is missing or insufficient.

### Trading-calendar rule

Do not assume every Friday is followed by Monday.

The historical worker must:

1. identify a real Friday trading session;
2. find the next valid trading session;
3. record Friday close;
4. record next-session open;
5. calculate the gap;
6. skip invalid/missing observations rather than manufacturing values.

---

## 6. Existing WGG risk model

File:

`src/lib/wggRisk.ts`

The current risk engine is pure and backend-input-driven.

Main input concept:

- current liquidation buffer
- modeled typical downside weekend gap
- optional earnings risk adjustment

Risk statuses:

- `safe`
- `watch`
- `flagged`

Planning helpers include:

- `calculateRepayUsdForTargetLtv()`
- `calculateCollateralUsdForTargetLtv()`

These are planning calculations only.

They must never be treated as a transaction or as authoritative Kamino state.

Before a transaction is prepared, Kamino state must be reloaded.

---

## 7. Earnings-risk module

File:

`src/lib/wggEarnings.ts`

The module:

- accepts only trusted calendar input;
- normalizes the symbol;
- detects whether an event is within the next five calendar days;
- retains report timing (`before_open`, `after_close`, `unspecified`);
- returns no risk when the event is missing/invalid;
- provides a separate earnings multiplier helper.

It deliberately does **not** guess earnings dates.

Next step:

- add a server-side earnings calendar adapter;
- validate the response;
- treat unavailable/ambiguous calendar data as unavailable;
- never invent an earnings date.

---

## 8. Live Kamino integration

File:

`src/lib/kamino.ts`

Current live capabilities:

- connect to configured Solana mainnet RPC;
- load Kamino Main Market;
- obtain current SDK ledger instant;
- discover the wallet's real Kamino obligations;
- resolve reserve liquidity mints;
- resolve supported xStock reserves;
- filter obligations to xStock-backed positions;
- return real obligation address;
- return xStock symbol/mint;
- return collateral amount;
- return debt reserve information;
- return account LTV;
- return deposit/borrow values;
- expose mint decimals;
- expose liquidation threshold;
- calculate a conservative liquidation-buffer signal.

Current Kamino Main Market address used by the implementation:

`7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF`

Current Kamino program ID used by the implementation:

`KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD`

The dashboard's **Scan my Kamino positions** action is read-only and displays only real positions returned by Kamino.

No balances are injected when the wallet has no matching position.

---

## 9. Native Kamino action console

File:

`src/KaminoActionConsole.tsx`

The current control surface provides:

- Borrow
- Lend / Supply
- Add collateral
- Repay
- Withdraw collateral
- Close position

The implementation uses the current Kamino SDK action builders:

- `buildDepositReserveLiquidityTxns()` for pure liquidity supply
- `buildDepositTxns()` for collateral
- `buildBorrowTxns()` for borrow
- `buildRepayTxns()` for repay
- `buildWithdrawTxns()` for collateral withdrawal
- `buildRepayAndWithdrawTxns()` for close

Server APIs:

- `api/kamino-market.ts`
- `api/kamino-actions-prepare.ts`
- `api/kamino-actions-verify.ts`

### Action safety model

For wallet actions:

1. validate the wallet session;
2. reload Kamino Main Market;
3. reload current ledger/state;
4. validate the selected obligation belongs to the wallet;
5. build unsigned instructions;
6. record the intent/action in `wgg_platform_actions`;
7. return unsigned instructions to the browser;
8. let the connected wallet sign;
9. submit/confirm on mainnet;
10. verify the confirmed transaction server-side;
11. refresh Kamino state.

No private key is stored by StockPass.

No standing authorization exists.

No automatic transaction execution exists.

---

## 10. Platform-action ledger

Migration:

`supabase/migrations/0005_wgg_platform_actions.sql`

Live table:

`public.wgg_platform_actions`

Fields include:

- `id`
- `wallet`
- `action_type`
- `obligation_address`
- `reserve_address`
- `withdraw_reserve_address`
- `amount_base_units`
- `withdraw_amount_base_units`
- `status`
- `transaction_signature`
- `kamino_program_id`
- `metadata`
- `created_at`
- `submitted_at`
- `confirmed_at`

Statuses:

- `prepared`
- `submitted`
- `confirmed`
- `failed`
- `expired`

RLS is enabled and writes/reads are intended to happen through trusted backend/service-role paths.

---

## 11. Platform API files added

### `api/kamino-market.ts`

GET endpoint that:

- requires `SOLANA_RPC_URL`;
- loads Kamino Main Market server-side;
- returns active reserve catalog;
- returns reserve address, symbol, mint, decimals and oraclePrice.

### `api/kamino-actions-prepare.ts`

POST endpoint that:

- requires server RPC and Supabase service-role key;
- validates wallet/action/amount/reserve input;
- validates the wallet session;
- reloads Kamino state;
- verifies obligation ownership where applicable;
- builds the selected SDK action;
- serializes unsigned instructions and lookup tables;
- records the prepared action.

### `api/kamino-actions-verify.ts`

POST endpoint that:

- validates wallet session;
- loads the action ledger row;
- retrieves the confirmed Solana transaction;
- verifies the authenticated wallet signer;
- verifies the transaction includes the Kamino program;
- marks the action confirmed;
- refreshes the wallet's Kamino xStock position state.

Important future hardening:

- verify the exact intended action/instruction contents more deeply instead of relying primarily on signer + Kamino-program presence.

---

## 12. WGG database tables

Existing WGG tables:

- `wgg_monitored_positions`
- `wgg_alerts`
- `wgg_telegram_links`
- `wgg_check_runs`
- `wgg_project_docs`
- `wgg_platform_actions`

WGG monitored positions include fields such as:

- wallet
- Kamino market
- obligation address
- xStock collateral mint
- symbol
- collateral amount
- collateral USD value
- debt USD
- health factor
- liquidation LTV
- current buffer
- typical weekend gap
- earnings risk
- risk status
- recommended repayment
- recommended additional collateral
- last checked timestamp

Risk statuses include:

- `unknown`
- `safe`
- `watch`
- `flagged`
- `stale`

---

## 13. Existing wallet/activity context

The repository contains an older Solana activity subsystem:

`src/lib/solanaActivity.ts`

It can inspect recent Solana transaction/token-balance changes and classify context such as:

- trade inferred
- transfer inferred
- buy
- sell
- receive
- send

Important rule:

These labels are **context only**.

They are not the authoritative source for Kamino collateral/debt.

Correct pattern:

`on-chain activity → mark position/context dirty → refresh Kamino state → evaluate WGG`

Never derive authoritative lending state from heuristic wallet-activity classification.

---

## 14. Telegram

Existing WGG Telegram link infrastructure:

`wgg_telegram_links`

The intended future workflow is:

1. user explicitly opts in;
2. Telegram identity is linked;
3. trusted backend worker generates alert;
4. alert is deduplicated in `wgg_alerts`;
5. Telegram notification is sent;
6. user can acknowledge the alert.

No unsolicited messaging and no frontend-generated alert claims.

---

## 15. Existing Pyth code — dormant

Pyth-related files currently remain in the repository from the earlier architecture:

- `src/lib/pyth.ts`
- `supabase/functions/wgg-pyth/index.ts`
- `supabase/functions/wgg-weekend-gap/index.ts`

These are **not the target architecture anymore**.

They should eventually be:

- replaced by xStocks current-price handling;
- replaced by Twelve Data historical OHLC handling;
- removed or archived after the new paths are runtime-verified.

Do not leave the repository with two competing "sources of truth" in active runtime code.

---

## 16. Vite / WASM build handling

The Kamino SDK pulls dependencies that require WASM support.

Current build support includes:

- `vite-plugin-wasm`
- `vite.config.wasm.ts`
- `vercel.json` build override

The production build command is configured around TypeScript checking plus the WASM-aware Vite build.

The build system previously failed when Rollup could not correctly load an Orca WASM dependency pulled through the Kamino SDK. The WASM-aware configuration was added to address this.

---

## 17. CI and deployment state

GitHub Actions workflow:

**StockPass build**

Checks:

- dependency install
- `tsc --noEmit --pretty false`
- WASM production build

Known previous TypeScript issue:

`WeekendGapGuardWorkspace.tsx` had a wallet-address narrowing issue; the current fix passes the wallet address using the appropriate fallback.

The repository has also had successful CI/build checkpoints before the newest market-data refactor.

The main remaining work is runtime verification of the xStocks/Twelve Data path and the complete wallet-action flow.

---

## 18. Environment requirements

### Server-side Vercel

Required:

`SOLANA_RPC_URL`

- authenticated/dedicated Solana mainnet RPC;
- do not use the public Solana RPC for production.

`SUPABASE_SERVICE_ROLE_KEY`

- server-only;
- never expose in browser.

Existing Supabase configuration as required by the deployed functions.

### Browser

`VITE_SOLANA_RPC_URL`

- authenticated Solana mainnet RPC used for lookup tables and transaction confirmation.

### Historical market data

A server-side Twelve Data credential/configuration will be required once the historical adapter is implemented.

Do not put provider secrets in the React bundle.

### Pyth

`PYTH_API_KEY` is **not required for the current WGG path**.

---

## 19. Security / custody rules

Non-negotiable:

- no private keys;
- no custodial funds;
- no standing transaction permissions;
- no automatic liquidation;
- no fabricated position balances;
- no browser-controlled trusted Kamino state;
- no browser-controlled wallet ledger writes;
- no API secrets in frontend bundles;
- server validates wallet sessions;
- transaction preparation reloads fresh Kamino state;
- transaction verification happens after mainnet confirmation;
- action ledger is server-side.

---

## 20. Current UI direction

The WGG workspace should remain:

- mobile-first;
- clean;
- information-dense without being crowded;
- non-generic / anti-AI-slop;
- explicit about data provenance;
- explicit when data is unavailable;
- free of fake metrics;
- free of fake balances;
- focused on "Discover → Assess → Protect".

Important UI concepts:

- current Kamino position card;
- liquidation buffer;
- weekend-gap model;
- evidence / methodology;
- protection target;
- native Kamino action console;
- transaction review/sign state;
- monitoring/alert state.

---

## 21. Required market-data refactor

This is the next major implementation task.

### Replace current Pyth current-price path

Current:

`fetchPythPrices()`

Target:

1. resolve official xStock metadata/mapping;
2. obtain current xStocks price;
3. obtain Solana Token-2022 raw balance;
4. obtain multiplier;
5. calculate current position value;
6. feed current value into WGG.

### Replace current Pyth weekend-history path

Current:

`fetchWeekendGapSummaries()`

Target:

1. resolve xStock → underlying equity symbol;
2. fetch Twelve Data daily OHLC;
3. identify Friday trading dates;
4. identify the next valid session;
5. calculate close→open gaps;
6. calculate statistics;
7. persist methodology/date window/sample count;
8. return explicit unavailable state when insufficient.

---

## 22. Recommended historical implementation details

Twelve Data endpoint design can be kept server-side.

The adapter should:

- cache historical responses;
- avoid refetching the same symbol repeatedly;
- normalize exchange holidays/weekends;
- reject malformed provider data;
- protect against stale/empty datasets;
- enforce a minimum sample threshold;
- record the provider symbol used;
- record first/last date in the model;
- record the exact methodology string.

The frontend should receive only the calculated result and provenance metadata.

---

## 23. Recommended monitoring worker

Build a trusted backend worker that:

1. finds monitored/opted-in positions;
2. reloads Kamino state;
3. obtains xStocks current price/multiplier;
4. obtains the historical gap profile;
5. loads validated earnings context;
6. evaluates WGG;
7. updates `wgg_monitored_positions`;
8. inserts deduplicated `wgg_alerts`;
9. records `wgg_check_runs`;
10. optionally sends Telegram notifications.

The worker must never trust client-submitted balances.

---

## 24. Friday monitoring

Future scheduled run:

- refresh monitored positions;
- refresh current xStock prices;
- recalculate or load cached historical gap statistics;
- determine risk;
- create a warning/flagged alert where appropriate;
- preserve an audit trail of what inputs were used.

A scheduled check must record:

- run type
- status
- positions scanned
- positions flagged
- model version
- provider metadata
- timestamps

---

## 25. Surfpool / demo strategy

Surfpool is the preferred deterministic environment for demo/test scenarios where real mainnet state needs to be forked or simulated.

Use it to demonstrate:

- a real-ish Kamino position state;
- weekend gap deterioration;
- WGG alerting;
- protection preparation;
- wallet signing flow;
- post-transaction refresh.

Do not fabricate balances in the production UI.

For any actual mainnet smoke test, use only a controlled test wallet and the minimum amount necessary for signature/transaction validation.

---

## 26. Current source tree milestones

Important live files:

### WGG UI
- `src/WeekendGapGuardWorkspace.tsx`
- `src/KaminoActionConsole.tsx`
- `src/weekend-gap-guard.css`

### WGG domain logic
- `src/lib/wggRisk.ts`
- `src/lib/wggEarnings.ts`
- `src/lib/kamino.ts`
- `src/lib/walletAuth.ts`
- `src/lib/walletSession.ts`

### Backend APIs
- `api/kamino-market.ts`
- `api/kamino-actions-prepare.ts`
- `api/kamino-actions-verify.ts`
- `api/wgg-protection-prepare.ts`

### Supabase
- `supabase/functions/wallet-auth/`
- `supabase/functions/wgg-pyth/` (dormant legacy)
- `supabase/functions/wgg-weekend-gap/` (dormant legacy)
- WGG migrations under `supabase/migrations/`

### Build
- `vite.config.wasm.ts`
- `vercel.json`

---

## 27. Important completed commits

Known implementation commits on `main` include:

- `c77d022127fcbfc05a9ec98c24fec83de28ac20e` — WGG platform-actions migration
- `2d27ccbd79e88c36fcc1610771b12f5bb4e7d41c` — Kamino market API
- `c81c9554f4700113c790477ec6dd67de155725ec` — action prepare API
- `023021b56678939ee8396d0784c29b2665053c4a` — action verify API
- `e28bc03cc4f7ea3b94e84f320876cab3696d54cf` — Kamino action console
- `31dafe2f49ffb390c3804c65dfb876f816bdcc65` — WGG action-console integration
- `1ebae80b12fd310f54d08e7d64c3a3abd9546bfd` — dedicated RPC requirement for protection endpoint
- `2ce7306c8b5e3b188bd56f76384c7321287c519e` — WGG action console styling
- `5013fafe4a089364677ba41149938fa832454024` — build documentation update
- `e9c51538c724ebb867024402a67aabbba6a4048c` — BUILD_INFO documentation update
- `c4aa4385a8d63f4f8d5093537ef3b00fffeb5dd2` — wallet address type fix

These are historical checkpoints; verify current `main` before applying future changes.

---

## 28. Current blockers / next tasks

Priority order:

1. **Implement xStocks-native current-price adapter.**
2. **Implement Twelve Data historical OHLC adapter.**
3. Replace the WGG current-price and weekend-gap calls so Pyth is no longer active.
4. Add caching and provenance for historical gap datasets.
5. Verify WGG risk numbers using real supported xStock symbols.
6. Strengthen exact instruction verification in `api/kamino-actions-verify.ts`.
7. Finish repay preparation with fresh Kamino debt state.
8. Wire trusted monitored-position backend worker.
9. Wire Friday monitoring + alert deduplication.
10. Wire Telegram opt-in notification flow.
11. Add deterministic Surfpool demo fixtures.
12. Run complete end-to-end browser + wallet + Kamino smoke testing.
13. Re-run production CI/Vercel build after the market-data refactor.
14. Remove/archive dormant Pyth adapters once the replacement paths are verified.

---

## 29. What must not be changed

- Do not modify the preserved `stockpass` branch.
- Do not touch AgentMarket infrastructure.
- Do not add fake balances or fake Kamino state.
- Do not make Pyth Pro a mandatory dependency.
- Do not expose API secrets in the browser.
- Do not let historical-provider data override xStocks/Solana/Kamino state.
- Do not add automatic liquidation.
- Do not add custody or private-key storage.

---

## 30. External technical references

xStocks:
- https://docs.xstocks.fi/developers
- https://docs.xstocks.fi/developers/multipliers
- https://xstocks.com/

Kamino:
- https://docs.kamino.finance/
- https://github.com/Kamino-Finance/klend-sdk

Historical data:
- https://twelvedata.com/stocks
- https://twelvedata.com/docs

Pyth (optional/deferred):
- https://docs.pyth.network/price-feeds/core
- https://docs.pyth.network/price-feeds/pro

Solana:
- https://solana.com/docs

---

## 31. Handoff rule for future chats

When continuing this project from this file:

1. Treat this document as the current architecture checkpoint.
2. Check the current `main` branch before changing files.
3. Prefer the actual repository code over stale descriptions in older docs.
4. Do not resurrect Pyth as the primary market-data source unless a new explicit decision is made.
5. Keep xStocks, Solana and Kamino as the authoritative operational layers.
6. Keep Twelve Data isolated to historical risk-model data.
7. Update this file after every major implementation milestone.
8. Record actual verification results, not intended behavior.


## xStocks + Twelve Data implementation milestone — 2026-09-19

The active WGG workspace has now been refactored away from Pyth for its runtime market-data path.

### Added

- `api/wgg-market-data.ts`
  - server-side xStocks current-price adapter
  - server-side xStocks multiplier lookup
  - server-side Twelve Data daily OHLC adapter
  - strict symbol normalization to official xStock-style symbols
  - 13-week weekend-gap calculation with a calendar buffer
  - next-valid-session logic instead of blindly assuming Monday
  - minimum historical-sample validation
  - provider/provenance metadata
  - short-lived server cache for current prices
  - 30-minute server cache for historical datasets
  - explicit unavailable responses instead of fabricated risk data
  - Twelve Data API key remains server-side
- `src/lib/wggMarketData.ts`
  - browser client for the unified WGG market-data endpoint
  - typed xStocks current-price response
  - typed Twelve Data weekend-gap summary
- `src/WeekendGapGuardWorkspace.tsx`
  - no longer calls `fetchPythPrices()`
  - no longer calls the legacy Pyth weekend-gap function
  - requests official xStock symbols such as `AAPLx`/ `NVDAx`
  - displays xStocks as the current-price source
  - displays explicit historical-data errors/unavailable states
  - protection amount planning now uses the xStocks current price returned by the new server adapter
- `tsconfig.json`
  - includes `src/lib/wggMarketData.ts` in the live WGG typecheck graph

### Data flow now

`Kamino obligation → official xStock symbol → xStocks current price → Twelve Data underlying ticker history → weekend-gap statistics → WGG risk engine`

The historical provider is isolated to the risk model. It never supplies token balances, collateral amounts, Kamino debt, or ownership state.

### Research verified

Current xStocks documentation states that public endpoints provide asset price data and multiplier data; Solana xStocks use Token-2022 with raw balances plus multiplier-driven displayed values. The public price-data endpoint is the intended current xStock pricing source.

Current Twelve Data documentation supports daily `/time_series` OHLC data, historical `start_date`/`end_date` ranges, and batched symbol queries. The current Basic plan advertises 800 API credits/day; batched symbols still consume credits per symbol.

### Important implementation note

The current adapter uses an in-memory server cache. This is suitable as the first runtime implementation, but a durable shared historical cache should be added before scaling the monitoring worker across many users.

### Current code commits

- `0cb4c1fa8205a49e0634b2b1219a01cfe2e47ccd` — server market-data API
- `842248f48e4bd8e752c402dc9b1d4dda995e58bf` — browser market-data client
- `e273bcf07e6f32d36150b108af164e987ba79585` — dependency-free Vercel API typing
- `bbde2757e7b473aede4fc098e08a0ef1fa353caa` — workspace Pyth-to-market-data refactor
- `5f60b5c20f8cc90ff9e3ebb1438ff5ba6c99e0bf` — official xStock symbol keying fix
- `49dcc383049e96a32dd6e516536ae7da726818f0` — xStock symbol normalization
- `8d7ed8b13587b9be374376870791ad523c36159a` — include market-data client in typecheck

Next verification gate:
1. Confirm the repository build/typecheck is green.
2. Configure `TWELVE_DATA_API_KEY` server-side.
3. Test the market-data endpoint with real xStock symbols.
4. Verify the 13-week samples and resulting WGG risk states.
5. Remove/archive the dormant Pyth adapters after runtime verification.


## Kamino verification hardening milestone — 2026-09-19

Added exact prepared-action verification for the native Kamino control surface.

- `api/kamino-actions-prepare.ts` now stores the serialized prepared instruction set in `wgg_platform_actions.metadata`.
- `api/kamino-actions-verify.ts` still validates the authenticated wallet signer and successful mainnet confirmation, but now also:
  - extracts the confirmed transaction's Kamino-program instructions;
  - decodes their base58 instruction data;
  - compares program ID, account order and instruction data against the server-prepared instruction set;
  - rejects confirmations that differ from what StockPass prepared.
- This keeps the wallet flow non-custodial while making the confirmation ledger materially stronger.

### xStocks multiplier correctness

The protection planner now requires the current xStocks multiplier and converts desired scaled equity amount to raw Solana Token-2022 units before preparing a collateral deposit:

`rawTokenAmount = desiredScaledAmount / currentMultiplier`

If the current multiplier is unavailable, StockPass refuses to prepare the raw-token amount rather than assuming a multiplier of 1.

This follows the current xStocks Solana integration guidance: raw balances are the transaction amount and displayed/scaled balances use the multiplier.

### Latest code checkpoint

- `24ff8cba29c9c16b0b5acca8df93b5e1fb60d139` — corrected exact-instruction verification decoder
- `82766c3105272fcd666daa3f499589f26087891c` — prepared-action instruction matching
- `b7174f262ce2ecfd33be6c78d3d4835c47b8e00d` — store prepared instruction set
- `cb01ec2c0a44e15a904420c45630309ecc1f19c2` — xStocks multiplier-aware collateral planning
- `33effd2dfb0daac8d4febd56c905aad5ddf20936` — market-data architecture checkpoint

## Trusted WGG monitoring + Telegram milestone — 2026-09-19

The remaining monitoring pipeline is now implemented end-to-end in code.

### Monitoring worker

`api/wgg-monitor.ts` is the trusted WGG check path.

- Manual sync requires an authenticated StockPass wallet session.
- Scheduled mode requires `CRON_SECRET`.
- Reads the real Kamino Main Market again before evaluating risk.
- Uses official xStocks current price + multiplier data.
- Uses server-side Twelve Data daily OHLC for Friday-close → next valid trading-session-open history.
- Uses Twelve Data earnings calendar as an optional near-term risk overlay when configured.
- Upserts `wgg_monitored_positions`.
- Marks previously observed positions stale when they disappear from fresh Kamino state.
- Creates deduplicated `wgg_alerts`.
- Records `wgg_check_runs`.
- Sends newly created alerts to the Telegram worker.
- Wallets are discovered from monitored positions and confirmed `wgg_platform_actions`.

The browser now invokes a manual monitoring sync after a wallet scan, so connecting an existing Kamino xStock position also enrolls it into the trusted monitoring read-model.

### Action provenance

The flagged protection buttons now use the same `kamino-actions-prepare` → wallet signature → `kamino-actions-verify` path as the main Kamino control console.

This means Add Collateral and Repay protection actions also receive:

1. a server-created `wgg_platform_actions` record;
2. fresh Kamino-state preparation;
3. browser wallet review/signature;
4. mainnet confirmation;
5. exact prepared-instruction verification;
6. monitoring refresh after confirmation.

### Telegram

- `api/wgg-telegram-link.ts` creates a short-lived, hashed one-time link challenge after wallet-session validation.
- `telegram-webhook` consumes the one-time challenge and writes only the authenticated wallet/chat mapping to `wgg_telegram_links`.
- `alerts-worker` now reads `wgg_alerts`, sends only unsent WGG alerts, and stamps `telegram_sent_at`.
- Live Supabase Edge Functions `alerts-worker` and `telegram-webhook` are deployed.
- The frontend exposes Connect Telegram only when `VITE_TELEGRAM_BOT_USERNAME` is configured.

### Database

Migration `0006_wgg_telegram_link_challenges.sql` is committed and has been applied to the live Supabase project. It adds one-time Telegram challenge storage and WGG alert indexes.

### Environment gates still required

- `SOLANA_RPC_URL` — authenticated dedicated mainnet RPC for Vercel server functions.
- `VITE_SOLANA_RPC_URL` — authenticated dedicated mainnet RPC for browser reads/confirmation.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only.
- `TWELVE_DATA_API_KEY` — server-only historical/earnings provider.
- `CRON_SECRET` — server-only protection for the scheduled monitoring route.
- `TELEGRAM_BOT_TOKEN` — Supabase Edge Function secret.
- `TELEGRAM_WEBHOOK_SECRET` — Supabase Edge Function secret.
- `VITE_TELEGRAM_BOT_USERNAME` — public bot username for the frontend Telegram handoff.

No Pyth key is required on the active WGG path.

### Current verification status

Code is committed through:
- `4dd113128f9e25ae15268db9ec86e2ca8c101d7c` — Telegram UI handoff.
- `5777473ad62ddd6f2ed0f4f7e097b99b3c56b13b` — restored complete WGG workspace + verified protection actions.
- `fb6a9c3ff61f5eb891aae7f65a64a3c867a02afe` — Web Crypto Telegram-link API.
- `194ccd38b6aed1a50e195b2fcef43e065e7e43c2` — scheduled WGG cron.
- `1b173b69211a25f3281cbd48893b3fc6450f8eb0` — trusted monitoring worker.

The live Supabase migration and both WGG Edge Functions are deployed.

Remaining runtime gate: Vercel's automatic deployment queue must finish a green build, followed by a real wallet smoke test against a connected mainnet wallet. The external deployment fetch is currently SSO-protected, so anonymous HTTP cannot be used as the smoke test.

## Prototype-faithful WGG frontend — 2026-09-19

Implemented the supplied StockPass interactive HTML pattern as the real authenticated WGG frontend.

Touched:
- `src/WeekendGapGuardWorkspace.tsx` — compact wallet header, five-route bottom navigation, preserved authenticated scan/action/risk state.
- `src/WggDashboard.tsx` — live protection hero, LTV stress gauge, real KPI totals, risk filter chips, tappable position detail sheet, real protection actions, provenance.
- `src/WggPositionsPage.tsx` — live full positions list, real rescan, gauges, xStocks/Twelve Data context.
- `src/WggRiskPage.tsx` — per-position risk cards/gauges and live Safe/Watch/Flagged counts/actions.
- `src/KaminoActionConsole.tsx` — wallet-style action UI while preserving the real Kamino prepare/sign/confirm/verify flow; quick fills are sourced only from real position amounts and rounded to reserve precision.
- `src/WggMonitoringPage.tsx` — persisted last-checked state, alerts, monitored positions and Telegram link state; manual checks still call the trusted monitoring endpoint.
- `src/app.css` — exact light prototype token system and component primitives, including the Solana gradient only on the brand mark and center Actions button.
- `src/config.ts`, `src/vite-env.d.ts` — centralized Telegram frontend config with manual-value-first fallback.
- `api/wgg-monitor.ts` — authenticated read-only state endpoint for the monitoring screen; existing sync/cron worker behavior remains intact.

No demo balances, fabricated risk values, fake alerts, timeout-based confirmations, or simulated wallet signing were introduced.

Verification gate: source-level review completed. Local production build cannot currently be executed from this runtime because the repository checkout cannot be fetched due to GitHub DNS resolution failure. Latest GitHub/Vercel CI status must be checked before claiming deployment readiness.
