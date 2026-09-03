import assert from 'node:assert/strict';
import * as nodeTest from 'node:test';
import { daysSinceLastSubmission } from '../src/services/dailyMail';

const { test } = nodeTest;

const day = (offsetFromToday: number): string => {
  const date = new Date(`${'2026-09-10'}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetFromToday);
  return date.toISOString().slice(0, 10);
};

test('gap counts days between report date and the latest submission', () => {
  // 今天 9/10，最近提交 9/6 → 空 4 天
  assert.equal(
    daysSinceLastSubmission(
      ['2026-09-01', '2026-09-06', '2026-09-03'],
      '2026-09-10',
    ),
    4,
  );
});

test('submitted yesterday counts as a one-day gap', () => {
  assert.equal(daysSinceLastSubmission(['2026-09-09'], '2026-09-10'), 1);
});

test('a report on the report date itself means no gap entry', () => {
  assert.equal(daysSinceLastSubmission(['2026-09-10'], '2026-09-10'), null);
});

test('no submissions inside the lookup window returns null', () => {
  assert.equal(daysSinceLastSubmission([], '2026-09-10'), null);
  // 提交在窗口起点之前视为从未提交
  assert.equal(daysSinceLastSubmission(['2026-05-01'], '2026-09-10'), null);
});

test('gaps across month boundaries are natural days', () => {
  assert.equal(daysSinceLastSubmission(['2026-08-30'], '2026-09-02'), 3);
});