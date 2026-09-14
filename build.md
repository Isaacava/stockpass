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

### Next build targets
1. Replace demo feed rows with Supabase-backed profiles/posts.
2. Add wallet-signature authentication / wallet-to-profile linking.
3. Load official xStock asset metadata and mints through a server-side adapter.
4. Persist verification snapshots and proof slots/signatures.
5. Implement follow/unfollow + notification fan-out.
6. Implement email/Telegram alert workers.
7. Build public profile pages and selective position cards.
8. Add milestone auto-post drafts.
9. Add actual devnet-only demo execution rail, kept separate from mainnet verification.
10. Test the complete judge flow from wallet connect → verified position → post → follow → alert → public share card.

## Architecture invariant

**Mainnet = source of truth for ownership verification and market-facing asset state.**

**Devnet = isolated demo execution environment.**

The two rails must not be mixed. A devnet demo token must never cause a real mainnet holder badge, and a mainnet position must never be treated as a devnet balance.
