import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Bell, CircleHelp, Gauge, LoaderCircle, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { useAppKit, useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { discoverKaminoXStockPositions, type KaminoXStockPosition } from './lib/kamino';
import KaminoActionConsole from './KaminoActionConsole';
import { calculateCollateralUsdForTargetLtv, evaluateWeekendRisk } from './lib/wggRisk';
import { fetchWggMarketData, type XStockPriceMap, type WeekendGapMap } from './lib/wggMarketData';
import { refreshWalletSession } from './lib/walletAuth';
import { readWalletSessionToken } from './lib/walletSession';
import './weekend-gap-guard.css';

const endpoint = import.meta.env.VITE_SOLANA_RPC_URL || '';

type WggWalletProvider = {
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  signTransaction: <T>(transaction: T) => Promise<T>;
};

type PreparedInstruction = {
  programAddress: string;
  data: string;
  accounts: Array<{ address: string; signer: boolean; writable: boolean }>;
};
type Prepared = {
  kind: 'deposit' | 'repay';
  symbol: string;
  amountBaseUnits: string;
  instructionCount: number;
  instructions: PreparedInstruction[];
  lookupTables: string[];
} | null;
type Row = {
  position: KaminoXStockPosition;
  stock: KaminoXStockPosition['xStocks'][number];
  symbol: string;
  gap?: WeekendGapMap[string];
  risk: ReturnType<typeof evaluateWeekendRisk> | null;
  price?: XStockPriceMap[string];
};

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export default function WeekendGapGuardWorkspace() {
  const { open } = useAppKit();
  const { walletProvider } = useAppKitProvider<WggWalletProvider>('solana');
  const { address, isConnected } = useAppKitAccount();
  const [positions, setPositions] = useState<KaminoXStockPosition[]>([]);
  const [marketPrices, setMarketPrices] = useState<XStockPriceMap>({});
  const [weekendGaps, setWeekendGaps] = useState<WeekendGapMap>({});
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [signing, setSigning] = useState(false);
  const [prepared, setPrepared] = useState<Prepared>(null);
  const [signature, setSignature] = useState('');
  const [error, setError] = useState('');
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);

  const rows = useMemo<Row[]>(() => positions.flatMap((position) => position.xStocks.map((stock) => {
    const symbol = stock.symbol.replace(/x$/i, '');
    const gap = weekendGaps[stock.symbol];
    const risk = position.liquidationBufferPct != null && gap?.typicalWeekendGapPct != null
      ? evaluateWeekendRisk({ currentBufferPct: position.liquidationBufferPct, typicalWeekendGapPct: gap.typicalWeekendGapPct })
      : null;
    return { position, stock, symbol, gap, risk, price: marketPrices[stock.symbol] };
  })), [positions, weekendGaps, marketPrices]);

  const counts = rows.reduce((acc, row) => {
    if (row.risk?.status === 'flagged') acc.flagged += 1;
    else if (row.risk?.status === 'watch') acc.watch += 1;
    else if (row.risk?.status === 'safe') acc.safe += 1;
    return acc;
  }, { flagged: 0, watch: 0, safe: 0 });

  async function scan() {
    if (!address) return;
    if (!endpoint) { setError('VITE_SOLANA_RPC_URL is not configured.'); return; }
    setLoading(true); setError(''); setPrepared(null); setSignature('');
    try {
      if (!readWalletSessionToken() && walletProvider?.signMessage) {
        await refreshWalletSession({
          publicKey: { toBase58: () => address },
          signMessage: walletProvider.signMessage.bind(walletProvider),
        });
      }

      const discovered = await discoverKaminoXStockPositions(address, endpoint);
      setPositions(discovered);
      const symbols = Array.from(new Set(discovered.flatMap((p) => p.xStocks.map((s) => s.symbol))));
      if (!symbols.length) {
        setMarketPrices({});
        setWeekendGaps({});
      } else {
        const market = await fetchWggMarketData(symbols, 13);
        setMarketPrices(market.prices ?? {});
        setWeekendGaps(market.weekendGaps ?? {});
        if ((market.unavailable ?? []).length && Object.keys(market.weekendGaps ?? {}).length === 0) {
          const firstUnavailable = market.unavailable?.[0]?.reason ?? 'Historical market data is unavailable.';
          setError(`Kamino loaded, but weekend-gap history is unavailable: ${firstUnavailable}`);
        }
      }
      const sessionToken = readWalletSessionToken();
      if (sessionToken) {
        try {
          const monitorResponse = await fetch('/api/wgg-monitor', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-client-info': `stockpass stockpass-session=${sessionToken}`,
            },
            body: JSON.stringify({ mode: 'sync', wallet: address }),
          });
          if (!monitorResponse.ok) {
            const monitorBody = await monitorResponse.json().catch(() => null) as { error?: string } | null;
            console.warn('WGG monitoring sync failed:', monitorBody?.error ?? monitorResponse.status);
          }
        } catch (monitorError) {
          console.warn('WGG monitoring sync failed:', monitorError);
        }
      }

      setLastLoaded(new Date());
    } catch (e) {
      setPositions([]); setMarketPrices({}); setWeekendGaps({});
      setError(e instanceof Error ? e.message : 'Kamino scan failed.');
    } finally { setLoading(false); }
  }

  async function prepareFix(row: Row, kind: 'deposit' | 'repay') {
    if (!address || !row.gap || row.position.liquidationLtvPct == null || row.position.liquidationBufferPct == null) return;
    const typicalGap = row.gap.typicalWeekendGapPct ?? 0;
    const risk = evaluateWeekendRisk({ currentBufferPct: row.position.liquidationBufferPct, typicalWeekendGapPct: typicalGap });
    if (risk.status !== 'flagged') return;
    const targetLtvPct = Math.max(1, row.position.liquidationLtvPct - risk.adjustedGapPct * 1.2);
    let amountBaseUnits = '';
    if (kind === 'deposit') {
      if (!row.price || row.price.multiplier == null || row.price.multiplier <= 0) throw new Error('Current xStocks multiplier is unavailable; refusing to prepare an unsafe raw-token amount.');
      const neededUsd = calculateCollateralUsdForTargetLtv(row.position.borrowValueUsd ?? 0, row.position.depositValueUsd ?? 0, targetLtvPct);
      const scaledTokenAmount = neededUsd / row.price.price;
      const rawTokenAmount = scaledTokenAmount / row.price.multiplier;
      amountBaseUnits = BigInt(Math.ceil(rawTokenAmount * 10 ** row.stock.mintDecimals)).toString();
      if (amountBaseUnits === '0') return;
    }

    setPreparing(true); setAuthenticating(true); setError(''); setPrepared(null); setSignature('');
    try {
      if (!walletProvider?.signMessage) throw new Error('Connected wallet does not support message signing.');
      await refreshWalletSession({
        publicKey: { toBase58: () => address },
        signMessage: walletProvider.signMessage.bind(walletProvider),
      });
      setAuthenticating(false);
      const sessionToken = readWalletSessionToken();
      const clientInfo = sessionToken ? `stockpass stockpass-session=${sessionToken}` : 'stockpass';
      const response = await fetch('/api/wgg-protection-prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-info': clientInfo },
        body: JSON.stringify({
          wallet: address,
          obligationAddress: row.position.obligation,
          reserveAddress: kind === 'repay'
            ? (row.position.debts[0]?.reserve ?? '')
            : row.stock.reserve,
          amountBaseUnits,
          targetLtvPct,
          kind,
        }),
      });
      const data = await response.json().catch(() => null) as {
        error?: string;
        instructions?: PreparedInstruction[];