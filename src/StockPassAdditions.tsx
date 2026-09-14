import { useEffect, useState } from 'react';
import { Bell, Check, ExternalLink, Link2, TrendingUp, X } from 'lucide-react';
import { useAppKitAccount } from '@reown/appkit/react';
import { fetchPortfolioPnl, sumPortfolioPnl, type TokenPnl } from './lib/pnl';
import { isTelegramLinked, telegramConnectUrl, TELEGRAM_BOT_USERNAME } from './lib/telegram';
import './additions.css';

export default function StockPassAdditions() {
  const { address } = useAppKitAccount();
  const [open, setOpen] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [pnl, setPnl] = useState<TokenPnl[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    (async () => {
      try {
        if (TELEGRAM_BOT_USERNAME) {
          setTelegramLinked(await isTelegramLinked(address));
        }
        const rows = await fetchPortfolioPnl(address);
        if (!cancelled) setPnl(rows);
      } catch {
        if (!cancelled) setPnl([]);
      }
    })();
    return () => { cancelled = true; };
  }, [address]);

  if (!address || (!TELEGRAM_BOT_USERNAME && pnl.length === 0)) return null;

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
    <div className={open ? 'sp-additions sp-additions-open' : 'sp-additions'}>
      {open && (
        <div className="sp-additions-panel">
          <div className="sp-additions-head">
            <div>
              <span className="sp-additions-label">STOCKPASS TOOLS</span>
              <strong>Signals beyond the feed</strong>
            </div>
            <button className="sp-additions-close" onClick={() => setOpen(false)} aria-label="Close"><X size={14} /></button>
          </div>

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

          <a className="sp-additions-foot" href="https://github.com/Isaacava/stockpass" target="_blank" rel="noreferrer">
            Additions are optional and do not change the mainnet proof source of truth. <ExternalLink size={11} />
          </a>
        </div>
      )}

      <button className="sp-additions-trigger" onClick={() => setOpen((value) => !value)} aria-label="Open StockPass tools">
        <span className="sp-additions-pulse" />
        <span>Tools</span>
      </button>
    </div>
  );
}
