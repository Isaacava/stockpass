import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeekendGapSummary } from '../src/lib/wggGap.ts';

function businessDates(start: string, end: string, skip: Set<string> = new Set()) {
  const rows: Array<{ date: string; open: number; close: number }> = [];
  const cursor = new Date(start + 'T00:00:00Z');
  const limit = new Date(end + 'T00:00:00Z');
  let index = 0;

  while (cursor <= limit) {
    const day = cursor.getUTCDay();
    const date = cursor.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && !skip.has(date)) {
      const base = 100 + index;
      rows.push({ date, open: base, close: base });
      index += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return rows;
}

test('gap model uses actual session closures, including holiday-style Thursday to Monday gaps', () => {
  const holidaySkip = new Set(['2026-02-13']);
  const rows = businessDates('2026-01-05', '2026-03-02', holidaySkip);

  const friday = rows.find((row) => row.date === '2026-02-06');
  const holidayThursday = rows.find((row) => row.date === '2026-02-12');
  const monday = rows.find((row) => row.date === '2026-02-16');

  assert.ok(friday);
  assert.ok(holidayThursday);
  assert.ok(monday);

  friday!.close = 110;
  monday!.open = 95;
  holidayThursday!.close = 120;

  const summary = buildWeekendGapSummary(
    'AAPL',
    rows,
    10,
    new Date('2026-03-01T00:00:00Z'),
  );

  assert.ok(summary);
  assert.ok(summary.sampleCount >= 8);
  assert.equal(
    summary.observations.some(
      (item) => item.sessionDate === '2026-02-12' && item.nextSessionDate === '2026-02-16' && item.calendarGapDays === 4,
    ),
    true,
  );
  assert.equal(summary.p90DownsideGapPct !== null, true);
  assert.equal(summary.maxDownsideGapPct !== null, true);
});
