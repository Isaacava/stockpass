import { Connection, PublicKey } from '@solana/web3.js';

export const KAMINO_MAIN_MARKET = new PublicKey('7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF');

export type WggCollateral = {
  mint: string;
  amount: number;
  symbol?: string;
};

export type WggKaminoObligation = {
  address: string;
  borrowedValueUsd: number | null;
  depositedValueUsd: number | null;
  healthFactor: number | null;
  liquidationThresholdUsd: number | null;
  collaterals: WggCollateral[];
};

type KaminoModule = {
  KaminoMarket?: {
    load: (...args: any[]) => Promise<any>;
  };
};

let sdkPromise: Promise<KaminoModule> | null = null;

async function loadKaminoSdk() {
  if (!sdkPromise) {
    sdkPromise = import('@kamino-finance/klend-sdk') as Promise<KaminoModule>;
  }
  return sdkPromise;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object') {
    const candidate = value as { toNumber?: () => number; toString?: () => string };
    try {
      if (candidate.toNumber) {
        const parsed = candidate.toNumber();
        return Number.isFinite(parsed) ? parsed : null;
      }
      if (candidate.toString) {
        const parsed = Number(candidate.toString());
        return Number.isFinite(parsed) ? parsed : null;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function readUsd(stats: any, names: string[]): number | null {
  for (const name of names) {
    const value = toNumber(stats?.[name]);
    if (value !== null) return value;
  }
  return null;
}

export async function loadKaminoXStockObligations(connection: Connection, wallet: PublicKey, xStockMints: Set<string>): Promise<WggKaminoObligation[]> {
  const sdk = await loadKaminoSdk();
  if (!sdk.KaminoMarket) throw new Error('Kamino SDK did not expose KaminoMarket');

  const market = await sdk.KaminoMarket.load(connection, KAMINO_MAIN_MARKET);
  const currentSlot = BigInt(await connection.getSlot('confirmed'));
  const obligations = await market.getAllUserObligations(wallet, currentSlot);

  const results: WggKaminoObligation[] = [];
  for (const obligation of obligations ?? []) {
    if (!obligation) continue;

    const collaterals: WggCollateral[] = [];
    const deposits = obligation.deposits instanceof Map ? obligation.deposits : new Map();
    for (const [reserveAddress, deposit] of deposits.entries()) {
      const reserve = market.getReserve(reserveAddress);
      const mint = reserve?.getLiquidityMint?.()?.toBase58?.() ?? reserve?.liquidity?.mint?.toBase58?.() ?? reserve?.getMint?.()?.toBase58?.();
      if (!mint || !xStockMints.has(mint)) continue;

      const amount = toNumber((deposit as any)?.amount ?? (deposit as any)?.depositedAmount ?? (deposit as any)?.amountWads) ?? 0;
      collaterals.push({ mint, amount });
    }

    if (!collaterals.length) continue;

    const stats = (obligation as any).stats ?? {};
    results.push({
      address: obligation.address?.toBase58?.() ?? String(obligation.address ?? ''),
      borrowedValueUsd: readUsd(stats, ['borrowedValue', 'borrowedValueUsd', 'currentBorrowedValue']),
      depositedValueUsd: readUsd(stats, ['depositedValue', 'depositedValueUsd', 'totalCollateralValue']),
      healthFactor: readUsd(stats, ['healthFactor']),
      liquidationThresholdUsd: readUsd(stats, ['liquidationThreshold', 'liquidationThresholdUsd', 'liquidationValue']),
      collaterals,
    });
  }

  return results;
}
