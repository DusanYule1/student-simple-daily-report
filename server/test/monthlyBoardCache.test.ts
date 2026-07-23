import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearMonthlyBoardCache,
  getCachedMonthlyBoard,
  monthlyBoardCacheKey,
  setCachedMonthlyBoard,
} from '../src/services/monthlyBoardCache';

test('monthly board cache normalizes keys and returns stored values', () => {
  clearMonthlyBoardCache();
  const key = monthlyBoardCacheKey('2026-07', ' Alice ');
  assert.equal(key, '2026-07:alice');

  const value = { students: [{ id: 'student-1' }] };
  setCachedMonthlyBoard(key, value);
  assert.deepEqual(getCachedMonthlyBoard(key), value);
});

test('monthly board cache can be invalidated after report writes', () => {
  const key = monthlyBoardCacheKey('2026-07', null);
  setCachedMonthlyBoard(key, { students: [] });
  clearMonthlyBoardCache();
  assert.equal(getCachedMonthlyBoard(key), null);
});
