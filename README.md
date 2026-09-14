# StockPass

StockPass is a Stocklana social-trading prototype built around one idea: **social proof should be verifiable onchain**.

## Product loop

1. Connect a Solana wallet.
2. Read configured xStock token accounts on Solana mainnet.
3. Turn real wallet state into verified holder/seller proof.
4. Publish a post attached to the asset and verification snapshot.
5. Follow people, create price/social alerts, and discover crowd signals.
6. Share a public profile or position card without exposing the whole portfolio.

## Hackathon fit

Stocklana explicitly calls out consumer/mobile social trading and asks teams to make one wedge excellent. StockPass focuses on the consumer wedge and differentiates on verifiable ownership proof rather than screenshot-based claims.

The Stocklana page currently lists a $100K prize pool and a September 18, 2026 submission deadline. The judging criteria emphasize a real user/problem, a working end-to-end demo, why the product belongs on Solana, and execution quality.

## Architecture

- React + Vite + TypeScript
- Solana Wallet Adapter + `@solana/web3.js`
- Solana **mainnet** for ownership verification/source-of-truth token balances
- Supabase for profiles, posts, follows, alerts, and verification snapshots
- Vercel-ready static frontend
- Planned demo execution rail: Solana **devnet**, isolated from mainnet ownership verification

## Important verification rule

Do not grant a verified badge from ticker text alone. A badge should require:

- a connected wallet
- a configured official asset mint
- a non-zero token balance at verification time
- a stored verification timestamp/slot
- optionally a proof transaction/signature when an execution event exists

The repo intentionally leaves xStock mint variables empty rather than guessing contract addresses.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add the official asset mint addresses and Supabase public project values to `.env.local` before testing live verification.
