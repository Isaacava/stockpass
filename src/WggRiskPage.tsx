import { ArrowRight, CheckCircle2, ShieldAlert, ShieldCheck, TrendingDown } from 'lucide-react';
import type { KaminoXStockPosition } from './lib/kamino';
import type { XStockPriceMap, WeekendGapMap } from './lib/wggMarketData';
import { evaluateWeekendRisk, type WeekendRiskProfile } from './lib/wggRisk';

type Row = {
  position: KaminoXStockPosition;
  stock: KaminoXStockPosition['xStocks'][number];
  symbol: string;
  gap?: WeekendGapMap[string];
  risk: ReturnType<typeof evaluateWeekendRisk> | null;
  price?: XStockPriceMap[string];
};

const pct = (v: number | null | undefined) => v == null || !Number.isFinite(v) ? '—' : v.toFixed(2) + '%';

function Status({ status }: { status: 'safe' | 'watch' | 'flagged' }) {
  const Icon = status === 'flagged' ? ShieldAlert : status === 'watch' ? TrendingDown : ShieldCheck;
  const classes = status === 'flagged' ? 'bg-flag-soft text-flag' : status === 'watch' ? 'bg-watch-soft text-watch' : 'bg-safe-soft text-safe';
  return <span className={'sp-status ' + classes}><span className={'size-1.5 rounded-full ' + (status === 'flagged' ? 'bg-flag' : status === 'watch' ? 'bg-watch' : 'bg-safe')} /><Icon size={12} />{status}</span>;
}

