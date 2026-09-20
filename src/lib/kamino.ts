import { SERVER_STOCKS } from './serverAssets.js';
import { COMPUTE_BUDGET_PROGRAM_ADDRESS } from '@solana-program/compute-budget';
import { resolveOfficialStocks } from './xstocks.js';

export const KAMINO_MAIN_MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF';

// Explicitly retain the Kamino runtime dependency in the serverless bundle.
const KAMINO_COMPUTE_BUDGET_PROGRAM = COMPUTE_BUDGET_PROGRAM_ADDRESS;

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

type ReserveRiskConfig = {
  liquidationThreshold?: unknown;
  loanToValue?: unknown;
};

export type KaminoXStockCollateral = {
  symbol: string;
  mint: string;
  reserve: string;
  amount: number;
  mintDecimals: number;
  liquidationLtvPct: number | null;
};

export type KaminoDebtPosition = {
  mint: string;
  reserve: string;
  amount: number;
  mintDecimals: number;
};

export type KaminoXStockPosition = {
  obligation: string;
  xStocks: KaminoXStockCollateral[];
  debts: KaminoDebtPosition[];
  ltvPct: number | null;
  liquidationLtvPct: number | null;
  liquidationBufferPct: number | null;
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

function reserveLiquidationLtvPct(reserve: unknown) {
  const stats = (reserve as { stats?: ReserveRiskConfig } | null)?.stats;
  const candidate = decimalNumber(stats?.liquidationThreshold);
  if (candidate !== null && candidate > 0) return candidate <= 1 ? candidate * 100 : candidate;
  return null;
}

/**
 * Reads real Kamino Main Market obligations using the current Kamino SDK.
 * Only obligations containing a reserve whose liquidity mint matches an
 * official Solana xStock mint are returned.
 *
 * liquidationBufferPct is intentionally conservative: it uses the lowest
 * liquidation threshold among the xStock collateral reserves in the
 * obligation minus Kamino's account LTV. This is a protection signal, not a
 * replacement for Kamino's own liquidation engine.
 */
export async function discoverKaminoXStockPositions(wallet: string, rpcUrl: string): Promise<KaminoXStockPosition[]> {
  if (!wallet) return [];
  if (!KAMINO_COMPUTE_BUDGET_PROGRAM) throw new Error('Kamino Compute Budget dependency is unavailable.');

  const { address, createSolanaRpc } = await import('@solana/kit');
  const {
    KaminoMarket,
    getCurrentLedgerInstant,
    getMedianSlotDurationInMsFromLastEpochs,
  } = await import('@kamino-finance/klend-sdk');

  const officialAssets = await resolveOfficialStocks(SERVER_STOCKS);
  const xStockByMint = new Map(
    officialAssets
      .filter((asset) => asset.mint)
      .map((asset) => [asset.mint as string, asset.symbol] as const),
  );

  const rpc = createSolanaRpc(rpcUrl);
  const recentSlotDurationMs = await getMedianSlotDurationInMsFromLastEpochs();
  const market = await KaminoMarket.load(rpc as never, address(KAMINO_MAIN_MARKET), recentSlotDurationMs);
  if (!market) throw new Error('Kamino Main Market could not be loaded.');

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
      const mintDecimals = decimalNumber(reserve.getMintDecimals()) ?? 0;
      xStocks.push({ symbol, mint, reserve: reserveAddress, amount: positionAmount(deposit), mintDecimals, liquidationLtvPct: reserveLiquidationLtvPct(reserve) });
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
        mintDecimals: decimalNumber(reserve.getMintDecimals()) ?? 0,
      });
    }

    const ltv = obligation.loanToValue?.();
    const ltvNumber = ltv?.toNumber?.();
    const currentLtvPct = typeof ltvNumber === 'number' && Number.isFinite(ltvNumber) ? ltvNumber * 100 : null;
    const liquidationLtvs = xStocks.map((stock) => stock.liquidationLtvPct).filter((value): value is number => value !== null);
    const liquidationLtvPct = liquidationLtvs.length ? Math.min(...liquidationLtvs) : null;
    const liquidationBufferPct = currentLtvPct !== null && liquidationLtvPct !== null ? Math.max(0, liquidationLtvPct - currentLtvPct) : null;
    const depositValue = obligation.refreshedStats?.userTotalDeposit?.toNumber?.();
    const borrowValue = obligation.refreshedStats?.userTotalBorrow?.toNumber?.();

    results.push({
      obligation: stringifyAddress(obligation.obligationAddress),
      xStocks,
      debts,
      ltvPct: currentLtvPct,
      liquidationLtvPct,
      liquidationBufferPct,
      depositValueUsd: typeof depositValue === 'number' && Number.isFinite(depositValue) ? depositValue : null,
      borrowValueUsd: typeof borrowValue === 'number' && Number.isFinite(borrowValue) ? borrowValue : null,
    });
  }

  return results;
}
