import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, verifyPassword } from '../src/security/password';
import { hashSessionToken } from '../src/security/session';

test('password hashes are salted and can be verified', async () => {
  const first = await hashPassword('correct-horse-battery-staple');
  const second = await hashPassword('correct-horse-battery-staple');
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('correct-horse-battery-staple', first), true);
  assert.equal(await verifyPassword('wrong-password', first), false);
});

test('malformed password hashes are rejected', async () => {
  assert.equal(await verifyPassword('anything', 'not-a-valid-hash'), false);
});

test('session token hashing is deterministic and does not expose the token', () => {
  const token = 'opaque-session-token';
  const hash = hashSessionToken(token);
  assert.equal(hash, hashSessionToken(token));
  assert.notEqual(hash, token);
  assert.match(hash, /^[a-f0-9]{64}$/);
});
