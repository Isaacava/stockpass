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

- Kamino's current TypeScript SDK is `@kamino-finance/klend-sdk`; the current repository documents reading a user's obligations with `KaminoMarket` and constructing lending actions with `KaminoAction`. The current GitHub repository is actively maintained, so implementation should follow its current API rather than older snippets. See https://github.com/Kamino-Finance/klend-sdk. 
- Kamino's current mainnet lending program ID is documented as `KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD` in the Kamino klend repository.
- Pyth Core was upgraded on August 26, 2026. Current Hermes/Benchmarks requests require API-key authentication, and the current historical Benchmarks endpoints are timestamp-based. The official docs should be treated as authoritative for all future Pyth integration details.
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

## Next implementation steps

1. Integrate the current `@kamino-finance/klend-sdk` and read real user obligations.
2. Resolve and verify current xStock mint addresses/decimals for supported assets.
3. Build the Kamino obligation read-model adapter and populate `wgg_monitored_positions`.
4. Add the Pyth current-price adapter using the current authenticated Hermes API.
5. Build the historical Friday-close/Monday-open calculation as a backend job rather than a frontend request path.
6. Add earnings-calendar data behind a server-side adapter with a verified free-tier source.
7. Build the Friday monitoring worker and `wgg_alerts` records.
8. Reuse the existing Telegram connection pattern for opt-in notifications.
9. Build exact Kamino repay/deposit transaction construction and user-signature flow.
10. Add Surfpool fixtures/cheatcodes for deterministic flagged-position demos.
11. Run an end-to-end test before using real mainnet funds.

## Testing policy

Use Surfpool for deterministic development and demo testing. The first real-mainnet smoke test should use only a minimal amount needed for wallet/signature/transaction-fee validation. Never fabricate a real position in the UI.
