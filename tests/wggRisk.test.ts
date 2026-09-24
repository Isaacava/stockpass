import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWeekendRisk, selectWeekendGapPct } from '../src/lib/wggRisk.ts';

test('P75, P90 and max profiles select the intended downside scenario', () => {
  const gap = {
    typicalWeekendGapPct: 3,
    p90DownsideGapPct: 7,
    maxDownsideGapPct: 12,
  };
  assert.equal(selectWeekendGapPct(gap, 'p75'), 3);
  assert.equal(selectWeekendGapPct(gap, 'p90'), 7);
  assert.equal(selectWeekendGapPct(gap, 'max'), 12);
});

test('risk engine keeps safe/watch/flagged behavior deterministic', () => {
  const safe = evaluateWeekendRisk({ currentLtvPct: 50, liquidationLtvPct: 70, typicalWeekendGapPct: 5 }, 'p75');
  const watch = evaluateWeekendRisk({ currentLtvPct: 65.5, liquidationLtvPct: 70, typicalWeekendGapPct: 5 }, 'p75');
  const flagged = evaluateWeekendRisk({ currentLtvPct: 70, liquidationLtvPct: 70, typicalWeekendGapPct: 5 }, 'p75');

  assert.equal(safe.status, 'safe');
  assert.equal(watch.status, 'watch');
  assert.equal(flagged.status, 'flagged');
});

test('earnings overlay only scales the selected downside shock', () => {
  const normal = evaluateWeekendRisk({ currentLtvPct: 60, liquidationLtvPct: 75, typicalWeekendGapPct: 5 }, 'p90');
  const earnings = evaluateWeekendRisk({
    currentLtvPct: 60,
    liquidationLtvPct: 75,
    typicalWeekendGapPct: 5,
    earningsRisk: true,
    earningsMultiplier: 1.25,
  }, 'p90');

  assert.equal(normal.adjustedGapPct, 5);
  assert.equal(earnings.adjustedGapPct, 6.25);
  assert.equal(earnings.profile, 'p90');
});
