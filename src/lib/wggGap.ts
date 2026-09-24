export type DailyOHLC = {
  date: string;
  open: number;
  close: number;
};

export type WeekendGapObservation = {
  sessionDate: string;
  nextSessionDate: string;
  calendarGapDays: number;
  fridayDate: string | null;
  fridayClose: number;
  nextOpen: number;
  gapPct: number;
  downsideGapPct: number;
};

export type WeekendGapSummary = {
  provider: 'Twelve Data';
  underlyingSymbol: string;
  sampleCount: number;
  medianGapPct: number | null;
  p75GapPct: number | null;
  p90GapPct: number | null;
  p90DownsideGapPct: number | null;
  maxDownsideGapPct: number | null;
  typicalWeekendGapPct: number | null;
  windowStart: string | null;
  windowEnd: string | null;
  methodology: string;
  observations: WeekendGapObservation[];
};

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function calendarDaysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86_400_000);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function buildWeekendGapSummary(
  underlyingSymbol: string,
  values: DailyOHLC[],
  weeks = 13,
  now = new Date(),
): WeekendGapSummary | null {
  const sorted = [...values]
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value.date) && value.open > 0 && value.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length < 2) return null;

  const earliestDate = addDays(now, -(weeks + 12) * 7);
  const observations: WeekendGapObservation[] = [];

  for (let index = 0; index < sorted.length - 1 && observations.length < weeks; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    if (Date.parse(current.date + 'T00:00:00Z') < earliestDate.getTime()) continue;

    const calendarGapDays = calendarDaysBetween(current.date, next.date);
    if (calendarGapDays < 3) continue;

    const gapPct = ((next.open - current.close) / current.close) * 100;
    observations.push({
      sessionDate: current.date,
      nextSessionDate: next.date,
      calendarGapDays,
      fridayDate: new Date(current.date + 'T00:00:00Z').getUTCDay() === 5 ? current.date : null,
      fridayClose: current.close,
      nextOpen: next.open,
      gapPct,
      downsideGapPct: Math.max(0, -gapPct),
    });
  }

  if (observations.length < Math.max(8, Math.floor(weeks * 0.6))) return null;

  const gapSeries = observations.map((item) => item.gapPct);
  const downsideSeries = observations.map((item) => item.downsideGapPct);

  return {
    provider: 'Twelve Data',
    underlyingSymbol,
    sampleCount: observations.length,
    medianGapPct: percentile(gapSeries, 0.5),
    p75GapPct: percentile(gapSeries, 0.75),
    p90GapPct: percentile(gapSeries, 0.9),
    p90DownsideGapPct: percentile(downsideSeries, 0.9),
    maxDownsideGapPct: Math.max(...downsideSeries),
    typicalWeekendGapPct: percentile(downsideSeries, 0.75),
    windowStart: observations[0]?.sessionDate ?? null,
    windowEnd: observations[observations.length - 1]?.nextSessionDate ?? null,
    methodology:
      'Last observed US equity session to the next available session when the calendar gap is at least three days. This captures normal weekends and holiday closures. Downside gap is max(0, close-to-next-open return). Typical is P75 downside; conservative is P90 downside; extreme is the maximum observed downside.',
    observations,
  };
}
