import { useEffect, useMemo, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useConnection } from '@solana/wallet-adapter-react';
import { useAppKitAccount } from '@reown/appkit/react';
import { Bell, Check, ChevronRight, Copy, FileCheck2, RefreshCw, Search, ShieldCheck, TrendingUp, WalletCards, X } from 'lucide-react';
import { fetchOfficialPrices, resolveOfficialStocks } from './lib/xstocks';
import { readStockPositions, type VerifiedPosition } from './lib/solana';
import { syncRecentXStockActivity } from './lib/solanaActivity';
import { sumXStockValue, fetchXStockPortfolioValue, type XStockPortfolioRow } from './lib/xstockPortfolio';
import { supabase } from './lib/supabase';
import './stockpass-utility-hub.css';

type CatalogRow = {
  symbol: string;
  name: string;
  solana_mint: string | null;
  network: string;
  is_verified: boolean;
  badge_enabled: boolean;
  logo_url: string | null;
};

type PositionEvent = {
  id: string;
  symbol: string;
  event_type: string;
  quantity_delta: number | null;
  transaction_signature: string | null;
  block_time: string | null;
  created_at: string;
  metadata?: { classification?: string; confidence?: string; basis?: string } | null;
};

function eventLabel(event: PositionEvent) {
  const classification = event.metadata?.classification;
  if (classification === 'inferred_buy') return 'Buy · inferred';
  if (classification === 'inferred_sell') return 'Sell · inferred';
  if (classification === 'receive') return 'Receive';
  if (classification === 'send') return 'Send';
  return event.event_type;
}

function eventConfidence(event: PositionEvent) {
  const confidence = event.metadata?.confidence;
  if (confidence === 'high') return 'Instruction-backed';
  if (confidence === 'medium') return 'Balance-backed';
  return null;
}

