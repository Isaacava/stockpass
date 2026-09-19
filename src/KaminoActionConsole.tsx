import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { type KaminoXStockPosition } from './lib/kamino';
import { refreshWalletSession } from './lib/walletAuth';
import { readWalletSessionToken } from './lib/walletSession';

type WalletProvider = {
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  signTransaction: <T>(transaction: T) => Promise<T>;
};

type ReserveOption = { address: string; symbol: string; mint: string; decimals: number; oraclePrice: number };
type PreparedInstruction = { programAddress: string; data: string; accounts: Array<{ address: string; signer: boolean; writable: boolean }> };
type PreparedAction = { actionId: string; action: ActionType; instructions: PreparedInstruction[]; lookupTables: string[] };
type ActionType = 'borrow' | 'supply' | 'deposit' | 'repay' | 'withdraw' | 'close';
const labels: Record<ActionType, string> = { borrow: 'Borrow', supply: 'Lend', deposit: 'Add collateral', repay: 'Repay', withdraw: 'Withdraw collateral', close: 'Close position' };

function decodeBase64(value: string) { const binary = atob(value || ''); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i); return bytes; }
function toBaseUnits(value: string, decimals: number) {
  const input = value.trim();
  if (!/^\d+(\.\d+)?$/.test(input)) throw new Error('Enter a positive token amount.');
  const [whole, fraction = ''] = input.split('.');
  if (fraction.length > decimals) throw new Error('Amount has more decimal places than this reserve supports.');
  const base = BigInt(whole || '0') * (10n ** BigInt(decimals)) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (base <= 0n) throw new Error('Amount must be greater than zero.');
  return base.toString();
}

