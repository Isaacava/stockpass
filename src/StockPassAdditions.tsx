import { useEffect, useMemo, useState } from 'react';
import { Bell, Check, ExternalLink, Link2, ShieldCheck, TrendingUp, WalletCards, X } from 'lucide-react';
import { useAppKitAccount } from '@reown/appkit/react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { STOCKS, type StockAsset } from './lib/assets';
import { fetchOfficialPrices, resolveOfficialStocks } from './lib/xstocks';
import { readStockPositions, type VerifiedPosition } from './lib/solana';
import { fetchPortfolioPnl, sumPortfolioPnl, type TokenPnl } from './lib/pnl';
import { isTelegramLinked, telegramConnectUrl, TELEGRAM_BOT_USERNAME } from './lib/telegram';
import StockPassDiscoverMarket from './StockPassDiscoverMarket';
import './additions.css';

export default function StockPassAdditions() {
  const { address } = useAppKitAccount();
  const { connection } = useConnection();
  const [open, setOpen] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [pnl, setPnl] = useState<TokenPnl[]>([]);
  const [assets, setAssets] = useState<StockAsset[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [positions, setPositions] = useState<VerifiedPosition[]>([]);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    (async () => {
      try {
        const official = await resolveOfficialStocks(STOCKS);
        const livePrices = await fetchOfficialPrices(official);
        const rows = await readStockPositions(connection, new PublicKey(address), official);
        if (!cancelled) {
          setAssets(official);
          setPrices(livePrices);
          setPositions(rows);
        }
        if (TELEGRAM_BOT_USERNAME) {
          const linked = await isTelegramLinked(address);
          if (!cancelled) setTelegramLinked(linked);
        }
        const pnlRows = await fetchPortfolioPnl(address);
        if (!cancelled) setPnl(pnlRows);
      } catch {
        if (!cancelled) {
          setPositions([]);
          setPnl([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [address, connection]);

  useEffect(() => {
    if (!open || !address) return;
    let cancelled = false;
    setLoadingPortfolio(true);
    (async () => {
      try {
        const official = assets.length ? assets : await resolveOfficialStocks(STOCKS);
        const livePrices = Object.keys(prices).length ? prices : await fetchOfficialPrices(official);
        const rows = await readStockPositions(connection, new PublicKey(address), official);
        if (!cancelled) {
          setAssets(official);
          setPrices(livePrices);
          setPositions(rows);
        }
      } catch {
        if (!cancelled) setPositions([]);
      } finally {
        if (!cancelled) setLoadingPortfolio(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, address, connection]);

  const holdingValue = useMemo(() => positions.reduce((sum, position) => {
    const price = prices[position.symbol];
    return sum + (price ? position.balance * price : 0);
  }, 0), [positions, prices]);

  if (!address || (!TELEGRAM_BOT_USERNAME && pnl.length === 0 && assets.length === 0 && positions.length === 0)) return <StockPassDiscoverMarket />;

  const telegramUrl = telegramConnectUrl(address);
  const totalPnl = sumPortfolioPnl(pnl);

  const connectTelegram = () => {
    if (!telegramUrl) return;
    window.open(telegramUrl, '_blank', 'noopener,noreferrer');
    setBusy(true);
    window.setTimeout(async () => {
      try {
        setTelegramLinked(await isTelegramLinked(address));
      } finally {
        setBusy(false);
      }
    }, 2500);
  };

  return (
    <>
      <StockPassDiscoverMarket />
      <div className={open ? 'sp-additions sp-additions-open' : 'sp-additions'}>
        {open && (
          <div className="sp-additions-panel">
            <div className="sp-additions-head">
              <div>
                <span className="sp-additions-label">STOCKPASS UTILITY</span>
                <strong>Live wallet tools</strong>
              </div>
              <button className="sp-additions-close" onClick={() => setOpen(false)} aria-label="Close"><X size={14} /></button>
            </div>

            <div className="sp-tool-summary">
              <div><span>Supported xStocks held</span><b>{loadingPortfolio ? '…' : positions.length}</b></div>
              <div><span>Live estimated value</span><b>{holdingValue > 0 ? `$${holdingValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}</b></div>
            </div>

            {positions.length > 0 && (
              <div className="sp-holdings-mini">
                {positions.slice(0, 4).map((position) => {
                  const price = prices[position.symbol];
                  const value = price ? position.balance * price : null;
                  return <div className="sp-holding-mini" key={position.mint}>
                    <span className="sp-holding-icon">{position.icon}</span>
                    <div><strong>{position.symbol}</strong><small>{position.balance.toLocaleString()} held</small></div>
                    <b>{value !== null ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}</b>
                  </div>;
                })}
              </div>
            )}

            {TELEGRAM_BOT_USERNAME && (
              <div className="sp-tool-row">
                <div className="sp-tool-icon"><Bell size={15} /></div>
                <div className="sp-tool-copy">
                  <strong>Telegram alerts</strong>
                  <span>{telegramLinked ? 'Connected — price triggers can reach Telegram.' : 'Connect Telegram for price alert delivery.'}</span>
                </div>
                {telegramLinked ? <span className="sp-tool-status"><Check size={12} /> Linked</span> : <button className="sp-tool-action" onClick={connectTelegram} disabled={busy}>{busy ? 'Checking…' : <><Link2 size={12} /> Connect</>}</button>}
              </div>
            )}

            {pnl.length > 0 && (
              <div className="sp-tool-row">
                <div className="sp-tool-icon"><TrendingUp size={15} /></div>
                <div className="sp-tool-copy">
                  <strong>xStock PnL</strong>
                  <span>{pnl.length} tracked position{pnl.length === 1 ? '' : 's'} from the configured xStock universe.</span>
                </div>
                <span className={totalPnl >= 0 ? 'sp-pnl positive' : 'sp-pnl negative'}>{totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}</span>
              </div>
            )}

            {positions.length === 0 && !loadingPortfolio && (
              <div className="sp-utility-empty"><WalletCards size={15} /><span>No supported xStock balance detected for this wallet.</span></div>
            )}

            <a className="sp-additions-foot" href="https://github.com/Isaacava/stockpass" target="_blank" rel="noreferrer">
              Mainnet wallet state remains the source of truth. <ExternalLink size={11} />
            </a>
          </div>
        )}

        <button className="sp-additions-trigger" onClick={() => setOpen((value) => !value)} aria-label="Open StockPass utility">
          <ShieldCheck size={13} />
          <span>Utility</span>
        </button>
      </div>
    </>
  );
}
