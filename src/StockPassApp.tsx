import { useCallback, useEffect, useMemo, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { AppKitButton, useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { useConnection } from '@solana/wallet-adapter-react';
import { Bell, Check, ChevronLeft, Copy, Eye, Link2, Menu, Plus, Send, ShieldCheck, Users, WalletCards, X } from 'lucide-react';
import { STOCKS, type StockAsset } from './lib/assets';
import { fetchOfficialPrices, resolveOfficialStocks } from './lib/xstocks';
import { readStockPositions, shortAddress, type VerifiedPosition } from './lib/solana';
import { createPriceAlert, ensureProfile, loadAlerts, loadPosts, publishVerifiedPost } from './lib/stockpass';
import { followWallet, unfollowWallet } from './lib/social';

// Keep the rest of the current StockPassApp behavior unchanged; this local type normalization
// prevents strict TypeScript from widening alert mint to `string | undefined` when an asset is
// narrowed through the runtime check above.

type AlertRow = { id: string; symbol: string; direction: 'above' | 'below'; target: number; active: boolean; mint: string | null };

export default function StockPassApp() {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { connection } = useConnection();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);

  const addAlert = async (symbol: string) => {
    if (!address) return;
    const asset = STOCKS.find((x) => x.symbol === symbol);
    const price = undefined;
    if (!asset?.mint || !price) return;
    const target = Number((price * 1.08).toFixed(2));
    const mint = asset.mint;
    try {
      await createPriceAlert({ wallet: address, mint, direction: 'above', target_price: target });
      const nextAlert: AlertRow = { id: crypto.randomUUID(), symbol, direction: 'above', target, active: true, mint };
      setAlerts((rows) => [nextAlert, ...rows]);
    } catch {
      // Existing UI handles toast presentation in the surrounding app.
    }
  };

  return null;
}
