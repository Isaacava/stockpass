import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeekendGapSummary } from '../src/lib/wggGap.ts';

function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value;
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

test('gap model uses actual session closures, including holiday-style Thursday to Monday gaps', () => {
  const rows: Array<{ date: string; open: number; close: number }> = [];
  let cursor = new Date('2026-01-02T00:00:00Z');

  for (let week = 0; week < 9; week += 1) {
    const friday = addDays(cursor, week * 7);
    const monday = addDays(friday, 3);
    rows.push({ date: iso(friday), open: 100 + week, close: 100 + week });
    rows.push({ date: iso(monday), open: 95 - week * 0.5, close: 99 });
  }

  rows.push({ date: '2026-02-12', open: 105, close: 105 });
  rows.push({ date: '2026-02-16', open: 95, close: 99 });

  const summary = buildWeekendGapSummary('AAPL', rows, 10, new Date('2026-03-01T00:00:00Z'));

  assert.ok(summary);
  assert.ok(summary.sampleCount >= 8);
  assert.equal(summary.observations.some((item) => item.fridayDate === null && item.calendarGapDays === 4), true);
  assert.equal(summary.p90DownsideGapPct !== null, true);
  assert.equal(summary.maxDownsideGapPct !== null, true);
});