export default function KaminoActionConsole({
  address,
  walletProvider,
  positions,
  onCompleted,
}: {
  address: string;
  walletProvider: WalletProvider | null;
  positions: KaminoXStockPosition[];
  onCompleted: () => void;
}) {
  const [action, setAction] = useState<ActionType>(positions.length ? 'borrow' : 'supply');
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
  const collateral = collateralOptions.find((item) => item.reserve === collateralReserve);
  const debt = debtOptions.find((item) => item.reserve === repayReserve);

  useEffect(() => { if (!obligation && positions[0]) setObligation(positions[0].obligation); }, [obligation, positions]);

  useEffect(() => {
    if (!address) return;
    setLoadingMarkets(true);
    fetch('/api/kamino-market')
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body?.error || 'Kamino market lookup failed.'); return body; })
      .then((body) => { const next = body.reserves ?? []; setReserves(next); if (!reserveAddress && next[0]) setReserveAddress(next[0].address); })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Kamino markets unavailable.'))
      .finally(() => setLoadingMarkets(false));
  }, [address, reserveAddress]);

  useEffect(() => {
    if (action === 'deposit' || action === 'withdraw') {
      const item = collateralOptions.find((candidate) => candidate.reserve === collateralReserve) ?? collateralOptions[0];
      if (item) { setCollateralReserve(item.reserve); setReserveAddress(item.reserve); if (action === 'withdraw' && !amount) setAmount(String(item.amount)); }
    }
    if (action === 'repay') {
      const item = debtOptions.find((candidate) => candidate.reserve === repayReserve) ?? debtOptions[0];
      if (item) { setRepayReserve(item.reserve); setReserveAddress(item.reserve); }
    }
    if (action === 'close' && debtOptions[0] && collateralOptions[0]) {
      if (!repayReserve) setRepayReserve(debtOptions[0].reserve);
      if (!collateralReserve) setCollateralReserve(collateralOptions[0].reserve);
      setReserveAddress(repayReserve || debtOptions[0].reserve);
      if (!amount) setAmount(String(debtOptions[0].amount));
      if (!withdrawAmount) setWithdrawAmount(String(collateralOptions[0].amount));
    }
  }, [action, collateralOptions, debtOptions, collateralReserve, repayReserve, amount, withdrawAmount]);

  function choose(next: ActionType) { setAction(next); setPrepared(null); setVerified(''); setError(''); setAmount(''); setWithdrawAmount(''); }

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
      const response = await fetch('/api/kamino-actions-prepare', {
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
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Kamino action preparation failed.');
      if (!body?.actionId || !Array.isArray(body.instructions) || !body.instructions.length) throw new Error('Kamino preparation returned no signable instructions.');
      setPrepared({ actionId: body.actionId, action, instructions: body.instructions, lookupTables: body.lookupTables ?? [] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Kamino action preparation failed.');
    } finally { setPreparing(false); }
  }

  async function signAndVerify() {
    if (!address || !walletProvider || !prepared) return;
    setSigning(true); setError(''); setVerified('');
    try {
      const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL || '';
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
      const signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 2 });
      await connection.confirmTransaction({ signature, ...latest }, 'confirmed');

      const token = readWalletSessionToken();
      const verifiedResponse = await fetch('/api/kamino-actions-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-info': token ? 'stockpass stockpass-session=' + token : 'stockpass' },
        body: JSON.stringify({ wallet: address, actionId: prepared.actionId, signature }),
      });
      const body = await verifiedResponse.json().catch(() => null);
      if (!verifiedResponse.ok) throw new Error(body?.error || 'Transaction confirmed but platform verification failed.');
      setVerified(signature);
      setPrepared(null);
      onCompleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Wallet signing or verification failed.');
    } finally { setSigning(false); }
  }

  return <section className="wgg-action-console">
    <div className="wgg-action-console-head">
      <div><div className="wgg-eyebrow"><span /> KAMINO CONTROL SURFACE</div><h2>Manage the position without leaving the guard.</h2><p>Borrow, lend, add collateral, repay, withdraw, or close against fresh Kamino state. WGG turns the stress scenario into a concrete action; your wallet approves every fund movement.</p></div>
      <div className="wgg-action-trust"><LockKeyhole size={15} /><span>Non-custodial</span></div>
    </div>
    <div className="wgg-action-tabs">{(Object.keys(labels) as ActionType[]).map((item) => <button key={item} className={action === item ? 'is-active' : ''} onClick={() => choose(item)}>{labels[item]}</button>)}</div>

    <div className="wgg-action-body">
      {(action !== 'supply' && !positions.length) ? <div className="wgg-action-empty"><ShieldCheck size={18} /><strong>No Kamino obligation loaded</strong><span>Scan an existing xStock-backed obligation first. Pure lending supply can be prepared without an obligation.</span><button className="wgg-secondary" onClick={() => void onCompleted()}><RefreshCw size={13} /> Refresh</button></div> : <>
        {(action === 'borrow' || action === 'supply') && <label className="wgg-action-field"><span>Kamino reserve</span><select value={reserveAddress} onChange={(event) => setReserveAddress(event.target.value)}>{loadingMarkets && <option>Loading mainnet reserves…</option>}{reserves.map((item) => <option key={item.address} value={item.address}>{item.symbol} · {item.decimals} decimals</option>)}</select></label>}

        {action !== 'supply' && action !== 'borrow' && <label className="wgg-action-field"><span>Position</span><select value={position?.obligation ?? ''} onChange={(event) => { setObligation(event.target.value); setPrepared(null); }}>{positions.map((item) => <option key={item.obligation} value={item.obligation}>{item.obligation.slice(0, 6)}…{item.obligation.slice(-6)} · LTV {item.ltvPct?.toFixed(1) ?? '—'}%</option>)}</select></label>}

        {(action === 'deposit' || action === 'withdraw' || action === 'close') && <label className="wgg-action-field"><span>xStock collateral</span><select value={collateralReserve} onChange={(event) => { setCollateralReserve(event.target.value); if (action !== 'close') setReserveAddress(event.target.value); }}>{collateralOptions.map((item) => <option key={item.reserve} value={item.reserve}>{item.symbol} · {item.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} units</option>)}</select></label>}

        {(action === 'repay' || action === 'close') && <label className="wgg-action-field"><span>Debt reserve</span><select value={repayReserve} onChange={(event) => { setRepayReserve(event.target.value); setReserveAddress(event.target.value); }}>{debtOptions.map((item) => <option key={item.reserve} value={item.reserve}>{item.mint.slice(0, 5)}…{item.mint.slice(-4)} · {item.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} units</option>)}</select></label>}

        <label className="wgg-action-field"><span>{action === 'close' ? 'Debt repayment amount' : 'Amount'}</span><div className="wgg-action-input"><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /><strong>{action === 'borrow' || action === 'supply' ? (marketReserve?.symbol || 'TOKEN') : action === 'repay' || action === 'close' ? (debt?.mint || 'DEBT') : (collateral?.symbol || 'xStock')}</strong></div></label>

        {action === 'close' && <label className="wgg-action-field"><span>Collateral withdrawal amount</span><div className="wgg-action-input"><input inputMode="decimal" value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} placeholder="0.00" /><strong>{collateral?.symbol || 'xStock'}</strong></div></label>}

        <div className="wgg-action-submit"><div><strong>{labels[action]}</strong><span>Rebuild against fresh mainnet state before approval.</span></div><button className="wgg-primary" onClick={() => void prepareAction()} disabled={preparing || signing}>{preparing ? <><LoaderCircle size={14} className="wgg-spin" /> Preparing</> : <>Prepare transaction <ArrowRight size={14} /></>}</button></div>
      </>}
    </div>

    {prepared && <div className="wgg-action-prepared"><div><CheckCircle2 size={17} /><div><strong>{labels[prepared.action]} ready</strong><span>{prepared.instructions.length} instructions · server action {prepared.actionId.slice(0, 8)}…</span></div></div><button className="wgg-primary" onClick={() => void signAndVerify()} disabled={signing}>{signing ? <><LoaderCircle size={14} className="wgg-spin" /> Waiting for wallet</> : <>Review & sign <ArrowRight size={14} /></>}</button></div>}

    {verified && <div className="wgg-action-success"><CheckCircle2 size={17} /><div><strong>Verified on Solana mainnet</strong><span>{verified}</span></div></div>}
    {error && <div className="wgg-error wgg-action-error"><ShieldCheck size={17} /><div><strong>Action unavailable</strong><span>{error}</span></div></div>}
  </section>;
}
