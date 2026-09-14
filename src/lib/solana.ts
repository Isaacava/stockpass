import {
  Connection,
  PublicKey,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID
} from '@solana/web3.js';
import type { StockAsset } from './assets';

export type VerifiedPosition = StockAsset & {
  balance: number;
  mint: string;
  verified: boolean;
};

export async function readStockPositions(
  connection: Connection,
  owner: PublicKey,
  assets: StockAsset[]
): Promise<VerifiedPosition[]> {
  const accounts = await Promise.all([
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID })
  ]);

  const rows = [...accounts[0].value, ...accounts[1].value];
  const balances = new Map<string, number>();

  for (const row of rows) {
    const parsed = row.account.data.parsed?.info;
    const mint = parsed?.mint as string | undefined;
    const amount = Number(parsed?.tokenAmount?.uiAmount ?? 0);
    if (mint && amount > 0) balances.set(mint, (balances.get(mint) ?? 0) + amount);
  }

  return assets
    .filter((asset) => Boolean(asset.mint && balances.has(asset.mint)))
    .map((asset) => ({
      ...asset,
      mint: asset.mint!,
      balance: balances.get(asset.mint!)!,
      verified: true
    }));
}

export function shortAddress(address?: string | null) {
  if (!address) return 'Not connected';
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
