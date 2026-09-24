export type WeekendRiskProfile = 'p75' | 'p90' | 'max';

export type WeekendRiskInput = {
  currentLtvPct: number;
  liquidationLtvPct: number;
  typicalWeekendGapPct: number;
  earningsRisk?: boolean;
  earningsMultiplier?: number;
};

export type WeekendRiskResult = {
  profile: WeekendRiskProfile;
  adjustedGapPct: number;
  stressedLtvPct: number;
  liquidationDistancePct: number;
  deficitPct: number;
  status: 'safe' | 'watch' | 'flagged';
};

export type WeekendGapScenario = {
  typicalWeekendGapPct?: number | null;
  p90GapPct?: number | null;
  maxDownsideGapPct?: number | null;
};

export function selectWeekendGapPct(
  gap: WeekendGapScenario,
  profile: WeekendRiskProfile = 'p75',
): number | null {
  if (profile === 'max') return gap.maxDownsideGapPct ?? null;
  if (profile === 'p90') return gap.p90GapPct == null ? (gap.typicalWeekendGapPct ?? null) : Math.max(0, -gap.p90GapPct);
  return gap.typicalWeekendGapPct ?? null;
}

/**
 * Weekend stress test for an xStock-backed Kamino obligation.
 *
 * The historical downside gap is a collateral-price shock, so WGG first
 * stresses the position's LTV rather than comparing unlike units.
 */
export function evaluateWeekendRisk(input: WeekendRiskInput, profile: WeekendRiskProfile = 'p75'): WeekendRiskResult {
  const earningsMultiplier = input.earningsRisk ? Math.max(1, input.earningsMultiplier ?? 1.25) : 1;
  const adjustedGapPct = Math.max(0, input.typicalWeekendGapPct) * earningsMultiplier;
  const currentLtvPct = Math.max(0, input.currentLtvPct);
  const liquidationLtvPct = Math.max(0, input.liquidationLtvPct);

  const remainingCollateralFactor = Math.max(0.01, 1 - adjustedGapPct / 100);
  const stressedLtvPct = currentLtvPct / remainingCollateralFactor;
  const liquidationDistancePct = Math.max(0, liquidationLtvPct - stressedLtvPct);
  const deficitPct = Math.max(0, stressedLtvPct - liquidationLtvPct);

  if (deficitPct > 0) {
    return { profile, adjustedGapPct, stressedLtvPct, liquidationDistancePct, deficitPct, status: 'flagged' };
  }

  const watchDistance = Math.max(1.5, liquidationLtvPct * 0.02);
  if (liquidationDistancePct <= watchDistance) {
    return { profile, adjustedGapPct, stressedLtvPct, liquidationDistancePct, deficitPct: 0, status: 'watch' };
  }

  return { profile, adjustedGapPct, stressedLtvPct, liquidationDistancePct, deficitPct: 0, status: 'safe' };
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
