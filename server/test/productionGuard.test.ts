import assert from 'node:assert/strict';
import * as nodeTest from 'node:test';

const { test } = nodeTest;

// 在指定 env 生效窗口内调用回调；护栏函数懒读取 process.env，单实例即可。
const withEnv = async (
  env: Record<string, string | undefined>,
  run: (mod: typeof import('../src/local/bootstrap')) => void | Promise<void>,
) => {
  const saved = { ...process.env };
  try {
    for (const key of Object.keys(env)) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
    const mod = await import('../src/local/bootstrap');
    await run(mod);
  } finally {
    process.env = saved;
  }
};

test('production runtime without supabase config fails fast', async () => {
  await withEnv({
    NETLIFY: 'true',
    SUPABASE_URL: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
  }, (mod) => {
    assert.throws(
      () => mod.assertProductionSupabaseConfig(),
      /SUPABASE_URL \/ SUPABASE_SERVICE_ROLE_KEY/s,
    );
  });
});

test('local runtime without supabase config stays in local mode', async () => {
  await withEnv({
    NETLIFY: undefined,
    AWS_LAMBDA_FUNCTION_NAME: undefined,
    CONTEXT: undefined,
    SUPABASE_URL: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
  }, (mod) => {
    assert.equal(mod.isLocalMode(), true);
    assert.doesNotThrow(() => mod.assertProductionSupabaseConfig());
  });
});

test('production runtime with supabase config passes the guard', async () => {
  await withEnv({
    NETLIFY: 'true',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  }, (mod) => {
    assert.doesNotThrow(() => mod.assertProductionSupabaseConfig());
    assert.equal(mod.isLocalMode(), false);
  });
});
