import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { PublicKey } from '@solana/web3.js';
import { useConnection } from '@solana/wallet-adapter-react';
import { readStockPositions, type VerifiedPosition } from './lib/solana';
import { supabase } from './lib/supabase';
import './profile-holding-badges.css';

type CatalogRow = {
  symbol: string;
  name: string;
  solana_mint: string;
  logo_url: string | null;
};

function getProfileWallet() {
  return new URLSearchParams(window.location.search).get('profile');
}

export default function ProfileHoldingBadges() {
  const { connection } = useConnection();
  const [wallet, setWallet] = useState<string | null>(() => getProfileWallet());
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [holdings, setHoldings] = useState<VerifiedPosition[]>([]);

  const findSlot = () => {
    const title = document.querySelector('.profile-title h1');
    if (!title || !(title instanceof HTMLElement)) {
      setSlot(null);
      return;
    }
    let target = title.nextElementSibling;
    if (!(target instanceof HTMLElement) || !target.classList.contains('profile-holding-badges-slot')) {
      target = document.createElement('div');
      target.className = 'profile-holding-badges-slot';
      title.insertAdjacentElement('afterend', target);
    }
    setSlot(target);
  };

  useEffect(() => {
    const check = () => {
      const nextWallet = getProfileWallet();
      setWallet((current) => current === nextWallet ? current : nextWallet);
      findSlot();
    };
    check();
    const observer = new MutationObserver(findSlot);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(check, 700);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  const load = async () => {
    if (!wallet) {
      setHoldings([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('stockpass_xstock_catalog')
        .select('symbol,name,solana_mint,logo_url')
        .eq('network', 'Solana')
        .eq('is_verified', true)
        .eq('badge_enabled', true)
        .not('solana_mint', 'is', null)
        .limit(1000);
      if (error) throw error;
      const rows = (data ?? []) as CatalogRow[];
      const assets = rows.map((row) => ({
        symbol: row.symbol,
        name: row.name,
        icon: row.symbol.replace(/x$/, '').slice(0, 5),
        mint: row.solana_mint,
        source: 'xStocks' as const
      }));
      const positions = await readStockPositions(connection, new PublicKey(wallet), assets);
      setHoldings(positions);
    } catch {
      setHoldings([]);
    }
  };

  useEffect(() => {
    void load();
  }, [wallet, connection]);

  const visible = useMemo(() => holdings.slice(0, 6), [holdings]);
  const remaining = Math.max(0, holdings.length - visible.length);

  if (!slot || !wallet || holdings.length === 0) return null;

  return createPortal(
    <div className="profile-holding-badges" aria-label={`${holdings.length} xStocks held`}>
      {visible.map((position) => (
        <span className="profile-holding-badge" key={position.mint} title={`${position.name} · verified mainnet holding`}>
          <span className="profile-holding-badge-mark">{position.icon}</span>
          <span>{position.symbol}</span>
        </span>
      ))}
      {remaining > 0 && <span className="profile-holding-more">+{remaining}</span>}
    </div>,
    slot
  );
}
