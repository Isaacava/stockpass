# Weekend Gap Guard — Complete Build Information

## Current authoritative runtime state — 2026-09-20

This section supersedes older checkpoint notes in this file wherever they conflict with the live repository or live Supabase/Vercel configuration.

### Verified repository/runtime facts

- The active `main` branch is Weekend Gap Guard. The preserved `stockpass` branch and the separate AgentMarket system are outside this build.
- Current xStock market pricing in the active WGG path comes from the official xStocks public asset API.
- Historical Friday-close → next-session-open context in the active WGG path comes from Twelve Data.
- Pyth is **not** a required dependency of the current WGG critical path. The legacy `wgg-pyth` function remains deployed, but any Pyth integration must follow the post-August-26-2026 authentication rules and must never be treated as configured without a valid server-side key.
- Browser Solana RPC is same-origin `/api/solana-rpc`. The upstream provider credential is server-only in Vercel as `SOLANA_RPC_URL`. There is no required `VITE_SOLANA_RPC_URL` in the current browser architecture.
- The RPC proxy now rejects non-browser same-origin requests, JSON-RPC batch requests, oversized bodies, and methods outside the explicit allowlist used by the application.
- `src/lib/assets.ts` is isomorphic: Vercel Node functions read server environment values while the Vite browser build falls back to `import.meta.env`.
- `tsconfig.api.json` type-checks every `api/**/*.ts` server function independently. Both the normal package build and Vercel build run this API typecheck before the production Vite build.
- Kamino discovery lazy-loads the Kamino SDK inside the discovery call so serverless module initialization can fail as a handled request error rather than an opaque import-time crash.
- Protection repay preparation uses Kamino's `obligation.getBorrows()` accessor and reads the live mainnet RPC from `SOLANA_RPC_URL`.
- The monitor risk calculation uses the same `currentLtvPct`, `liquidationLtvPct`, downside-gap stress, and target-LTV calculation as the connected dashboard.
- The existing browser transaction path decodes prepared instruction bytes with `Buffer.from(...)` before creating `TransactionInstruction` objects.
- Supabase live inspection on 2026-09-20 confirmed the WGG persistence tables exist and are RLS-enabled: `wgg_monitored_positions`, `wgg_alerts`, `wgg_telegram_links`, `wgg_check_runs`, `wgg_platform_actions`, and `wgg_telegram_link_challenges`. They currently contain no monitored/action rows, so no usage or risk history should be presented as real until an authenticated mainnet flow generates it.
- Supabase live inspection also confirmed `alerts-worker` and `telegram-webhook` are ACTIVE Edge Functions. They should not be duplicated or blindly redeployed just because older audit notes said they might be missing.
- The native Actions surface already exposes Create Position, Supply, Borrow, Add Collateral, Repay, Withdraw, and self-service Close. The platform-action ledger exists in Supabase, but the production definition of done still requires independent on-chain verification after a real wallet transaction.
- No third-party liquidation scanner/bot is part of the build. "Close" means the user's own position: repay debt and withdraw their own collateral.

### Fix-first gate

The audit patch supplied on 2026-09-20 has been applied to `main` across the server-safe asset registry, API typechecking, Kamino borrow accessor, WGG monitor risk inputs, target-LTV math, RPC hardening, and related build configuration.

The remaining proof gate is empirical, not another UI rewrite: a READY Vercel deployment of the current `main`, followed by a real connected-wallet pass proving authentication → Kamino discovery → xStocks pricing → weekend-gap history → WGG risk → prepared action → wallet signature → mainnet confirmation → platform verification → monitoring persistence.

Until that real-wallet pass is observed, production success must not be described as confirmed.

### External scope verification

As of the current STOCKLANA schedule, the live hackathon remains active. The deadline has been extended to **September 25, 2026 at 4 PM ET**. The program now has the main track plus sponsored tracks from Meteora, Pyth Network, PreStocks, Clawpump, and Tessera. The hackathon platform allows a submission to select up to three sponsor tracks, while judging is split between the main-track judges and the relevant sponsor judges.

The current product continues to target the main STOCKLANA brief with a real xStock/Kamino position-protection workflow rather than replacing the lending protocol or inventing balances.

## Project

Weekend Gap Guard (WGG) is the new STOCKLANA hackathon project on the main branch of the repository "Isaacava/stockpass".

- main branch: Weekend Gap Guard
- stockpass branch: preserved previous StockPass application
- AgentMarket: completely separate and must not be touched

WGG is a non-custodial protection overlay for real Kamino xStock lending positions on Solana.

It does not replace Kamino, custody funds, hold private keys, or give the application standing permission to move user funds.

## Main product flow

