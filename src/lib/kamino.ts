import { address, createSolanaRpc } from '@solana/kit';
import { KaminoMarket, getCurrentLedgerInstant } from '@kamino-finance/klend-sdk';
import { STOCKS } from './assets';
import { resolveOfficialStocks } from './xstocks';

export const KAMINO_MAIN_MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF';

type GenericPosition = {
  reserveAddress?: unknown;
  amount?: unknown;
  scaledAmount?: unknown;
};

type GenericObligation = {
  obligationAddress?: unknown;
  obligationTag?: unknown;
  deposits?: GenericPosition[];
  borrows?: GenericPosition[];
  loanToValue?: () => { toNumber?: () => number };
  refreshedStats?: {
    userTotalDeposit?: { toNumber?: () => number };
    userTotalBorrow?: { toNumber?: () => number };
  };
};

export type KaminoXStockCollateral = {
  symbol: string;
  mint: string;
  reserve: string;
  amount: number;
};

export type KaminoDebtPosition = {
  mint: string;
  reserve: string;
  amount: number;
};

export type KaminoXStockPosition = {
  obligation: string;
  xStocks: KaminoXStockCollateral[];
  debts: KaminoDebtPosition[];
  ltvPct: number | null;
  depositValueUsd: number | null;
  borrowValueUsd: number | null;
};

function stringifyAddress(value: unknown) {
  return typeof value === 'string' ? value : String(value ?? '');
}

function decimalNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (value && typeof value === 'object' && 'toNumber' in value && typeof (value as { toNumber: unknown }).toNumber === 'function') {
    const number = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(number) ? number : null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positionAmount(position: GenericPosition) {
  return decimalNumber(position.amount ?? position.scaledAmount) ?? 0;
}

/**
 * Reads real Kamino Main Market obligations using the current Kamino SDK.
 * Only obligations containing a reserve whose liquidity mint matches an
 * official Solana xStock mint are returned.
 */
export async function discoverKaminoXStockPositions(wallet: string, rpcUrl: string): Promise<KaminoXStockPosition[]> {
  if (!wallet) return [];

  const officialAssets = await resolveOfficialStocks(STOCKS);
  const xStockByMint = new Map(
    officialAssets
      .filter((asset) => asset.mint)
      .map((asset) => [asset.mint as string, asset.symbol] as const),
  );

  const rpc = createSolanaRpc(rpcUrl);
  const market = await KaminoMarket.load(rpc as never, address(KAMINO_MAIN_MARKET));
  const ledgerInstant = await getCurrentLedgerInstant(rpc as never, 'confirmed');
  const rawObligations = await market.getAllUserObligations(address(wallet), ledgerInstant, 'confirmed');
  const obligations = rawObligations as unknown as GenericObligation[];

  const results: KaminoXStockPosition[] = [];

  for (const obligation of obligations) {
    const xStocks: KaminoXStockCollateral[] = [];
    const debts: KaminoDebtPosition[] = [];

    for (const deposit of obligation.deposits ?? []) {
      const reserveAddress = stringifyAddress(deposit.reserveAddress);
      if (!reserveAddress) continue;
      const reserve = market.getExistingReserveByAddress(address(reserveAddress));
      if (!reserve) continue;
      const mint = stringifyAddress(reserve.getLiquidityMint());
      const symbol = xStockByMint.get(mint);
      if (!symbol) continue;
      xStocks.push({ symbol, mint, reserve: reserveAddress, amount: positionAmount(deposit) });
    }

    if (!xStocks.length) continue;

    for (const borrow of obligation.borrows ?? []) {
      const reserveAddress = stringifyAddress(borrow.reserveAddress);
      if (!reserveAddress) continue;
      const reserve = market.getExistingReserveByAddress(address(reserveAddress));
      if (!reserve) continue;
      debts.push({
        mint: stringifyAddress(reserve.getLiquidityMint()),
        reserve: reserveAddress,
        amount: positionAmount(borrow),
      });
    }

    const ltv = obligation.loanToValue?.();
    const ltvNumber = ltv?.toNumber?.();
    const depositValue = obligation.refreshedStats?.userTotalDeposit?.toNumber?.();
    const borrowValue = obligation.refreshedStats?.userTotalBorrow?.toNumber?.();

    results.push({
      obligation: stringifyAddress(obligation.obligationAddress),
      xStocks,
      debts,
      ltvPct: typeof ltvNumber === 'number' && Number.isFinite(ltvNumber) ? ltvNumber * 100 : null,
      depositValueUsd: typeof depositValue === 'number' && Number.isFinite(depositValue) ? depositValue : null,
      borrowValueUsd: typeof borrowValue === 'number' && Number.isFinite(borrowValue) ? borrowValue : null,
    });
  }

  return results;
}
