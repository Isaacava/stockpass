# Weekend Gap Guard — Complete Build Information

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