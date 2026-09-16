export type EarningsEvent = {
  symbol: string;
  reportDate: string;
  timing: 'before_open' | 'after_close' | 'unspecified';
  source: string;
  sourceUrl?: string;
};

export type EarningsRisk = {
  upcoming: boolean;
  event: EarningsEvent | null;
  daysAway: number | null;
};

/**
 * Pure earnings-risk classifier. The calendar event must come from a trusted
 * server-side adapter; this module never guesses an earnings date.
 */
export function evaluateEarningsRisk(symbol: string, event: EarningsEvent | null, now = new Date()): EarningsRisk {
  if (!event) return { upcoming: false, event: null, daysAway: null };

  const report = new Date(`${event.reportDate}T00:00:00Z`);
  if (!Number.isFinite(report.getTime())) return { upcoming: false, event: null, daysAway: null };

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysAway = Math.round((report.getTime() - start.getTime()) / 86_400_000);
  const normalized = { ...event, symbol: symbol.trim().toUpperCase() };

  // WGG treats an earnings event as a near-term risk overlay only when the
  // report is today through the next five calendar days. It does not forecast
  // an earnings date that is absent from the trusted calendar.
  return {
    upcoming: daysAway >= 0 && daysAway <= 5,
    event: normalized,
    daysAway,
  };
}

export function earningsMultiplier(risk: EarningsRisk, multiplier = 1.25): number {
  return risk.upcoming ? Math.max(1, multiplier) : 1;
}