1. Connect a Solana wallet.
2. Verify control of that wallet with a signed message.
3. Read the wallet's real Kamino Main Market obligations.
4. Identify supported xStock collateral from the official xStock catalog.
5. Read collateral amounts, debt, LTV, liquidation threshold and related Kamino state.
6. Get independent Pyth pricing for the underlying equity.
7. Calculate a historical Friday-close to next-session-open downside gap.
8. Combine current liquidation buffer with the weekend-gap model.
9. Apply earnings risk when a trusted earnings event is available.
10. Mark positions as SAFE, WATCH or FLAGGED.
11. For a flagged position, calculate a protection target.
12. Prepare a real Kamino repay or deposit action from fresh on-chain state.
13. Return only unsigned instruction data and lookup-table addresses.
14. Reconstruct the transaction in the browser.
15. Let the connected wallet review and sign it.
16. Submit the signed transaction to Solana mainnet.
17. Confirm the transaction.
18. Record and monitor the position through trusted backend workers.

## What is required

### Core infrastructure

- Solana mainnet RPC
- Kamino Main Market
- Current Kamino lending SDK
- Official xStock asset/mint catalog
- Pyth price data
- Historical market observations for weekend-gap modeling
- Solana wallet connection and message signing
- Wallet session authentication
- Backend transaction preparation
- Supabase database
- Vercel hosting/serverless runtime
- RLS-protected WGG database tables
- Monitoring/alert worker
- Telegram notification integration
- Surfpool for deterministic development/testing

### Secrets/configuration still required

- Server-side PYTH_API_KEY
- Production `SOLANA_RPC_URL` for the protected Vercel function when a dedicated RPC is available
- Production `VITE_SOLANA_RPC_URL` for browser mainnet reads when a dedicated RPC is used
- Telegram bot configuration when notification work is enabled
- Any server-side provider credentials needed by future monitoring adapters

Secrets must never be embedded in the browser bundle.

## Current technology stack

### Frontend

- React 19
- TypeScript
- Vite
- Lucide React
- Reown AppKit
- Reown Solana adapter
- Solana Web3.js
- Solana Kit
- Supabase JS

### Solana / Kamino

- @kamino-finance/klend-sdk 12.x
- @solana/kit
- @solana/web3.js
- Kamino Main Market:
  7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF

### Backend

- Supabase Edge Functions for lightweight protected/data-provider functions
- Vercel Node.js Serverless Function for Kamino transaction preparation
- Supabase Postgres for WGG persistence

### Build system

- Vite
- vite-plugin-wasm
- vite.config.wasm.ts
- vercel.json

## Existing GitHub files

### Application

- src/main.tsx
- src/WeekendGapGuardWorkspace.tsx
- src/weekend-gap-guard.css

### Risk and data adapters

- src/lib/wggRisk.ts
- src/lib/wggEarnings.ts
- src/lib/pyth.ts
- src/lib/kamino.ts
- src/lib/xstocks.ts
- src/lib/assets.ts

### Wallet/session

- src/lib/walletSession.ts
- src/lib/walletAuth.ts
- src/lib/supabase.ts

### Server/API

- api/wgg-protection-prepare.ts

### Supabase functions

- supabase/functions/wallet-auth/index.ts
- supabase/functions/wgg-pyth/index.ts
- supabase/functions/wgg-weekend-gap/index.ts

### Build configuration

- vite.config.ts
- vite.config.wasm.ts
- vercel.json
- package.json
- tsconfig.json

## Kamino integration

The Kamino integration is read-only during discovery.

The application:

- loads the Kamino Main Market
- reads the connected wallet's obligations
- identifies reserves used by those obligations
- resolves reserve liquidity mints
- matches liquidity mints against the supported xStock catalog
- reads xStock collateral amounts
- reads debt reserves
- reads current account LTV
- reads reserve liquidation thresholds
- exposes mint decimals
- calculates a conservative WGG liquidation-buffer signal

### Important risk-model limitation

The displayed liquidation buffer is a WGG protection signal, not a replacement for Kamino's liquidation engine.

The first-pass calculation uses the lowest applicable xStock liquidation threshold minus current account LTV.

## Pyth integration

Pyth is intentionally server-side for authenticated/protected access.

### Live pricing

wgg-pyth:

1. Receives underlying equity symbols.
2. Resolves the current equity feed.
3. Fetches the latest parsed price update.
4. Converts Pyth fixed-point values into normal USD prices.
5. Returns price, confidence, publish time and feed ID.

The API key is never placed in the frontend.

### Historical weekend-gap model

wgg-weekend-gap:

1. Uses a Friday near-close observation around 15:59 America/New_York.
2. Finds the next available weekday session observation around 09:30 America/New_York.
3. Handles market-holiday gaps by finding the next usable weekday observation.
4. Calculates max(0, -return).
5. Returns sample count, median downside gap, P75 downside gap, P90 downside gap, maximum downside gap, date window, methodology and feed ID.

The initial WGG model uses the P75 downside gap as the typical weekend-gap estimate.

No historical number should be fabricated when source data is unavailable.

## Earnings-risk integration

src/lib/wggEarnings.ts provides a provider-neutral contract.

