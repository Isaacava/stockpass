export type WeekendRiskInput = {
  currentBufferPct: number;
  typicalWeekendGapPct: number;
  earningsRisk?: boolean;
  earningsMultiplier?: number;
};

export type WeekendRiskResult = {
  adjustedGapPct: number;
  deficitPct: number;
  status: 'safe' | 'watch' | 'flagged';
};

/**
 * Pure first-pass risk rule. Market/oracle inputs are supplied by trusted
 * backend services; this module deliberately does not fetch prices itself.
 */
export function evaluateWeekendRisk(input: WeekendRiskInput): WeekendRiskResult {
  const earningsMultiplier = input.earningsRisk ? Math.max(1, input.earningsMultiplier ?? 1.25) : 1;
  const adjustedGapPct = Math.max(0, input.typicalWeekendGapPct) * earningsMultiplier;
  const deficitPct = Math.max(0, adjustedGapPct - Math.max(0, input.currentBufferPct));

  if (deficitPct > 0) return { adjustedGapPct, deficitPct, status: 'flagged' };
  if (input.currentBufferPct <= adjustedGapPct * 1.2) return { adjustedGapPct, deficitPct: 0, status: 'watch' };
  return { adjustedGapPct, deficitPct: 0, status: 'safe' };
}

export function calculateRepayUsd(debtUsd: number, currentBufferPct: number, targetBufferPct: number): number {
  if (!Number.isFinite(debtUsd) || debtUsd <= 0) return 0;
  if (!Number.isFinite(currentBufferPct) || !Number.isFinite(targetBufferPct) || targetBufferPct <= currentBufferPct) return 0;
  const reductionRatio = Math.min(0.99, (targetBufferPct - currentBufferPct) / Math.max(targetBufferPct, 0.000001));
  return Math.max(0, debtUsd * reductionRatio);
}
