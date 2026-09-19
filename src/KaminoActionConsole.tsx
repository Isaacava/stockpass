import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowDownToLine, ArrowRight, ArrowUpFromLine, CheckCircle2, ChevronDown,
  CircleDollarSign, LoaderCircle, LockKeyhole, Minus, Plus, RefreshCw, ShieldCheck, WalletCards, X,
} from 'lucide-react';
import { Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { type KaminoXStockPosition } from './lib/kamino';
import { refreshWalletSession } from './lib/walletAuth';
import { readWalletSessionToken } from './lib/walletSession';
import { SOLANA_MAINNET_RPC } from './config';

type WalletProvider = {
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  signTransaction: <T>(transaction: T) => Promise<T>;
};
type ReserveOption = { address: string; symbol: string; mint: string; decimals: number; oraclePrice: number };
type PreparedAction = {
  actionId: string;
  action: ActionType;
  instructions: Array<{ programAddress: string; data: string; accounts: Array<{ address: string; signer: boolean; writable: boolean }> }>;
  lookupTables: string[];
};
type ActionType = 'borrow' | 'supply' | 'deposit' | 'repay' | 'withdraw' | 'close';

const actionMeta: Record<ActionType, { label: string; description: string; icon: typeof Plus }> = {
  borrow: { label: 'Borrow', description: 'Borrow against an existing Kamino obligation.', icon: ArrowUpFromLine },
  supply: { label: 'Supply', description: 'Deposit an asset into a Kamino reserve.', icon: ArrowDownToLine },
  deposit: { label: 'Add collateral', description: 'Increase xStock collateral on an obligation.', icon: Plus },
  repay: { label: 'Repay', description: 'Reduce debt on an existing Kamino obligation.', icon: Minus },
  withdraw: { label: 'Withdraw', description: 'Remove available xStock collateral from an obligation.', icon: ArrowUpFromLine },
  close: { label: 'Close', description: 'Repay debt and withdraw owned collateral.', icon: X },
};

function decodeBase64(value: string) {
  const binary = atob(value || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function toBaseUnits(value: string, decimals: number) {
  const input = value.trim();
  if (!/^\d+(\.\d+)?$/.test(input)) throw new Error('Enter a positive token amount.');
  const [whole, fraction = ''] = input.split('.');
  if (fraction.length > decimals) throw new Error('Amount has more decimal places than this reserve supports.');
  const base = BigInt(whole || '0') * (10n ** BigInt(decimals)) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (base <= 0n) throw new Error('Amount must be greater than zero.');
  return base.toString();
}
async function readResponse(response: Response) {
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) throw new Error(body?.error ?? (text ? text.slice(0, 240) : 'Server returned an empty response.'));
  return body;
}
function tokenAmount(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}
function preciseAmount(value: number, decimals: number) {
  if (!Number.isFinite(value)) return '';
  const safeDecimals = Math.max(0, Math.min(18, decimals));
  return value.toFixed(safeDecimals).replace(/\.?0+$/, '');
}

export default function KaminoActionConsole({
  address, walletProvider, positions, onCompleted,
}: {
  address: string;
  walletProvider: WalletProvider | null;
  positions: KaminoXStockPosition[];
  onCompleted: () => Promise<void> | void;
}) {
  const [action, setAction] = useState<ActionType>(positions.length ? 'deposit' : 'supply');
  const [reserves, setReserves] = useState<ReserveOption[]>([]);
  const [obligation, setObligation] = useState(positions[0]?.obligation ?? '');
  const [reserveAddress, setReserveAddress] = useState('');
  const [collateralReserve, setCollateralReserve] = useState('');
  const [repayReserve, setRepayReserve] = useState('');
  const [amount, setAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [prepared, setPrepared] = useState<PreparedAction | null>(null);
  const [loadingMarkets, setLoadingMarkets] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState('');

  const position = useMemo(() => positions.find((item) => item.obligation === obligation) ?? positions[0], [positions, obligation]);
  const collateralOptions = position?.xStocks ?? [];
  const debtOptions = position?.debts ?? [];
  const marketReserve = reserves.find((item) => item.address === reserveAddress);
  const collateral = collateralOptions.find((item) => item.reserve === collateralReserve) ?? collateralOptions[0];
  const debt = debtOptions.find((item) => item.reserve === repayReserve) ?? debtOptions[0];

  useEffect(() => {
    if (!obligation && positions[0]) setObligation(positions[0].obligation);
  }, [obligation, positions]);

  useEffect(() => {
    if (!address) return;
    setLoadingMarkets(true);
    fetch('/api/kamino-market')
      .then(readResponse)
      .then((body) => {
        const next = Array.isArray(body?.reserves) ? body.reserves : [];
        setReserves(next);
        if (!reserveAddress && next[0]) setReserveAddress(next[0].address);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Kamino markets unavailable.'))
      .finally(() => setLoadingMarkets(false));
  }, [address]);

  useEffect(() => {
    if (action === 'deposit' || action === 'withdraw') {
      const item = collateralOptions.find((candidate) => candidate.reserve === collateralReserve) ?? collateralOptions[0];
      if (item) {
        setCollateralReserve(item.reserve);
        setReserveAddress(item.reserve);
        if (action === 'withdraw' && !amount) setAmount(String(item.amount));
      }
    }
    if (action === 'repay') {
      const item = debtOptions.find((candidate) => candidate.reserve === repayReserve) ?? debtOptions[0];
      if (item) {
        setRepayReserve(item.reserve);
        setReserveAddress(item.reserve);
      }
    }
    if (action === 'close' && debtOptions[0] && collateralOptions[0]) {
      if (!repayReserve) setRepayReserve(debtOptions[0].reserve);
      if (!collateralReserve) setCollateralReserve(collateralOptions[0].reserve);
      setReserveAddress(repayReserve || debtOptions[0].reserve);
      if (!amount) setAmount(String(debtOptions[0].amount));
      if (!withdrawAmount) setWithdrawAmount(String(collateralOptions[0].amount));
    }
  }, [action, collateralOptions, debtOptions, collateralReserve, repayReserve, amount, withdrawAmount]);

  function choose(next: ActionType) {
    setAction(next);
    setPrepared(null);
    setVerified('');
    setError('');
    setAmount(next === 'withdraw' && collateral ? String(collateral.amount) : next === 'repay' && debt ? '' : '');
    setWithdrawAmount(next === 'close' && collateral ? String(collateral.amount) : '');
  }

  async function prepareAction() {
    if (!address || !walletProvider) return;
    setPreparing(true); setError(''); setPrepared(null); setVerified('');
    try {
      if (!walletProvider.signMessage) throw new Error('Connected wallet does not support message signing.');
      await refreshWalletSession({ publicKey: { toBase58: () => address }, signMessage: walletProvider.signMessage.bind(walletProvider) });

      let targetReserve = reserveAddress;
      let baseUnits = '';
      let withdrawBaseUnits: string | undefined;

      if (action === 'borrow' || action === 'supply') {
        if (!marketReserve) throw new Error('Select a Kamino reserve first.');
        if (action === 'borrow' && !position) throw new Error('Borrow requires an existing Kamino obligation.');
        baseUnits = toBaseUnits(amount, marketReserve.decimals);
        targetReserve = marketReserve.address;
      } else if (action === 'deposit' || action === 'withdraw') {
        if (!position || !collateral) throw new Error('Select an xStock collateral reserve.');
        baseUnits = toBaseUnits(amount, collateral.mintDecimals);
        targetReserve = collateral.reserve;
      } else if (action === 'repay') {
        if (!position || !debt) throw new Error('Select a debt reserve.');
        baseUnits = toBaseUnits(amount, debt.mintDecimals);
        targetReserve = debt.reserve;
      } else {
        if (!position || !debt || !collateral) throw new Error('Close requires both a debt and collateral reserve.');
        baseUnits = toBaseUnits(amount, debt.mintDecimals);
        withdrawBaseUnits = toBaseUnits(withdrawAmount, collateral.mintDecimals);
        targetReserve = debt.reserve;
      }

      const token = readWalletSessionToken();
      const body = await readResponse(await fetch('/api/kamino-actions-prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-info': token ? 'stockpass stockpass-session=' + token : 'stockpass' },
        body: JSON.stringify({
          action,
          wallet: address,
          obligationAddress: action === 'supply' ? undefined : position?.obligation,
          reserveAddress: targetReserve,
          withdrawReserveAddress: action === 'close' ? collateral?.reserve : undefined,
          amountBaseUnits: baseUnits,
          withdrawAmountBaseUnits: withdrawBaseUnits,
        }),
      }));
      if (!body?.actionId || !Array.isArray(body.instructions) || !body.instructions.length) throw new Error('Kamino preparation returned no signable instructions.');
      setPrepared({ actionId: body.actionId, action, instructions: body.instructions, lookupTables: body.lookupTables ?? [] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Kamino action preparation failed.');
    } finally {
      setPreparing(false);
    }
  }

  async function signAndVerify() {
    if (!address || !walletProvider || !prepared) return;
    setSigning(true); setError(''); setVerified('');
    try {
      const rpcUrl = SOLANA_MAINNET_RPC;
      if (!rpcUrl) throw new Error('VITE_SOLANA_RPC_URL is not configured.');
      const connection = new Connection(rpcUrl, 'confirmed');
      const latest = await connection.getLatestBlockhash('confirmed');
      const instructions = prepared.instructions.map((ix) => new TransactionInstruction({
        programId: new PublicKey(ix.programAddress),
        data: Buffer.from(decodeBase64(ix.data)),
        keys: ix.accounts.map((account) => ({ pubkey: new PublicKey(account.address), isSigner: account.signer, isWritable: account.writable })),
      }));
      const lookupTables = [];
      for (const item of prepared.lookupTables) {
        const lookup = await connection.getAddressLookupTable(new PublicKey(item));
        if (!lookup.value) throw new Error('Kamino lookup table ' + item + ' is unavailable on mainnet.');
        lookupTables.push(lookup.value);
      }
      const message = new TransactionMessage({ payerKey: new PublicKey(address), recentBlockhash: latest.blockhash, instructions }).compileToV0Message(lookupTables);
      const transaction = new VersionedTransaction(message);
      const signed = await walletProvider.signTransaction(transaction);
      const txSignature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 2 });
      await connection.confirmTransaction({ signature: txSignature, ...latest }, 'confirmed');
      const token = readWalletSessionToken();
      const body = await readResponse(await fetch('/api/kamino-actions-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-info': token ? 'stockpass stockpass-session=' + token : 'stockpass' },
        body: JSON.stringify({ wallet: address, actionId: prepared.actionId, signature: txSignature }),
      }));
      if (!body?.verified) throw new Error(body?.error ?? 'Transaction confirmed but platform verification failed.');
      setVerified(txSignature);
      setPrepared(null);
      await onCompleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Wallet signing or verification failed.');
    } finally {
      setSigning(false);
    }
  }

  const availableActions = (Object.keys(actionMeta) as ActionType[]).filter((item) => item === 'supply' || positions.length > 0);
  const current = actionMeta[action];
  const quickFillBase = action === 'repay' ? debt?.amount : action === 'withdraw' ? collateral?.amount : action === 'close' ? debt?.amount : undefined;
  const quickFillDecimals = action === 'repay' || action === 'close' ? (debt?.mintDecimals ?? 6) : (collateral?.mintDecimals ?? 6);
  const quickFillUnit = action === 'repay' ? (debt ? debt.mint.slice(0, 7) + '…' : 'DEBT') : action === 'withdraw' ? (collateral?.symbol ?? 'xStock') : action === 'close' ? (debt ? debt.mint.slice(0, 7) + '…' : 'DEBT') : '';

  function applyQuickFill(percentage: number) {
    if (quickFillBase == null) return;
    setAmount(preciseAmount(Math.max(0, quickFillBase * percentage), quickFillDecimals));
  }

  return (
    <section className="sp-screen">
      <div className="sp-page-head">
        <div>
          <div className="sp-eyebrow">Actions / Kamino</div>
          <h1 className="sp-page-title">Actions</h1>
          <p className="sp-page-copy">Native Kamino execution. The server prepares from fresh state; your connected wallet signs.</p>
        </div>
        <span className="sp-wallet-pill"><LockKeyhole size={12} /> Non-custodial</span>
      </div>

      <div className="sp-chip-row mt-3">
        {availableActions.map((item) => {
          const Icon = actionMeta[item].icon;
          return <button key={item} onClick={() => choose(item)} className={'sp-chip sp-action-chip ' + (action === item ? 'sp-chip-active' : '')}><Icon size={13} />{actionMeta[item].label}</button>;
        })}
      </div>

      <section className="sp-action-card mt-3">
        <div className="px-4 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div><div className="text-[13px] font-bold text-ink">{current.label}</div><div className="sp-caption mt-1">{current.description}</div></div>
            <WalletCards size={17} className="text-brand" />
          </div>
        </div>

        <div className="p-4">
          {action !== 'supply' && action !== 'borrow' && !positions.length ? (
            <div className="sp-empty-block py-8">
              <ShieldCheck size={20} />
              <div className="sp-empty-title">No Kamino obligation loaded</div>
              <div className="sp-empty-copy">This action needs real position state. Supply remains available without an existing obligation.</div>
            </div>
          ) : (
            <>
              {(action === 'borrow' || action === 'supply') && (
                <Field label="Kamino reserve">
                  <select value={reserveAddress} onChange={(e) => setReserveAddress(e.target.value)} className="sp-input">
                    <option value="">{loadingMarkets ? 'Loading mainnet reserves…' : 'Select reserve'}</option>
                    {reserves.map((item) => <option key={item.address} value={item.address}>{item.symbol} · {item.decimals} decimals</option>)}
                  </select>
                </Field>
              )}

              {action !== 'supply' && action !== 'borrow' && (
                <Field label="Position">
                  <select value={position?.obligation ?? ''} onChange={(e) => { setObligation(e.target.value); setPrepared(null); }} className="sp-input">
                    {positions.map((item) => <option key={item.obligation} value={item.obligation}>{item.obligation.slice(0, 6)}…{item.obligation.slice(-6)} · LTV {item.ltvPct?.toFixed(2) ?? '—'}%</option>)}
                  </select>
                </Field>
              )}

              {(action === 'deposit' || action === 'withdraw' || action === 'close') && (
                <Field label="xStock collateral">
                  <select value={collateralReserve} onChange={(e) => { setCollateralReserve(e.target.value); if (action !== 'close') setReserveAddress(e.target.value); }} className="sp-input">
                    {collateralOptions.map((item) => <option key={item.reserve} value={item.reserve}>{item.symbol} · {tokenAmount(item.amount)} units</option>)}
                  </select>
                </Field>
              )}

              {(action === 'repay' || action === 'close') && (
                <Field label="Debt reserve">
                  <select value={repayReserve} onChange={(e) => { setRepayReserve(e.target.value); setReserveAddress(e.target.value); }} className="sp-input">
                    {debtOptions.map((item) => <option key={item.reserve} value={item.reserve}>{item.mint.slice(0, 6)}…{item.mint.slice(-5)} · {tokenAmount(item.amount)} units</option>)}
                  </select>
                </Field>
              )}

              <AmountField
                label={action === 'close' ? 'Debt repayment amount' : 'Amount'}
                value={amount}
                setValue={setAmount}
                suffix={action === 'borrow' || action === 'supply' ? (marketReserve?.symbol ?? 'TOKEN') : action === 'repay' || action === 'close' ? (debt?.mint ?? 'DEBT') : (collateral?.symbol ?? 'xStock')}
                base={quickFillBase}
                quickFillUnit={quickFillUnit}
                applyQuickFill={applyQuickFill}
              />

              {action === 'close' && (
                <AmountField
                  label="Collateral withdrawal amount"
                  value={withdrawAmount}
                  setValue={setWithdrawAmount}
                  suffix={collateral?.symbol ?? 'xStock'}
                  base={collateral?.amount}
                  quickFillUnit={collateral?.symbol ?? 'xStock'}
                  applyQuickFill={(percentage) => {
                    if (collateral?.amount != null) setWithdrawAmount(preciseAmount(Math.max(0, collateral.amount * percentage), collateral.mintDecimals));
                  }}
                />
              )}

              <div className="mt-4 sp-action-submit">
                <div>
                  <div className="text-[11px] font-semibold text-ink">Prepare from fresh state</div>
                  <div className="sp-caption mt-0.5">No transaction is sent until you approve it in your wallet.</div>
                </div>
                <button onClick={() => void prepareAction()} disabled={preparing || signing} className="sp-button-brand">
                  {preparing ? <><LoaderCircle size={14} className="animate-spin" /> Preparing</> : <>Prepare transaction <ArrowRight size={14} /></>}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="border-t border-line bg-soft px-4 py-4">
          <div className="sp-eyebrow">Transaction preview</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Preview label="Network" value="Solana mainnet" />
            <Preview label="Protocol" value="Kamino" />
            <Preview label="Position" value={position ? position.obligation.slice(0, 5) + '…' + position.obligation.slice(-5) : '—'} />
            <Preview label="Custody" value="None" />
          </div>
        </div>

        {prepared && (
          <div className="border-t border-brand/20 bg-brand-soft px-4 py-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-brand" />
              <div className="min-w-0 flex-1">
                <div className="sp-eyebrow text-brand">Wallet review required</div>
                <div className="mt-1 text-[13px] font-bold text-ink">{actionMeta[prepared.action].label} prepared</div>
                <div className="sp-caption mt-1">{prepared.instructions.length} instructions · {prepared.lookupTables.length} lookup tables · action {prepared.actionId.slice(0, 8)}…</div>
              </div>
            </div>
            <button onClick={() => void signAndVerify()} disabled={signing} className="sp-button-dark mt-3 w-full">
              {signing ? <><RefreshCw size={14} className="animate-spin" /> Waiting for wallet…</> : <>Review &amp; sign <ArrowRight size={14} /></>}
            </button>
          </div>
        )}

        {verified && (
          <div className="border-t border-safe/20 bg-safe-soft px-4 py-4">
            <div className="flex items-center gap-2 text-[11px] font-bold text-safe"><CheckCircle2 size={16} /> Verified on Solana mainnet</div>
            <div className="num mt-1 break-all text-[9px] text-mute">{verified}</div>
          </div>
        )}
        {error && (
          <div className="border-t border-flag/20 bg-flag-soft px-4 py-4">
            <div className="flex items-start gap-3 text-flag"><CircleDollarSign size={16} className="mt-0.5 shrink-0" /><div><div className="text-[11px] font-bold">Action unavailable</div><div className="mt-1 text-[10px] leading-5">{error}</div></div></div>
          </div>
        )}
      </section>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="mt-4 block"><span className="sp-label">{label}</span><div className="mt-1.5">{children}</div></label>;
}
function AmountField({
  label, value, setValue, suffix, base, quickFillUnit, applyQuickFill,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  suffix: string;
  base?: number;
  quickFillUnit: string;
  applyQuickFill: (percentage: number) => void;
}) {
  const hasQuick = base != null && Number.isFinite(base) && base > 0;
  return (
    <Field label={label}>
      <div className="sp-amount-input">
        <span className="text-ink font-semibold text-[14px]">{suffix === 'USD' ? '$' : ''}</span>
        <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0.00" className="num flex-1 bg-transparent outline-none text-[14px] font-semibold text-ink placeholder:text-faint" />
        <span className="num text-[9px] font-semibold text-mute">{suffix}</span>
      </div>
      {hasQuick ? (
        <>
          <div className="mt-2 flex items-center justify-between"><span className="sp-caption">Quick fill uses loaded {quickFillUnit} position state.</span><span className="num text-[9px] text-faint">Max {tokenAmount(base)}</span></div>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {[0.25, 0.5, 0.75, 1].map((value) => <button key={value} type="button" onClick={() => applyQuickFill(value)} className="sp-quick">{value === 1 ? 'Max' : value * 100 + '%'}</button>)}
          </div>
        </>
      ) : (
        <div className="sp-caption mt-1.5">No position-derived quick fill is shown for this action.</div>
      )}
    </Field>
  );
}
function Preview({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-surface px-3 py-2.5"><div className="sp-label">{label}</div><div className="mt-1 text-[10px] font-semibold text-ink truncate">{value}</div></div>;
}