It:

- accepts only a trusted earnings event
- normalizes the symbol
- tracks report date
- tracks timing:
  - before open
  - after close
  - unspecified
- treats events in the configured near-term window as upcoming
- supplies a separate multiplier helper

The module deliberately does not guess earnings dates.

A server-side earnings calendar adapter is still required before earnings data becomes production risk input.

## Risk engine

src/lib/wggRisk.ts calculates:

- adjusted weekend gap
- deficit
- SAFE
- WATCH
- FLAGGED

The first-pass model:

- starts with current liquidation buffer
- applies the historical downside-gap estimate
- optionally applies an earnings multiplier
- flags when modeled downside exceeds available protection buffer

### Action-planning helpers

The module also contains algebraic planning functions for:

- target-LTV debt repayment
- target-LTV additional collateral

These are estimates only.

Final transaction preparation always re-reads current Kamino state.

## Wallet authentication

The WGG protection path requires more than simply knowing a public wallet address.

### Wallet-auth flow

1. Request a challenge from wallet-auth.
2. User signs the challenge message with the connected wallet.
3. Backend verifies the Ed25519 signature.
4. Backend creates a session token.
5. Token is stored client-side for the session lifetime.
6. Protected backend routes validate the session.
7. Protected transaction preparation also re-checks wallet ownership of the selected Kamino obligation.

The challenge explicitly states that message signing does not send a transaction.

## Kamino protection preparation

The protection preparation backend is:

api/wgg-protection-prepare.ts

It exists outside the browser because the Kamino SDK includes dependencies that caused browser/Edge bundling problems.

### Request checks

The endpoint validates:

- request method
- Solana addresses
- action type
- unsigned base-unit amount format
- wallet session
- selected obligation ownership

### Fresh-state protection

Before building an action it:

1. reloads Kamino Main Market
2. obtains the current ledger instant
3. reads the wallet's current obligations
4. verifies the selected obligation belongs to the wallet
5. reloads the selected obligation
6. builds the action with the current Kamino SDK

### Supported actions

- deposit collateral
- repay debt

### Output

Only unsigned transaction ingredients are returned:

- action type
- wallet
- obligation
- reserve
- amount in base units
- serialized instruction data
- lookup-table addresses

No signing key is ever passed to the backend.

## Browser signing flow

The browser:

1. receives prepared instruction data
2. reconstructs Solana instructions
3. fetches the latest blockhash
4. loads Kamino address lookup tables
5. builds a versioned Solana transaction
6. asks the connected wallet to sign
7. submits the signed bytes
8. confirms the transaction

The backend never signs on behalf of the user.

## Supabase database

The existing StockPass Supabase project is reused:

https://sfbxpscbevnmoppgkjcr.supabase.co

WGG data is isolated with the wgg_ prefix.

### Current WGG tables

- wgg_monitored_positions
- wgg_alerts
- wgg_telegram_links
- wgg_check_runs

### Documentation table

- wgg_project_docs

This table stores the canonical WGG project specification/progress document in Markdown so the build state can be recovered directly from Supabase.

### Wallet authentication tables

Existing wallet-auth infrastructure also uses:

- stockpass_wallet_auth_challenges
- stockpass_wallet_auth_sessions

### Data policy

The application must never fabricate:

- Kamino positions
- balances
- prices
- weekend-gap statistics
- alerts
- confirmed transactions

Trusted backend processes should populate persisted monitoring records.

## Supabase Edge Functions

### wallet-auth

Purpose:

- issue wallet challenges
- verify wallet signatures
- create wallet sessions
- validate existing wallet sessions

### wgg-pyth

Purpose:

- protected current Pyth pricing adapter

### wgg-weekend-gap

Purpose:

- protected historical weekend-gap engine

### Important architecture change

A separate wgg-protection-prepare Supabase Edge Function was attempted but removed because its Kamino SDK bundle timed out during Supabase Edge deployment.

The same responsibility now lives in the Vercel serverless runtime.

## Frontend experience

The current WGG interface includes:

- Weekend Gap Guard branding
- Solana mainnet indicator
- wallet connection
- wallet address display
- scan action
- real Kamino obligation discovery
- real xStock collateral rows
- Pyth price display
- LTV and liquidation metrics
- weekend-gap metrics
- risk status
- protection preparation
- wallet review/sign flow
- transaction confirmation
- explicit no-fake-data empty state

The UI clearly distinguishes:

- source-of-truth Kamino state
- independent Pyth price data
- historical risk model
- proposed protection action

## Security rules

1. Never expose server-side API keys to the browser.
2. Never expose service-role Supabase credentials to the browser.
3. Never put a private key in GitHub.
4. Never give WGG automatic signing authority.
5. Never send a fund-moving transaction without wallet approval.
6. Verify wallet sessions before protected preparation.
7. Verify that the selected Kamino obligation belongs to the authenticated wallet.
8. Do not trust a browser-supplied RPC URL for protected action construction.
9. Re-read Kamino state immediately before preparing a transaction.
10. Keep RLS enabled on WGG tables.
11. Do not fabricate demo balances as real balances.
12. Use Surfpool for deterministic simulated-position development.

