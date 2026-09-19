export type WeekendRiskInput = {
  currentLtvPct: number;
  liquidationLtvPct: number;
  typicalWeekendGapPct: number;
  earningsRisk?: boolean;
  earningsMultiplier?: number;
};

export type WeekendRiskResult = {
  adjustedGapPct: number;
  stressedLtvPct: number;
  liquidationDistancePct: number;
  deficitPct: number;
  status: 'safe' | 'watch' | 'flagged';
};

/**
 * Weekend stress test for an xStock-backed Kamino obligation.
 *
 * The historical downside gap is a collateral-price shock, so WGG first
 * stresses the position's LTV rather than comparing unlike units
 * (price-percent vs LTV percentage points).
 *
 * stressed LTV = current LTV / (1 - downside gap)
 */
export function evaluateWeekendRisk(input: WeekendRiskInput): WeekendRiskResult {
  const earningsMultiplier = input.earningsRisk ? Math.max(1, input.earningsMultiplier ?? 1.25) : 1;
  const adjustedGapPct = Math.max(0, input.typicalWeekendGapPct) * earningsMultiplier;
  const currentLtvPct = Math.max(0, input.currentLtvPct);
  const liquidationLtvPct = Math.max(0, input.liquidationLtvPct);

  // A gap at/above 100% is not a usable linear price scenario; cap the
  // denominator so the UI fails toward a clearly stressed state.
  const remainingCollateralFactor = Math.max(0.01, 1 - adjustedGapPct / 100);
  const stressedLtvPct = currentLtvPct / remainingCollateralFactor;
  const liquidationDistancePct = Math.max(0, liquidationLtvPct - stressedLtvPct);
  const deficitPct = Math.max(0, stressedLtvPct - liquidationLtvPct);

  if (deficitPct > 0) {
    return { adjustedGapPct, stressedLtvPct, liquidationDistancePct, deficitPct, status: 'flagged' };
  }

  // Keep a visible watch band when the stressed scenario leaves only a small
  // amount of liquidation distance.
  const watchDistance = Math.max(1.5, liquidationLtvPct * 0.02);
  if (liquidationDistancePct <= watchDistance) {
    return { adjustedGapPct, stressedLtvPct, liquidationDistancePct, deficitPct: 0, status: 'watch' };
  }

  return { adjustedGapPct, stressedLtvPct, liquidationDistancePct, deficitPct: 0, status: 'safe' };
}

export function calculateRepayUsdForTargetLtv(
  debtUsd: number,
  collateralUsd: number,
  targetLtvPct: number,
): number {
  if (!Number.isFinite(debtUsd) || debtUsd <= 0) return 0;
  if (!Number.isFinite(collateralUsd) || collateralUsd <= 0) return 0;
  if (!Number.isFinite(targetLtvPct) || targetLtvPct <= 0 || targetLtvPct >= 100) return 0;
  const targetDebtUsd = collateralUsd * (targetLtvPct / 100);
  return Math.max(0, debtUsd - targetDebtUsd);
}

export function calculateCollateralUsdForTargetLtv(
  debtUsd: number,
  collateralUsd: number,
  targetLtvPct: number,
): number {
  if (!Number.isFinite(debtUsd) || debtUsd <= 0) return 0;
  if (!Number.isFinite(collateralUsd) || collateralUsd < 0) return 0;
  if (!Number.isFinite(targetLtvPct) || targetLtvPct <= 0 || targetLtvPct >= 100) return 0;
  const requiredCollateralUsd = debtUsd / (targetLtvPct / 100);
  return Math.max(0, requiredCollateralUsd - collateralUsd);
}

export function calculateRepayUsd(debtUsd: number, currentBufferPct: number, targetBufferPct: number): number {
  if (!Number.isFinite(debtUsd) || debtUsd <= 0) return 0;
  if (!Number.isFinite(currentBufferPct) || !Number.isFinite(targetBufferPct) || targetBufferPct <= currentBufferPct) return 0;
  const reductionRatio = Math.min(0.99, (targetBufferPct - currentBufferPct) / Math.max(targetBufferPct, 0.000001));
  return Math.max(0, debtUsd * reductionRatio);
}
