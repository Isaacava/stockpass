import { Connection, PublicKey } from '@solana/web3.js';
import type { StockAsset } from './assets';
import { supabase } from './supabase';

export type SyncedPositionEvent = {
  wallet: string;
  mint: string;
  symbol: string;
  event_type: 'increase' | 'decrease';
  balance_before: number;
  balance_after: number;
  quantity_delta: number;
  transaction_signature: string;
  slot: number;
  block_time: string | null;
};

function tokenBalanceForMint(rows: Array<{ owner?: string; mint: string; uiTokenAmount?: { uiAmount?: number | null } }>, owner: string, mint: string) {
  return rows
    .filter((row) => row.owner === owner && row.mint === mint)
    .reduce((sum, row) => sum + Number(row.uiTokenAmount?.uiAmount ?? 0), 0);
}

/**
 * Reads recent confirmed Solana mainnet transactions for a wallet and records
 * xStock balance changes. This deliberately classifies changes as increase/
 * decrease; a future trade decoder can distinguish buys/sells from transfers/swaps.
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

  const signatureValues = signatures.map((entry) => entry.signature);
  const { data: existing } = await supabase
    .from('stockpass_position_events')
    .select('transaction_signature,mint')
    .eq('wallet', wallet.toBase58())
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

    const pre = (transaction.meta.preTokenBalances ?? []) as Array<{ owner?: string; mint: string; uiTokenAmount?: { uiAmount?: number | null } }>;
    const post = (transaction.meta.postTokenBalances ?? []) as Array<{ owner?: string; mint: string; uiTokenAmount?: { uiAmount?: number | null } }>;
    const mints = new Set([...pre.map((row) => row.mint), ...post.map((row) => row.mint)]);

    for (const mint of mints) {
      const asset = byMint.get(mint);
      if (!asset) continue;
      const balanceBefore = tokenBalanceForMint(pre, wallet.toBase58(), mint);
      const balanceAfter = tokenBalanceForMint(post, wallet.toBase58(), mint);
      const quantityDelta = balanceAfter - balanceBefore;
      if (!quantityDelta || Math.abs(quantityDelta) < 1e-12) continue;

      const key = `${signatureInfo.signature}:${mint}`;
      if (existingKeys.has(key)) continue;

      events.push({
        wallet: wallet.toBase58(),
        mint,
        symbol: asset.symbol,
        event_type: quantityDelta > 0 ? 'increase' : 'decrease',
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        quantity_delta: quantityDelta,
        transaction_signature: signatureInfo.signature,
        slot: signatureInfo.slot,
        block_time: signatureInfo.blockTime ? new Date(signatureInfo.blockTime * 1000).toISOString() : null
      });
    }
  }

  if (!events.length) return [];
  const { error } = await supabase.from('stockpass_position_events').insert(events);
  if (error) throw error;
  return events;
}