## Development and testing

### Surfpool

Surfpool is intended for deterministic development/testing against forked Solana state.

Use it to test:

- discovered obligations
- risk calculations
- flagged positions
- transaction construction
- wallet flows
- lookup-table behavior
- success/error paths

### Mainnet testing

The first real-mainnet smoke test should be minimal and focused on:

- wallet connection
- message signature
- transaction assembly
- transaction fees
- submission/confirmation

Do not use fabricated mainnet positions.

## Deployment

### Vercel

Vercel hosts:

- the Vite frontend
- api/wgg-protection-prepare.ts

The repository uses a WASM-aware build:

- vite-plugin-wasm
- vite.config.wasm.ts
- vercel.json

The protection API has an explicit execution-duration configuration.

### Supabase

Supabase hosts:

- WGG database
- wallet authentication functions
- Pyth adapter
- historical weekend-gap function
- documentation state

## 2026-09-19 Runtime Hardening Checkpoint

The live Vercel WGG runtime was audited against production errors and the server paths were hardened accordingly:

- Kamino discovery APIs now bundle the local discovery module statically instead of using Vercel-unresolved dynamic relative imports.
- The Kamino server module now uses a server-safe stock registry and no longer executes browser-only Vite asset configuration during Node cold start.
- Vercel Node functions are pinned to Node 22.x.
- `rpc-websockets` is overridden to 10.0.1 to remove the CommonJS/ESM UUID failure that affected Kamino market/action loading.
- Telegram setup is represented as an explicit configuration state until the real bot username is supplied; no placeholder username is fabricated.

GitHub Actions passed the TypeScript + WASM production build for the hardened commits. The production Kamino market endpoint has also returned HTTP 200 with live Kamino Main Market reserve data after the dependency fix. The final runtime gate is the newest Vercel deployment carrying the server-safe registry commit, followed by authenticated Guard/Monitor checks.

## Current progress

### Completed

- WGG project direction defined
- main/stockpass branch separation preserved
- Kamino Main Market integration
- real Kamino obligation discovery
- official xStock matching
- xStock mint decimals
- liquidation-buffer signal
- Pyth live-price adapter
- historical weekend-gap adapter
- P75 downside-gap risk signal
- first-pass SAFE/WATCH/FLAGGED risk engine
- target-LTV action-planning helpers
- fresh-state exact Kamino repay amount calculation
- WGG deposit and repay preparation paths
- wallet message-signature authentication
- wallet session storage
- protected wallet-session validation
- Vercel server-side Kamino action preparation
- wallet ownership verification before protection preparation
- unsigned instruction serialization
- browser transaction reconstruction
- Reown wallet signing bridge
- transaction submission and confirmation UI\n- GitHub Actions build regression check for TypeScript + WASM
- WGG-only TypeScript build graph
- removal of unused WGG V2 / duplicate Kamino protection modules
- WASM-aware Vite build configuration
- WGG Supabase tables
- WGG project documentation table
- complete GitHub build documentation

### Current verification state

As of 2026-09-19, the live WGG code path has been cleaned up and the protection endpoint now accepts server-side RPC configuration through `SOLANA_RPC_URL` instead of relying only on the public Solana RPC.

The `main` branch no longer includes the unreferenced `WeekendGapGuardWorkspaceV2.tsx`, `kaminoProtection.ts`, `wggKamino.ts`, or `WalletAuthGate.tsx` files. TypeScript now targets the live WGG source graph so legacy StockPass UI code cannot block the WGG build.

The WGG build is now **verified** at the compiler/bundle level. GitHub Actions passed both `tsc --noEmit --pretty false` and the WASM production build, and Vercel reports the corrected deployment as READY. The live deployment root also returns HTTP 200.\n\nThe remaining verification gate is runtime behavior: configure the required production Pyth secret, exercise one real wallet-authenticated protection-prepare flow against a real eligible position, and confirm wallet signing/submission only after review.

### In progress

- Verify newest Vercel deployment reaches READY
- Verify wallet-authenticated protection preparation end-to-end
- Configure Pyth API key
- Verify live Pyth pricing
- Verify historical weekend-gap responses
- Verify exact repay calculation using fresh debt-reserve oracle pricing/decimals
- Add server-side earnings calendar adapter
- Populate trusted wgg_monitored_positions
- Build scheduled Friday monitoring
- Create wgg_alerts from trusted checks
- Connect Telegram notifications
- Add Surfpool deterministic flagged-position fixtures
- Complete end-to-end test

## Remaining build modules

### 1. Pyth production data

Required:

- server-side PYTH_API_KEY
- feed validation
- current price verification
- historical sample verification