export default function WggRiskPage({
  rows, counts, prepareFix, preparing, authenticating, riskProfile, onRiskProfileChange,
}: {
  rows: Row[];
  counts: { flagged: number; watch: number; safe: number };
  prepareFix: (row: Row, kind: 'deposit' | 'repay') => Promise<void>;
  preparing: boolean;
  authenticating: boolean;
  riskProfile: WeekendRiskProfile;
  onRiskProfileChange: (profile: WeekendRiskProfile) => void;
}) {
  const state = counts.flagged ? 'flagged' : counts.watch ? 'watch' : counts.safe ? 'safe' : 'empty';
  const title = state === 'flagged' ? 'Protection action required' : state === 'watch' ? 'Protection boundary is close' : state === 'safe' ? 'Guard is clear' : 'Guard is waiting for data';

  return (
    <section className="sp-screen">
      <div className="sp-page-head">
        <div>
          <div className="sp-eyebrow">Guard / risk engine</div>
          <h1 className="sp-page-title">Weekend Gap Guard</h1>
          <p className="sp-page-copy">Current LTV, stressed LTV, liquidation boundary and the selected historical downside scenario for each loaded xStock row.</p>
        </div>
        {state !== 'empty' && <Status status={state} />}
      </div>

      <section className={'sp-risk-summary ' + (state === 'flagged' ? 'sp-next-danger' : state === 'watch' ? 'sp-next-watch' : state === 'safe' ? 'sp-next-safe' : '')}>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {([
            ['p75', 'Typical', '75th percentile downside'],
            ['p90', 'Conservative', '90th percentile downside'],
            ['max', 'Extreme', 'Maximum observed downside'],
          ] as const).map(([value, label, caption]) => (
            <button
              key={value}
              type="button"
              onClick={() => onRiskProfileChange(value)}
              className={'rounded-xl border px-3 py-2.5 text-left transition ' + (riskProfile === value ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink')}
            >
              <div className="text-[10px] font-extrabold">{label}</div>
              <div className={'mt-0.5 text-[8px] leading-4 ' + (riskProfile === value ? 'text-white/70' : 'text-mute')}>{caption}</div>
            </button>
          ))}
        </div>
        <div>
          <div className="sp-eyebrow">Guard status</div>
          <h2 className="mt-1.5 text-[18px] font-bold text-ink">{title}</h2>
          <p className="sp-caption mt-1.5">{rows.length ? counts.flagged + ' flagged · ' + counts.watch + ' watch · ' + counts.safe + ' safe across ' + rows.length + ' xStock row' + (rows.length === 1 ? '' : 's') + '.' : 'No risk result is generated until a real mainnet position and valid weekend-gap history are available.'}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Counter label="Flagged" value={counts.flagged} tone="flag" />
          <Counter label="Watch" value={counts.watch} tone="watch" />
          <Counter label="Safe" value={counts.safe} tone="safe" />
        </div>
      </section>

      <div className="mt-3 flex flex-col gap-3">
        {rows.filter((row) => row.risk).map((row) => {
          const risk = row.risk!;
          const fill = row.position.liquidationLtvPct
            ? Math.min(100, Math.max(4, risk.stressedLtvPct / Math.max(row.position.liquidationLtvPct, risk.stressedLtvPct) * 100))
            : 0;
          const marker = row.position.liquidationLtvPct
            ? Math.min(96, Math.max(4, row.position.liquidationLtvPct / Math.max(row.position.liquidationLtvPct, risk.stressedLtvPct) * 100))
            : 96;

          return (
            <article key={row.stock.mint + row.position.obligation} className="sp-list-card p-4">
              <div className="flex items-center gap-3">
                <div className="sp-asset-mark">{row.symbol.slice(0, 4)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-[13px] font-bold text-ink">{row.symbol}x</div>
                    <Status status={risk.status} />
                  </div>
                  <div className="num mt-1 text-[10px] text-mute">{row.stock.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} units</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <Metric label="Current LTV" value={pct(row.position.ltvPct)} />
                <Metric label="Stressed LTV" value={pct(risk.stressedLtvPct)} />
                <Metric label="Liquidation" value={pct(row.position.liquidationLtvPct)} />
              </div>

              <div className="mt-3">
                <div className="sp-gauge"><span className={'sp-gauge-fill ' + (risk.status === 'flagged' ? 'bg-flag' : risk.status === 'watch' ? 'bg-watch' : 'bg-safe')} style={{ width: fill + '%' }} /><i style={{ left: marker + '%' }} /></div>
                <div className="mt-1.5 flex items-center justify-between gap-3 text-[9px] text-faint">
                  <span>Weekend scenario {pct(risk.adjustedGapPct)}</span>
                  <span>{risk.liquidationDistancePct.toFixed(2)} pts to liquidation</span>
                </div>
              </div>

              {risk.status === 'flagged' && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button onClick={() => void prepareFix(row, 'deposit')} disabled={preparing || authenticating} className="sp-button-brand">
                    Add collateral <ArrowRight size={13} />
                  </button>
                  {row.position.debts.length > 0 && (
                    <button onClick={() => void prepareFix(row, 'repay')} disabled={preparing || authenticating} className="sp-button-outline">
                      Repay <ArrowRight size={13} />
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {!rows.filter((row) => row.risk).length && (
        <div className="sp-empty-block mt-3">
          <ShieldCheck size={22} />
          <div className="sp-empty-title">No risk scenario to display</div>
          <div className="sp-empty-copy">Risk stays empty rather than inventing a stress result.</div>
        </div>
      )}

      {state === 'safe' && (
        <div className="sp-alert-card sp-alert-safe mt-3">
          <CheckCircle2 size={16} className="shrink-0" />
          <div className="sp-alert-copy">The current account is inside the configured historical downside model. StockPass does not automatically move funds.</div>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-soft px-3 py-2.5"><div className="sp-label">{label}</div><div className="num mt-1 text-[12px] font-semibold text-ink">{value}</div></div>;
}
function Counter({ label, value, tone }: { label: string; value: number; tone: 'flag' | 'watch' | 'safe' }) {
  return <div className={'rounded-xl px-3 py-2.5 text-center ' + (tone === 'flag' ? 'bg-flag-soft' : tone === 'watch' ? 'bg-watch-soft' : 'bg-safe-soft')}><div className={'num text-[16px] font-bold ' + (tone === 'flag' ? 'text-flag' : tone === 'watch' ? 'text-watch' : 'text-safe')}>{value}</div><div className={'mt-0.5 text-[9px] font-semibold uppercase ' + (tone === 'flag' ? 'text-flag/70' : tone === 'watch' ? 'text-watch/70' : 'text-safe/70')}>{label}</div></div>;
}