export default function StockPassUtilityHub() {
  const { address } = useAppKitAccount();
  const { connection } = useConnection();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [selected, setSelected] = useState<CatalogRow | null>(null);
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<VerifiedPosition | null>(null);
  const [events, setEvents] = useState<PositionEvent[]>([]);
  const [portfolioRows, setPortfolioRows] = useState<XStockPortfolioRow[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [loadingAsset, setLoadingAsset] = useState(false);
  const [syncingActivity, setSyncingActivity] = useState(false);
  const [savingProof, setSavingProof] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open || catalog.length) return;
    let cancelled = false;
    setLoadingCatalog(true);
    void supabase
      .from('stockpass_xstock_catalog')
      .select('symbol,name,solana_mint,network,is_verified,badge_enabled,logo_url')
      .eq('network', 'Solana')
      .eq('is_verified', true)
      .order('symbol')
      .limit(1000)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) setCatalog((data ?? []) as CatalogRow[]);
        setLoadingCatalog(false);
      });

    return () => { cancelled = true; };
  }, [open, catalog.length]);

  useEffect(() => {
    if (!open || !address || !catalog.length) return;
    let cancelled = false;
    setLoadingPortfolio(true);
    const assets = catalog
      .filter((row) => row.solana_mint)
      .map((row) => ({
        symbol: row.symbol,
        name: row.name,
        icon: row.symbol.replace(/x$/i, ''),
        mint: row.solana_mint!,
        source: 'xStocks' as const
      }));
    void readStockPositions(connection, new PublicKey(address), assets)
      .then((positions) => fetchXStockPortfolioValue(positions, assets))
      .then((rows) => { if (!cancelled) setPortfolioRows(rows); })
      .catch(() => { if (!cancelled) setPortfolioRows([]); })
      .finally(() => { if (!cancelled) setLoadingPortfolio(false); });
    return () => { cancelled = true; };
  }, [open, address, catalog, connection]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return catalog.slice(0, 80);
    return catalog.filter((row) => `${row.symbol} ${row.name}`.toLowerCase().includes(needle)).slice(0, 80);
  }, [catalog, query]);

  const loadEvents = async (wallet: string, mint: string) => {
    const { data } = await supabase
      .from('stockpass_position_events')
      .select('id,symbol,event_type,quantity_delta,transaction_signature,block_time,created_at,metadata')
      .eq('wallet', wallet)
      .eq('mint', mint)
      .order('created_at', { ascending: false })
      .limit(12);
    setEvents((data ?? []) as PositionEvent[]);
  };

  const syncActivity = async () => {
    if (!address) {
      setMessage('Connect a wallet to sync mainnet ownership activity.');
      return;
    }
    setSyncingActivity(true);
    try {
      const assets = catalog
        .filter((row) => row.solana_mint)
        .map((row) => ({
          symbol: row.symbol,
          name: row.name,
          icon: row.symbol.replace(/x$/i, ''),
          mint: row.solana_mint!,
          source: 'xStocks' as const
        }));
      const synced = await syncRecentXStockActivity(connection, new PublicKey(address), assets);
      setMessage(synced.length ? `Synced ${synced.length} new mainnet xStock events.` : 'No new xStock balance changes found in recent mainnet activity.');
      if (selected?.solana_mint) await loadEvents(address, selected.solana_mint);
      if (assets.length) {
        const positions = await readStockPositions(connection, new PublicKey(address), assets);
        setPortfolioRows(await fetchXStockPortfolioValue(positions, assets));
      }
    } catch {
      setMessage('Could not sync recent Solana activity.');
    } finally {
      setSyncingActivity(false);
    }
  };

  const openAsset = async (row: CatalogRow) => {
    setSelected(row);
    setLoadingAsset(true);
    setSelectedPrice(null);
    setSelectedPosition(null);
    setEvents([]);
    setMessage('');
    try {
      if (row.solana_mint) {
        const resolved = await resolveOfficialStocks([{ symbol: row.symbol, name: row.name, icon: row.symbol.replace(/x$/i, ''), mint: row.solana_mint, source: 'xStocks' }]);
        const prices = await fetchOfficialPrices(resolved);
        setSelectedPrice(prices[row.symbol] ?? null);
        if (address) {
          const positions = await readStockPositions(connection, new PublicKey(address), resolved);
          setSelectedPosition(positions[0] ?? null);
          await loadEvents(address, row.solana_mint);
        }
      }
    } catch {
      setMessage('The live xStock data could not be loaded right now.');
    } finally {
      setLoadingAsset(false);
    }
  };

  const createAlert = async () => {
    if (!address || !selected?.solana_mint || !selectedPrice) {
      setMessage('Connect a wallet and wait for a live xStock price before creating an alert.');
      return;
    }
    const { error } = await supabase.from('stockpass_alerts').insert({
      wallet: address,
      mint: selected.solana_mint,
      direction: 'above',
      target_price: Number((selectedPrice * 1.08).toFixed(2)),
      channel: 'in_app',
      active: true
    });
    setMessage(error ? 'Could not create the alert.' : `${selected.symbol} alert saved.`);
  };

  const saveProofSnapshot = async () => {
    if (!address || !selected?.solana_mint || !selectedPosition) {
      setMessage('A verified positive mainnet balance is required for a proof snapshot.');
      return;
    }
    setSavingProof(true);
    try {
      const slot = await connection.getSlot('confirmed');
      const { error } = await supabase.from('stockpass_verification_snapshots').insert({
        wallet: address,
        mint: selectedPosition.mint,
        balance: selectedPosition.balance,
        slot,
        observed_at: new Date().toISOString(),
        transaction_signature: null
      });
      if (error) throw error;
      setMessage(`${selected.symbol} proof snapshot saved at slot ${slot}.`);
    } catch {
      setMessage('Could not save the verification snapshot.');
    } finally {
      setSavingProof(false);
    }
  };

  const copyProofLabel = async () => {
    if (!address || !selected?.solana_mint || !selectedPosition) return;
    const slot = await connection.getSlot('confirmed');
    const text = `StockPass proof · ${selected.symbol} · ${selectedPosition.balance} held · Solana mainnet slot ${slot} · ${address}`;
    try {
      await navigator.clipboard?.writeText(text);
      setMessage('Proof receipt copied.');
    } catch {
      setMessage('Could not copy the proof receipt.');
    }
  };

  const totalTrackedValue = sumXStockValue(portfolioRows);

  return <>
    {open && <div className="sp-utility-backdrop" onClick={() => setOpen(false)} />}
    {open && <section className="sp-utility-drawer" aria-label="StockPass market utility">
      <header className="sp-utility-header">
        <div>
          <span className="sp-utility-eyebrow">STOCKPASS MARKET</span>
          <strong>Explore verified Solana xStocks</strong>
        </div>
        <button className="sp-utility-close" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button>
      </header>

      <div className="sp-utility-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search AAPLx, NVIDIA, TSLAx…" autoFocus /></div>

      <div className="sp-utility-summary">
        <div><span>Verified catalog</span><strong>{catalog.length || '—'}</strong></div>
        <div><span>Tracked xStock value</span><strong>{loadingPortfolio ? 'Loading…' : portfolioRows.length ? `$${totalTrackedValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}</strong></div>
        <div><span>Network</span><strong><span className="sp-live-dot" /> Mainnet</strong></div>
      </div>

      {selected ? <div className="sp-utility-detail">
        <button className="sp-utility-back" onClick={() => setSelected(null)}>← All xStocks</button>
        <div className="sp-asset-head">
          <div className="sp-asset-logo">{selected.logo_url ? <img src={selected.logo_url} alt="" /> : selected.symbol.replace(/x$/i, '').slice(0, 3)}</div>
          <div><span className="sp-utility-eyebrow">VERIFIED XSTOCK</span><h2>{selected.symbol}</h2><p>{selected.name}</p></div>
          <ShieldCheck size={17} />
        </div>
        <div className="sp-asset-metrics">
          <div><span>Live price</span><strong>{loadingAsset ? 'Loading…' : selectedPrice !== null ? `$${selectedPrice.toFixed(2)}` : '—'}</strong></div>
          <div><span>Your balance</span><strong>{selectedPosition ? selectedPosition.balance.toLocaleString() : '0'}</strong></div>
          <div><span>Mint</span><strong>{selected.solana_mint ? `${selected.solana_mint.slice(0, 5)}…${selected.solana_mint.slice(-5)}` : 'Unavailable'}</strong></div>
        </div>
        <div className="sp-asset-actions"><button onClick={() => void createAlert()}><Bell size={14} /> Set alert</button><button onClick={() => setMessage('Action surface is reserved for confirmed wallet-signed mainnet execution.')}><TrendingUp size={14} /> Action</button></div>
        {selectedPosition && <div className="sp-proof-receipt">
          <div className="sp-proof-receipt-head"><div><span className="sp-utility-eyebrow">MAINNET PROOF</span><strong>Current ownership receipt</strong></div><FileCheck2 size={16} /></div>
          <div className="sp-proof-receipt-grid"><div><span>Asset</span><strong>{selected.symbol}</strong></div><div><span>Balance</span><strong>{selectedPosition.balance.toLocaleString()}</strong></div><div><span>Mint</span><strong>{selectedPosition.mint.slice(0, 5)}…{selectedPosition.mint.slice(-5)}</strong></div></div>
          <div className="sp-proof-receipt-actions"><button onClick={() => void saveProofSnapshot()} disabled={savingProof}><FileCheck2 size={13} /> {savingProof ? 'Saving…' : 'Save proof'}</button><button onClick={() => void copyProofLabel()}><Copy size={13} /> Copy receipt</button></div>
        </div>}
        <div className="sp-utility-section">
          <div className="sp-utility-section-head"><div><strong>Ownership activity</strong><span className="sp-activity-note">Only xStock balance changes are tracked. Ambiguous changes are not called buys or sells.</span></div><button className="ghost-btn compact" onClick={() => void syncActivity()} disabled={syncingActivity || !address}><RefreshCw size={13} className={syncingActivity ? 'sp-spin' : ''} /> {syncingActivity ? 'Syncing…' : 'Sync mainnet'}</button></div>
          {events.length ? events.map((event) => { const confidence = eventConfidence(event); return <div className="sp-event-row" key={event.id}><span className="sp-event-mark">{eventLabel(event).slice(0, 1).toUpperCase()}</span><div><strong>{eventLabel(event)}</strong><span>{event.quantity_delta !== null ? `${event.quantity_delta > 0 ? '+' : ''}${event.quantity_delta}` : 'snapshot'} · {event.block_time ? new Date(event.block_time).toLocaleString() : new Date(event.created_at).toLocaleString()}</span></div><div className="sp-event-meta">{confidence && <small>{confidence}</small>}{event.transaction_signature && <a href={`https://solscan.io/tx/${event.transaction_signature}`} target="_blank" rel="noreferrer">View</a>}</div></div>; }) : <div className="sp-utility-empty"><WalletCards size={16} /><span>No saved xStock provenance events yet. Sync recent confirmed mainnet activity to populate this history.</span></div>}
        </div>
      </div> : <div className="sp-utility-list">
        {loadingCatalog ? <div className="sp-utility-empty">Loading the verified xStock catalog…</div> : filtered.map((row) => <button className="sp-xstock-row" key={row.symbol} onClick={() => void openAsset(row)}><span className="sp-xstock-logo">{row.logo_url ? <img src={row.logo_url} alt="" /> : row.symbol.replace(/x$/i, '').slice(0, 3)}</span><span className="sp-xstock-copy"><strong>{row.symbol}</strong><small>{row.name}</small></span><ShieldCheck size={13} /><ChevronRight size={13} /></button>)}{!filtered.length && <div className="sp-utility-empty">No verified xStocks match “{query}”.</div>}</div>}
      {message && <div className="sp-utility-message"><Check size={13} /> {message}</div>}
    </section>}

    <button className="sp-utility-trigger" onClick={() => { setOpen((value) => !value); setMessage(''); }} aria-label="Open StockPass market utility"><span className="sp-utility-trigger-dot" /><span>Market</span></button>
  </>;
}