### 2. Earnings adapter

Required:

- server-side earnings source
- response validation
- report-date normalization
- before-open/after-close normalization
- missing-data fallback

### 3. Exact repay protection

Required:

- identify debt reserve
- read reserve oracle price
- read debt reserve mint decimals
- calculate exact base units
- prepare Kamino repay transaction
- return unsigned instructions

### 4. Trusted monitoring worker

Required:

- scheduled execution
- discover monitored positions
- refresh Kamino state
- refresh Pyth price/gap inputs
- evaluate risk
- upsert wgg_monitored_positions
- write wgg_alerts
- record wgg_check_runs

### 5. Telegram alerts

Required:

- opt-in link
- wallet-to-chat association
- secure alert delivery
- duplicate-alert prevention
- acknowledgement state

### 6. Surfpool demo harness

Required:

- deterministic fork
- test wallet
- reproducible xStock-backed obligation
- controlled LTV
- reproducible flagged scenario
- transaction-preparation verification

## Data flow

    Wallet
      |
      v
    Reown / Solana wallet
      |
      +----> wallet-auth challenge/signature ----> Supabase
      |
      v
    WGG frontend
      |
      +----> Kamino Main Market (read-only discovery)
      |
      +----> Vercel market-data API ----> xStocks current price + multiplier
      |
      +----> Vercel market-data API ----> Twelve Data historical OHLC
      |
      +----> Vercel monitor ----> Twelve Data earnings calendar (optional)
      |
      v
    WGG risk engine
      |
      +----> SAFE / WATCH / FLAGGED
      |
      +----> FLAGGED -> Vercel protection API
                             |
                             +----> wallet session validation
                             +----> Kamino fresh state
                             +----> unsigned instructions
      |
      v
    Browser
      |
      +----> Reown wallet review/sign
      |
      v
    Solana mainnet
      |
      v
    Confirmation

## Non-goals

WGG is not:

- a replacement lending protocol
- an exchange
- a custody service
- an automatic liquidation bot
- an automatic fund-moving bot
- a portfolio manager
- a source of fabricated demo balances
- a substitute for Kamino's own risk engine

## Definition of done

The WGG hackathon build is considered end-to-end complete when all of the following work:

- real wallet connects
- wallet session verifies
- real Kamino xStock obligation is discovered
- real xStocks current price loads
- historical Twelve Data weekend-gap model loads
- earnings risk can be supplied from a trusted provider
- risk status is generated
- flagged position produces a correct protection amount
- Kamino action is built from fresh state
- unsigned instructions reach the browser
- wallet reviews/signs
- signed transaction submits
- transaction confirms
- backend monitoring persists the checked position
- alert is generated when appropriate
- Telegram notification is delivered when enabled
- Surfpool test reproduces the complete path
- no private key or service secret reaches the frontend
- no fake mainnet balances are shown

## Future-development rules

Every new feature must preserve:

**Real state over fabricated state.**

**Fresh on-chain state before fund-moving action.**

**Wallet signature required for every fund-moving transaction.**

**Server-side secrets only.**

**AgentMarket remains untouched.**

**Supabase WGG data stays namespaced and isolated.**

**Unavailable upstream data must be shown as unavailable rather than guessed.**


## Native Kamino action milestone — 2026-09-19

The WGG workspace now includes a non-custodial Kamino control surface for Borrow, Lend/Supply, collateral deposit, Repay, collateral withdrawal, and self-service Close Position. The server uses the current klend action builders and fresh Kamino state before every fund-moving preparation.

A new server-only wgg_platform_actions ledger records prepared and independently verified transactions. kamino-actions-verify checks that the confirmed mainnet transaction was signed by the authenticated wallet and contains the Kamino Lending program, then refreshes WGG monitoring from the resulting Kamino state.

New runtime requirements:
- SOLANA_RPC_URL must point to a dedicated authenticated Solana mainnet RPC.
- SUPABASE_SERVICE_ROLE_KEY must be configured only on the Vercel server.
- VITE_SOLANA_RPC_URL must point the browser at the chosen authenticated mainnet RPC for transaction confirmation and address lookup tables.

## Completed WGG monitoring milestone — 2026-09-19

Weekend Gap Guard now includes the trusted monitoring and alert pipeline described by the specification.

- `api/wgg-monitor.ts` performs authenticated manual checks and `CRON_SECRET`-protected Friday scans.
- The browser automatically invokes a monitoring sync after scanning a wallet, enrolling existing Kamino xStock obligations into `wgg_monitored_positions`.
- The monitor refreshes Kamino, xStocks, historical weekend gaps, and optional earnings risk before persisting risk state.
- `wgg_alerts` are deduplicated and sent through the deployed `alerts-worker`.
- `telegram-webhook` uses one-time wallet-authenticated link challenges stored in `wgg_telegram_link_challenges`.
- The UI exposes the Telegram handoff only when `VITE_TELEGRAM_BOT_USERNAME` is configured.
- Flagged Add Collateral/Repay actions now use `wgg_platform_actions` and the exact prepared-instruction verification path.
- Pyth is not part of the active required path. xStocks supplies current market data and Twelve Data supplies historical weekend-gap statistics.

