# StockPass build log

## 2026-09-14 — foundation

### Verified external requirements
- Stocklana is live with a $100,000 main prize pool.
- Current submission deadline shown by the hackathon site: **September 18, 2026 at 4:00pm ET**.
- The brief explicitly includes **Consumer: mobile-first investing, social trading, spending from a portfolio**.
- Judging asks whether the product could be a real app people use, whether the demo works end-to-end, why it belongs on Solana, and whether execution quality is strong.
- xStocks describes its assets as 1:1 backed tokenized U.S. equities/ETFs and lists Solana as a supported network.

### Product decision
StockPass will compete in the consumer/social-trading wedge.

Core differentiator:
> Anyone can post a gain screenshot. StockPass can attach a claim to the wallet state that actually existed on Solana.

### Implemented
- Vite + React + TypeScript project foundation.
- Solana Wallet Adapter connection layer.
- Mainnet RPC as the ownership-verification rail.
- SPL Token + Token-2022 account scanning adapter.
- Configurable official xStock mint registry.
- Responsive dark editorial UI for mobile and desktop.
- Discover/social feed prototype.
- Verified-holder and verified-seller visual states.
- Portfolio verification page.
- Price alert UI.
- Crowd-signal teaser.
- Proof-backed post composer.
- Supabase schema for profiles, assets, positions, posts, follows, alerts and activity events.
- README and environment template.

### Important implementation rule
The repository must never guess or hard-code an asset mint from a ticker. Official mint addresses must come from a verified asset registry/configuration before a badge can be granted.

### Mainnet-only product decision
StockPass is fully mainnet-based. The product will not use devnet balances, simulated trading balances, or a devnet execution rail.

All supported buys, sells, swaps, and position changes will be real Solana mainnet transactions. The resulting wallet state, token balance, transaction signature, and verification snapshot are the source of truth.

### Next build targets
1. Replace demo feed rows with Supabase-backed profiles/posts.
2. Add wallet-signature authentication / wallet-to-profile linking.
3. Load official xStock asset metadata and mints through a server-side adapter.
4. Persist verification snapshots and proof slots/signatures.
5. Implement follow/unfollow + notification fan-out.
6. Implement email/Telegram alert workers.
7. Build public profile pages and selective position cards.
8. Add milestone auto-post drafts.
9. Build real mainnet buy/sell/swap flows for supported assets, with wallet signing and confirmed transaction receipts.
10. Test the complete judge flow from wallet connect → verified position → real mainnet trade → updated holdings/PnL → post → follow → alert → public share card.

## Architecture invariant

**Solana mainnet = the single source of truth for ownership, balances, asset state, market-facing state, and transaction execution.**

There is no devnet trading environment and no simulated balance layer in the product.
