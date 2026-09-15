import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { loadVerifiedSolanaXStocks, type CatalogXStock } from './lib/xstockCatalog';
import { readStockPositions, type VerifiedPosition } from './lib/solana';
import './token-badges.css';

function findSlot(): HTMLElement | null {
  const title = document.querySelector('.profile-title');
  if (!title) return null;
  let slot = title.querySelector<HTMLElement>('.profile-holding-badge-slot');
  if (!slot) {
    slot = document.createElement('div');
    slot.className = 'profile-holding-badge-slot';
    title.appendChild(slot);
  }
  return slot;
}

export default function TokenHoldingBadges() {
  const { connection } = useConnection();
  const [catalog, setCatalog] = useState<CatalogXStock[]>([]);
  const [positions, setPositions] = useState<VerifiedPosition[]>([]);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [profileWallet, setProfileWallet] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      const wallet = new URLSearchParams(window.location.search).get('profile');
      setProfileWallet(wallet);
      setSlot(wallet ? findSlot() : null);
    };

    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('popstate', update);
    };
  }, []);

  useEffect(() => {
    if (!profileWallet) {
      setCatalog([]);
      setPositions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await loadVerifiedSolanaXStocks();
        if (cancelled) return;
        setCatalog(rows);
        const assets = rows
          .filter((row) => row.solana_mint)
          .map((row) => ({
            symbol: row.symbol,
            name: row.name,
            icon: row.symbol.replace(/x$/i, ''),
            mint: row.solana_mint,
            source: 'xStocks' as const
          }));
        const holdings = await readStockPositions(connection, new PublicKey(profileWallet), assets);
        if (!cancelled) setPositions(holdings);
      } catch {
        if (!cancelled) setPositions([]);
      }
    })();
    return () => { cancelled = true; };
  }, [connection, profileWallet]);

  const logos = useMemo(() => {
    const byMint = new Map(catalog.map((row) => [row.solana_mint, row.logo_url]));
    return positions.map((position) => ({
      ...position,
      logo: byMint.get(position.mint) || null
    }));
  }, [catalog, positions]);

  if (!slot || !logos.length) return null;

  const shown = logos.slice(0, 6);
  const hidden = logos.length - shown.length;

  return createPortal(
    <div className="profile-holding-badges" aria-label="Verified xStocks held by this wallet">
      {shown.map((position) => (
        <span className="profile-holding-badge" key={position.mint} title={`${position.symbol} · verified holding`}>
          {position.logo ? <img src={position.logo} alt="" loading="lazy" /> : <span className="profile-holding-fallback">{position.symbol.replace(/x$/i, '').slice(0, 3)}</span>}
        </span>
      ))}
      {hidden > 0 && <span className="profile-holding-more">+{hidden}</span>}
    </div>,
    slot
  );
}