### Current required environment

Server: `SOLANA_RPC_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TWELVE_DATA_API_KEY`, `CRON_SECRET`.

Browser: `VITE_SOLANA_RPC_URL`, `VITE_TELEGRAM_BOT_USERNAME`.

Supabase Edge Functions: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`.

### Final smoke-test definition

A final green build and real-wallet test must prove:
wallet authentication → real Kamino xStock discovery → xStocks price/multiplier → Twelve Data weekend history → WGG risk → action preparation → wallet signature → mainnet confirmation → exact verification → monitored-position refresh → deduplicated alert → optional Telegram delivery.

## Dashboard command-center milestone — 2026-09-19

The connected StockPass/WGG workspace has been restructured around a native DeFi dashboard hierarchy instead of a marketing hero:

- WggDashboard.tsx is now the primary connected account surface.
- The first viewport starts with real-account KPIs: collateral, borrowed value, max LTV, and protection state.
- The protection panel shows current LTV, stressed LTV, liquidation boundary, distance to liquidation, and the next action without inventing balances.
- Positions are displayed as live Kamino xStock obligations with asset, value, current/stressed LTV, risk status, and action affordances.
- Market context is separated from account state and labels xStocks as the current-price source and Twelve Data history as the weekend-gap source.
- The connected dashboard automatically performs the first mainnet scan after wallet authentication, so users do not land on an empty manual-scan shell.
- Mobile behavior collapses the dense desktop position grid into stacked cards while preserving the same data hierarchy.
- The existing Kamino action console remains below the account/risk layer so execution follows understanding rather than leading with controls.
- No fabricated portfolio values, PnL, balances, or risk readings were added.

### Deployment verification state

The latest source changes are committed to main. The Vercel project currently reports the older READY production deployment from commit 7c5447be683d2f96953cf7e0a7225b9269d1927c; the Vercel deployment connector available in this runtime does not expose a working manual deploy action. The current production URL therefore must not be described as containing this dashboard revision until a deployment with the new commit is shown as READY.

## Authenticated app routing milestone — 2026-09-19

The StockPass public landing and authenticated WGG app are now separate routes.

- / is public landing only.
- /app is the authenticated Overview dashboard only.
- /app/positions is the dedicated live Kamino xStock positions page.
- /app/risk is the dedicated Weekend Gap Guard protection/risk page.
- /app/actions is the dedicated Kamino execution page for Borrow, Lend, Add Collateral, Repay, Withdraw, and Close Position.
- The header navigation changes real browser history and URL instead of scrolling to sections on one long dashboard page.
- Direct /app/* visits are rewritten to the SPA entry by Vercel while preserving the API function paths.
- When wallet authentication is lost, the app returns to the public landing route; authenticated users entering / are moved to /app.
- The Overview dashboard no longer embeds the full Positions and Actions pages.

## Dashboard routing + Vercel build fix — 2026-09-19

The connected product surface is now separated from the public landing page.

Public:
- `/` = StockPass landing / wallet-entry experience.

Protected app routes:
- `/app` = Dashboard / account command center
- `/app/positions` = live Kamino xStock positions
- `/app/risk` = Weekend Gap Guard risk analysis
- `/app/actions` = Kamino borrow/supply/deposit/repay/withdraw/close execution console
- `/app/monitoring` = authenticated monitoring sync and alert check

The app uses lightweight browser-history routing rather than adding another router dependency. Vercel rewrites `/app/*` back to the Vite entry while preserving the browser pathname, so each dashboard page remains a distinct URL/page state.

The Vercel build failure from commit `d2def876b69ef7acdbbbb94502fa988a8bc22ff0` was identified from the build log as:
`src/WeekendGapGuardWorkspace.tsx(278,9): Type 'string | undefined' is not assignable to type 'string | null'.`

The affected `WggDashboard` prop is now passed as `address ?? null`. The large npm ERESOLVE output in that log was peer-dependency warnings; the command actually stopped on the TypeScript error above.

A fresh local TypeScript build could not be executed in the current tooling environment because outbound GitHub DNS resolution is unavailable. The source-side TypeScript error has been corrected, but the next Vercel build remains the authoritative compile verification.


## Runtime verification — 2026-09-19

The connected production symptoms were traced to three separate runtime details:

- The browser scan uses the Vite variable `VITE_SOLANA_RPC_URL`. Server-only `SOLANA_RPC_URL` is intentionally not exposed to the browser. The browser endpoint now falls back to `VITE_SOLANA_MAINNET_RPC_URL` when `VITE_SOLANA_RPC_URL` is empty, and the deployed bundle must be rebuilt after changing Vercel environment values.
- The desktop app navigation was hidden below 1050px by CSS, while the mobile navigation markup was missing from the workspace render tree. A dedicated fixed five-tab mobile navigation is now rendered for the same routes.
- Wallet authentication is confirmed live against the existing Supabase project `sfbxpscbevnmoppgkjcr`: the `wallet-auth` Edge Function is ACTIVE and the database contains recent wallet-auth sessions for the connected wallet. This is custom wallet authentication, not a Supabase Auth email/password user.

### Supabase project alignment note

The current WGG code and deployed `wallet-auth` function use:

`https://sfbxpscbevnmoppgkjcr.supabase.co`

The separate Supabase project named `StockPassport` (`pwcsnthuvebzfpqprslw`) currently does not contain the WGG `stockpass_wallet_auth_challenges` / `stockpass_wallet_auth_sessions` tables or the deployed `wallet-auth` Edge Function. The app therefore remains connected to the existing WGG Supabase project until the dedicated StockPassport project is intentionally migrated.

The Supabase browser client now reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from Vite environment variables with the existing project values as safe fallbacks.

## Native DeFi UI rebuild — 2026-09-19

The connected WGG application has been visually rebuilt around a native DeFi wallet/workspace pattern rather than the previous editorial/marketing-card style.

### UI architecture

- Tailwind CSS 4.3.3 is now included with the official Vite plugin.
- The authenticated WGG workspace uses a dark, dense account surface with a persistent desktop navigation rail and a compact mobile bottom navigation.
- Typography now uses Inter for interface text and JetBrains Mono for addresses, amounts, percentages, and protocol metadata.
- Dashboard, Positions, Guard, Actions, and Monitoring use the same account-first visual system.
- The public landing page remains separate from the authenticated DeFi workspace.

### Dashboard

- Replaced oversized editorial headings with compact account command-center hierarchy.
- Added dense KPI cards for real collateral, borrowed value, max LTV, and protection state.
- Guard state now occupies the primary panel with current/stressed/liquidation LTV values.
- Live positions are shown as a compact Kamino table rather than blog-like content blocks.
- Source hierarchy remains visible without presenting fabricated PnL or balances.

### Actions

The Actions route is now a dedicated Kamino execution workbench.

- Action selector for Borrow, Supply, Add collateral, Repay, Withdraw, and Close position.
- Separate transaction-preview rail showing network, protocol, custody, and wallet approval.
- Form controls use dense wallet/DApp conventions instead of marketing cards.
- Preparation and wallet review states are visually separated.
- Confirmed transaction state is shown separately from preparation.
- Position-dependent actions are unavailable until a real Kamino position exists.

### Runtime error hardening

KaminoActionConsole and the protection preparation flow now read server responses as text first and then parse JSON. When a serverless route returns a non-JSON response such as an error page, the UI reports the actual response text instead of throwing the literal JSON parser error.

### Verification state

The container environment cannot resolve GitHub DNS, so a local production build could not be executed here.

Vercel has accepted the Tailwind dependency/configuration commit, but the subsequent UI commits are currently being throttled by the Vercel deployment rate limit. The latest GitHub commit currently has a Vercel failure status pointing at the project's build-rate-limit page. A READY deployment containing the full UI rebuild has therefore not yet been independently confirmed.



## Light Wallet UX rebuild — 2026-09-19

The authenticated StockPass/WGG workspace has been redesigned around the supplied Trust Wallet UI/UX references without copying their visual identity.

- Switched the authenticated shell from the dark protocol-console palette to a light wallet-style surface.
- Added rounded account cards, cleaner information hierarchy, softer borders/shadows, light status chips, and a mobile-first five-tab bottom navigation.
- Desktop navigation, account header, network state, wallet identity, dashboard surfaces, action surfaces, and monitoring surfaces now share the same light design system.
- Kamino/risk/business logic was not replaced by mock balances or decorative UI.
- Added src/config.ts containing explicit frontend defaults for the existing Supabase URL/key, Solana mainnet RPC, and Reown project ID.
- Frontend config resolves the manually defined values first and only falls back to Vite/Vercel environment values when a manual value is absent.
- Updated Vite environment declarations for the Supabase and Solana variables used by the frontend.

The latest source commit before this documentation change is 9913e1f69cda690c2339f0fbef9620f3f1dfb05a. The currently reported Vercel status is still the deployment-rate-limit failure from the rapid deployment sequence; this does not independently verify the latest source as READY.


### Deployment compile fix — 2026-09-19

Vercel build `dpl_9FdQB8hPSRZVqtproxSbqXCsQ4mk` stopped at TypeScript compilation in `src/WggMonitoringPage.tsx`. The npm `ERESOLVE` output was peer-dependency warnings; the fatal errors were caused by an untyped array containing Lucide icon components being rendered as `ReactNode`.

Fixed by typing the monitoring pipeline metadata as `[LucideIcon, string, string][]` and importing the `LucideIcon` type. Fix commit: `86b2965cff371dee78c1f219e05aeb4667a8da0f`.


## Prototype-faithful wallet frontend milestone — 2026-09-19

The authenticated Weekend Gap Guard frontend has been rebuilt against the supplied StockPass interactive HTML reference. This is a production reskin/restructure, not a mock-data port.

### Frontend changes

- `src/WeekendGapGuardWorkspace.tsx`
  - replaced the previous sidebar-heavy authenticated shell with the reference's compact wallet header and persistent five-route mobile-first bottom navigation;
  - kept the existing browser-history routes: `/app`, `/app/positions`, `/app/actions`, `/app/risk`, `/app/monitoring`;
  - kept wallet authentication, mainnet scan, WGG calculations and preparation/signing logic intact.
- `src/WggDashboard.tsx`
  - implemented the reference protection hero, real LTV/stressed/Liquidation values, real risk filter chips, tappable real position rows with detail sheet, real next-action protection controls, and provenance strip.
- `src/WggPositionsPage.tsx`
  - implemented the full live row-based positions surface with real rescan, liquidation gauge, and xStocks/Twelve Data market context.
- `src/WggRiskPage.tsx`
  - implemented per-position real risk gauges and Safe/Watch/Flagged counts/actions.
- `src/KaminoActionConsole.tsx`
  - kept the real Kamino prepare -> wallet-sign -> mainnet-confirm -> server-verify path while changing only the visual/component layer;
  - action chips, position/reserve selection, real position-derived quick fills, review state and confirmed state now follow the reference interaction model.
- `src/WggMonitoringPage.tsx`
  - now reads persisted `wgg_check_runs`, `wgg_monitored_positions`, `wgg_alerts`, and Telegram-link state through the authenticated monitoring route;
  - manual Run Check still calls the existing trusted `api/wgg-monitor.ts` sync.
- `src/app.css`
  - replaced the prior mixed dashboard styling with the reference token system: canvas/surface/soft/line/ink/mute/faint, brand/safe/watch/flag states, Inter + JetBrains Mono, wallet cards, sheets, chips, gauges, and five-tab nav;
  - the Solana gradient is used only for the brand mark and raised Actions button.
- `src/config.ts` + `src/vite-env.d.ts`
  - centralized Telegram frontend configuration with manual value first and Vite/Vercel fallback.
- `api/wgg-monitor.ts`
  - added an authenticated read-only `mode: "state"` branch so the frontend can display real persisted monitoring state without bypassing the custom wallet-session boundary.

### Data integrity

No fake balances, fake risk readings, fake alerts, simulated timers, simulated confirmations, automatic liquidation, custody, or private-key handling were added. Kamino remains the position source of truth; xStocks remains the current-price source; Twelve Data remains historical weekend-gap context.

### Verification state

Source-level review was completed after the redesign. Local production build execution is still constrained by the current runtime's inability to resolve GitHub DNS / fetch a repository checkout. Vercel/GitHub CI status for the latest `main` commits remains the final build gate and must be checked before describing the deployment as READY.


## Runtime dependency + first-position Actions milestone — 2026-09-19

Live page verification exposed a common runtime failure across Positions, Guard, Monitoring, and Actions:
`Failed to resolve module specifier "@solana-program/memo"`.
The original attempted direct Memo dependency version `0.12.x` was incompatible with the project's `@solana/kit@2.3.x` peer generation and caused npm ERESOLVE. StockPass has been corrected to `@solana-program/memo@^0.7.0`, the package generation used alongside `@solana/kit@2.3.0` in Solana web3.js 2-era examples.

The Actions route now supports a wallet with no existing Kamino obligation:

- **Create position** prepares a real `KaminoAction.buildDepositTxns()` flow using `VanillaObligation(PROGRAM_ID)`.
- The user selects a supported xStock reserve and amount.
- The server skips the existing-obligation lookup only for the explicitly marked first-position request.
- The wallet still reviews and signs the real mainnet transaction.
- Server confirmation verification remains unchanged.
- No local/synthetic position is inserted; the new obligation appears only after a confirmed mainnet transaction and a subsequent Kamino rescan.

The user-facing action set is now:
Create position, Supply, Borrow, Add collateral, Repay, Withdraw, Close.

Browser RPC remains same-origin `/api/solana-rpc`; the upstream credential remains server-only in `SOLANA_RPC_URL`.

Verification status at this checkpoint:
- Previous source/CI fixes through commit `c52809e...` are confirmed green and a READY Vercel deployment exists for that commit.
- The newer Create Position + Memo dependency commits are on `main`.
- GitHub Actions run #166 for commit `92b1dbcff3668f68adc85e091aafa67dd64f09c3` is still running at the dependency-install stage.
- Vercel has not yet shown a deployment for commit `92b1dbc...`; the latest later Vercel deployment visible in the project was the intentionally failed `0.12.x` Memo dependency attempt.
