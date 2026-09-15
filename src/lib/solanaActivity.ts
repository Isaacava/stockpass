import { Connection, PublicKey } from '@solana/web3.js';
import type { StockAsset } from './assets';
import { supabase } from './supabase';

export type SyncedPositionEvent = {
  wallet: string;
  mint: string;
  symbol: string;
  event_type: 'buy' | 'sell' | 'receive' | 'send' | 'increase' | 'decrease';
  balance_before: number;
  balance_after: number;
  quantity_delta: number;
  transaction_signature: string;
  slot: number;
  block_time: string | null;
  source: 'solana_mainnet';
  metadata: {
    classification: 'trade_inferred' | 'transfer_inferred' | 'balance_change';
    confidence: 'medium' | 'low';
    payment_token_mints?: string[];
    native_sol_delta_lamports?: number;
  };
};

type ParsedTokenBalance = {
  owner?: string;
  mint: string;
  uiTokenAmount?: { uiAmount?: number | null };
};

function tokenBalanceForMint(rows: ParsedTokenBalance[], owner: string, mint: string) {
  return rows
    .filter((row) => row.owner === owner && row.mint === mint)
    .reduce((sum, row) => sum + Number(row.uiTokenAmount?.uiAmount ?? 0), 0);
}

function walletTokenDeltas(pre: ParsedTokenBalance[], post: ParsedTokenBalance[], owner: string) {
  const mints = new Set([
    ...pre.filter((row) => row.owner === owner).map((row) => row.mint),
    ...post.filter((row) => row.owner === owner).map((row) => row.mint)
  ]);
  const deltas = new Map<string, number>();
  for (const mint of mints) {
    const delta = tokenBalanceForMint(post, owner, mint) - tokenBalanceForMint(pre, owner, mint);
    if (Math.abs(delta) > 1e-12) deltas.set(mint, delta);
  }
  return deltas;
}

/**
 * Reads recent confirmed Solana mainnet transactions for a wallet and records
 * xStock balance changes. Trade labels are intentionally conservative: an xStock
 * increase/decrease is only labelled buy/sell when another wallet-owned token or
 * native SOL moves in the opposite direction in the same transaction. Otherwise
 * the event is stored as receive/send, with the original balance-only fallback
 * retained for ambiguous cases.
 */
export async function syncRecentXStockActivity(
  connection: Connection,
  wallet: PublicKey,
  assets: StockAsset[],
  limit = 40
): Promise<SyncedPositionEvent[]> {
  const byMint = new Map(assets.filter((asset) => asset.mint).map((asset) => [asset.mint, asset]));
  if (!byMint.size) return [];

  const signatures = await connection.getSignaturesForAddress(wallet, { limit }, 'confirmed');
  if (!signatures.length) return [];

  const walletAddress = wallet.toBase58();
  const signatureValues = signatures.map((entry) => entry.signature);
  const { data: existing } = await supabase
    .from('stockpass_position_events')
    .select('transaction_signature,mint')
    .eq('wallet', walletAddress)
    .not('transaction_signature', 'is', null)
    .in('transaction_signature', signatureValues);

  const existingKeys = new Set((existing ?? []).map((row) => `${row.transaction_signature}:${row.mint}`));
  const transactions = await connection.getParsedTransactions(signatureValues, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0
  });

  const events: SyncedPositionEvent[] = [];
  for (let index = 0; index < transactions.length; index += 1) {
    const transaction = transactions[index];
    if (!transaction?.meta) continue;
    const signatureInfo = signatures[index];
    if (!signatureInfo) continue;

    const pre = (transaction.meta.preTokenBalances ?? []) as ParsedTokenBalance[];
    const post = (transaction.meta.postTokenBalances ?? []) as ParsedTokenBalance[];
    const walletDeltas = walletTokenDeltas(pre, post, walletAddress);
    const mints = new Set([...pre.map((row) => row.mint), ...post.map((row) => row.mint)]);

    const accountKeys = transaction.transaction.message.accountKeys.map((key) => ({
      address: key.pubkey.toBase58(),
      signer: key.signer
    }));
    const walletIndex = accountKeys.findIndex((key) => key.address === walletAddress);
    const nativeSolDeltaLamports = walletIndex >= 0
      ? Number(transaction.meta.postBalances?.[walletIndex] ?? 0) - Number(transaction.meta.preBalances?.[walletIndex] ?? 0)
      : 0;
    const feeLamports = Number(transaction.meta.fee ?? 0);
    const netSpendAfterFee = nativeSolDeltaLamports + feeLamports;
    const nativePaymentOut = netSpendAfterFee < 0;
    const nativePaymentIn = netSpendAfterFee > 0;

    for (const mint of mints) {
      const asset = byMint.get(mint);
      if (!asset) continue;
      const balanceBefore = tokenBalanceForMint(pre, walletAddress, mint);
      const balanceAfter = tokenBalanceForMint(post, walletAddress, mint);
      const quantityDelta = balanceAfter - balanceBefore;
      if (!quantityDelta || Math.abs(quantityDelta) < 1e-12) continue;

      const key = `${signatureInfo.signature}:${mint}`;
      if (existingKeys.has(key)) continue;

      const oppositeTokenMints = Array.from(walletDeltas.entries())
        .filter(([otherMint, delta]) => otherMint !== mint && Math.sign(delta) !== Math.sign(quantityDelta))
        .map(([otherMint]) => otherMint);
      const tradeLike = quantityDelta > 0
        ? oppositeTokenMints.length > 0 || nativePaymentOut
        : oppositeTokenMints.length > 0 || nativePaymentIn;

      let event_type: SyncedPositionEvent['event_type'];
      let classification: SyncedPositionEvent['metadata']['classification'];
      let confidence: SyncedPositionEvent['metadata']['confidence'];

      if (tradeLike) {
        event_type = quantityDelta > 0 ? 'buy' : 'sell';
        classification = 'trade_inferred';
        confidence = 'medium';
      } else if (quantityDelta > 0) {
        event_type = 'receive';
        classification = 'transfer_inferred';
        confidence = 'medium';
      } else {
        event_type = 'send';
        classification = 'transfer_inferred';
        confidence = 'medium';
      }

      events.push({
        wallet: walletAddress,
        mint,
        symbol: asset.symbol,
        event_type,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        quantity_delta: quantityDelta,
        transaction_signature: signatureInfo.signature,
        slot: signatureInfo.slot,
        block_time: signatureInfo.blockTime ? new Date(signatureInfo.blockTime * 1000).toISOString() : null,
        source: 'solana_mainnet',
        metadata: {
          classification,
          confidence,
          ...(oppositeTokenMints.length ? { payment_token_mints: oppositeTokenMints } : {}),
          ...(nativeSolDeltaLamports ? { native_sol_delta_lamports: nativeSolDeltaLamports } : {})
        }
      });
    }
  }

  if (!events.length) return [];
  const { error } = await supabase.from('stockpass_position_events').insert(events);
  if (error) throw error;
  return events;
}
