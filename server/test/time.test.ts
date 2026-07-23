import assert from 'node:assert/strict';
import test from 'node:test';
import { businessDate, datesInMonth, monthBounds } from '../src/time';

test('business date uses the previous day before 03:00 in Shanghai', () => {
  assert.equal(
    businessDate(new Date('2026-07-22T18:59:59Z')),
    '2026-07-22',
  );
  assert.equal(
    businessDate(new Date('2026-07-22T19:00:00Z')),
    '2026-07-23',
  );
});

test('month bounds use a left-closed and right-open interval', () => {
  assert.deepEqual(monthBounds('2026-07'), {
    start: '2026-07-01',
    next: '2026-08-01',
    days: 31,
  });
  assert.equal(datesInMonth('2026-02').length, 28);
  assert.equal(datesInMonth('2028-02').length, 29);
});

