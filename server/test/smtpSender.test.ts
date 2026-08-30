import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// SMTP channel selection helpers live in the smtp sender module.
import {
  resolveMailChannel,
  SMTP_ENV_KEYS,
} from '../src/services/smtpSender';

const ISOLATED_KEYS = [...SMTP_ENV_KEYS, 'RESEND_API_KEY'];

const withEnv = (values: Record<string, string | undefined>, run: () => void) => {
  const saved: Record<string, string | undefined> = {};
  for (const key of ISOLATED_KEYS) saved[key] = process.env[key];
  for (const key of ISOLATED_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const key of ISOLATED_KEYS) delete process.env[key];
    for (const [key, value] of Object.entries(saved)) {
      if (value !== undefined) process.env[key] = value;
    }
  }
};

test('smtp env keys are fully declared for test isolation', () => {
  assert.deepEqual([...SMTP_ENV_KEYS].sort(), [
    'SMTP_FROM',
    'SMTP_HOST',
    'SMTP_PASS',
    'SMTP_PORT',
    'SMTP_SECURE',
    'SMTP_USER',
  ]);
});

test('smtp channel activates only with host and user configured', () => {
  // This test file runs in local mode (no Supabase env), so incomplete
  // SMTP config falls through to the local-preview channel.
  withEnv({}, () => {
    assert.equal(resolveMailChannel(), 'local-preview');
  });
  withEnv({ SMTP_HOST: 'smtp.qq.com' }, () => {
    assert.equal(resolveMailChannel(), 'local-preview', 'user missing');
  });
  withEnv({ SMTP_USER: 'me@qq.com' }, () => {
    assert.equal(resolveMailChannel(), 'local-preview', 'host missing');
  });
  withEnv({ SMTP_HOST: 'smtp.qq.com', SMTP_USER: 'me@qq.com' }, () => {
    assert.equal(resolveMailChannel(), 'smtp');
  });
});

test('smtp defaults port 465 with secure true for qq mail', () => {
  withEnv({ SMTP_HOST: 'smtp.qq.com', SMTP_USER: 'me@qq.com' }, () => {
    const options = resolveMailChannel() === 'smtp' ? buildTransportOptionsForTest() : null;
    assert.ok(options);
    assert.equal(options.port, 465);
    assert.equal(options.secure, true);
    assert.equal(options.auth.user, 'me@qq.com');
  });
});

// buildTransportOptions exported separately (used by smtpSender internally);
// import lazily after other assertions to surface failure reason clearly.
import { buildTransportOptions } from '../src/services/smtpSender';
function buildTransportOptionsForTest() {
  return buildTransportOptions();
}

test('smtp explicit port and STARTTLS settings are honoured', () => {
  withEnv({
    SMTP_HOST: 'smtp.exmail.qq.com',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_USER: 'me@example.com',
  }, () => {
    const options = buildTransportOptions();
    assert.equal(options.port, 587);
    assert.equal(options.secure, false);
  });
});

test('from address falls back to the smtp login account', () => {
  withEnv({ SMTP_HOST: 'smtp.qq.com', SMTP_USER: 'me@qq.com' }, () => {
    assert.equal(resolveSmtpFromForTest(), 'me@qq.com');
  });
  withEnv({
    SMTP_HOST: 'smtp.qq.com',
    SMTP_USER: 'me@qq.com',
    SMTP_FROM: '日报系统 <me@qq.com>',
  }, () => {
    assert.equal(resolveSmtpFromForTest(), '日报系统 <me@qq.com>');
  });
});

import { resolveSmtpFrom } from '../src/services/smtpSender';
function resolveSmtpFromForTest(): string {
  return resolveSmtpFrom();
}

test('channel selection prefers resend, then smtp, then local file, then error', () => {
  process.env.SUPABASE_URL = '';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  withEnv({
    RESEND_API_KEY: 're_demo',
    SMTP_HOST: 'smtp.qq.com',
    SMTP_USER: 'me@qq.com',
  }, () => {
    assert.equal(resolveMailChannel(), 'resend', 'resend wins when both set');
  });
  withEnv({ SMTP_HOST: 'smtp.qq.com', SMTP_USER: 'me@qq.com' }, () => {
    assert.equal(resolveMailChannel(), 'smtp');
  });
  withEnv({}, () => {
    assert.equal(resolveMailChannel(), 'local-preview');
  });
  // production without any mail config errors when sending
  process.env.SUPABASE_URL = 'https://prod.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';
  withEnv({}, () => {
    assert.equal(resolveMailChannel(), 'none');
  });
  process.env.SUPABASE_URL = '';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
});

test('preview directory derives from the sqlite db path', () => {
  process.env.LOCAL_SQLITE_DB = join(
    mkdtempSync(join(tmpdir(), 'smtp-test-')),
    'local.sqlite3',
  );
  assert.match(
    previewDirForTest(),
    /local\.sqlite3\.mail$/,
  );
});

import { previewDir } from '../src/services/smtpSender';
function previewDirForTest(): string {
  return previewDir();
}