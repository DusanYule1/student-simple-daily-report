import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '../src/errors';
import { positiveIntegerParam } from '../src/http';

test('positiveIntegerParam applies defaults and accepted values', () => {
  assert.equal(positiveIntegerParam(new URLSearchParams(), 'page', 1, 100), 1);
  assert.equal(positiveIntegerParam(new URLSearchParams('page=25'), 'page', 1, 100), 25);
});

test('positiveIntegerParam rejects malformed and out-of-range input', () => {
  for (const raw of ['0', '-1', '1.5', 'abc', '101']) {
    assert.throws(
      () => positiveIntegerParam(new URLSearchParams(`page=${raw}`), 'page', 1, 100),
      (error) => error instanceof ApiError && error.code === 'VALIDATION_ERROR',
    );
  }
});
