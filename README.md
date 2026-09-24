# StockPass — Weekend Gap Guard

StockPass is now the home of **Weekend Gap Guard (WGG)**, a non-custodial Solana protection and monitoring layer for xStock-backed Kamino positions.

## What WGG does

1. Connect a Solana wallet with a signature-only authentication challenge.
2. Read the wallet's real Kamino obligations on Solana mainnet.
3. Identify xStock collateral such as AAPLx, NVDAx and TSLAx.
4. Read live collateral, debt, LTV and liquidation state from Kamino.
5. Read current xStock price and multiplier data from xStocks.
6. Build a historical closure-gap model from the underlying stock's daily OHLC data.
7. Stress the live LTV using a selectable historical scenario: P75, P90 or maximum observed downside.
8. Show a Safe, Watch or Flagged state.
9. When protection is required, prepare a real Kamino repay or add-collateral transaction for the connected wallet to review and sign.
10. Independently verify the confirmed transaction against the complete instruction set prepared by StockPass before marking the action confirmed.
11. Persist monitored positions and alerts for opt-in monitoring and Telegram delivery.

## Source-of-truth boundaries

| Data | Source |
| --- | --- |
| Wallet ownership and token balances | Solana mainnet |
| Kamino collateral, debt, LTV and liquidation | Kamino |
| Current xStock price and multiplier | xStocks |
| Historical stock closure-gap context | Twelve Data |
| Monitoring state and action ledger | Supabase |

Historical data is treated as context only. It never substitutes for on-chain ownership, debt or collateral state.

## Risk scenarios

WGG exposes three historical downside scenarios:

- **Typical / P75** — 75th percentile downside gap.
- **Conservative / P90** — 90th percentile downside gap.
- **Extreme / Max** — maximum observed downside gap in the configured historical window.

All three use the same LTV stress equation. No separate risk mathematics is introduced for the profiles.

## Non-custodial boundaries

WGG does not:

- hold funds or private keys;
- retain standing transaction permission;
- liquidate or move funds automatically;
- fabricate balances or risk readings when upstream data is unavailable.

Every fund-moving action is signed by the user's wallet.

## Weekend and holiday handling

The historical model no longer assumes Friday is always the final trading session. It uses the last observed US equity session followed by a calendar closure of at least three days, so normal Friday→Monday weekends and holiday closures such as Thursday→Monday are represented by the same calculation.

Scheduled monitoring runs before the market-close window on both Thursday and Friday, while the market-data model itself determines the actual trading-session gap.

## Monitoring and cache

Historical Twelve Data responses are cached server-side in Supabase so Vercel cold starts do not discard the full historical cache. The cache is server-only and has a time-to-live.

The Solana RPC proxy keeps read methods available to the application but binds `sendTransaction` to:

- a valid StockPass wallet session;
- the wallet declared by the request;
- the transaction's fee payer;
- a rate limit.

## Testing

The repository includes deterministic tests for:

- P75/P90/max risk scenario selection;
- Safe/Watch/Flagged risk outcomes;
- holiday-aware closure-gap calculation;
- exact Kamino instruction verification;
- tampered instruction data;
- extra and reordered instructions.

Production builds run the test suite before TypeScript and Vite compilation.

## Architecture

- React 19
- Vite
- TypeScript
- Reown wallet connection
- Solana mainnet
- Kamino KLend SDK
- Supabase database and Edge Functions
- Vercel serverless API routes

The active public route is `/`. Authenticated WGG routes are under `/app`.

## Local development

```bash
npm install
npm test
npm run build
npm run dev
```

Required server configuration includes the authenticated Solana RPC URL, Supabase service-role key, Twelve Data API key and cron secret. Browser code never receives the server-side RPC credential.
