import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { route } from '../src/router';

// The local-mode admin session route only exists without Supabase credentials.
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';

type Operation = { method: string; path: string };

const openApiOperations = (): Operation[] => {
  const source = readFileSync('docs/openapi.yaml', 'utf8');
  const operations: Operation[] = [];
  let currentPath = '';
  for (const line of source.split(/\r?\n/)) {
    const pathMatch = line.match(/^  (\/[^:]+):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }
    const methodMatch = line.match(/^    (get|post|put|patch|delete):\s*$/);
    if (currentPath && methodMatch) {
      operations.push({ method: methodMatch[1].toUpperCase(), path: currentPath });
    }
  }
  return operations;
};

const concretePath = (path: string) => path
  .replace('{student_id}', '00000000-0000-4000-8000-000000000001')
  .replace('{recipient_id}', '00000000-0000-4000-8000-000000000002')
  .replace('{report_date}', '2026-07-23');

test('every documented OpenAPI operation is recognized by the router', async () => {
  const operations = openApiOperations();
  assert.equal(operations.length, 26);

  for (const operation of operations) {
    const response = await route(new Request(
      `http://localhost/api/v1${concretePath(operation.path)}`,
      {
        method: operation.method,
        headers: operation.method === 'GET' || operation.method === 'DELETE'
          ? undefined
          : { 'Content-Type': 'application/json' },
        body: operation.method === 'GET' || operation.method === 'DELETE'
          ? undefined
          : JSON.stringify({}),
      },
    ));
    if (response.status === 404) {
      const body = await response.json() as { error?: { code?: string } };
      assert.notEqual(
        body.error?.code,
        'RESOURCE_NOT_FOUND',
        `${operation.method} ${operation.path} is not routed`,
      );
    }
  }
});

test('every local OpenAPI reference resolves to a declared component', () => {
  const source = readFileSync('docs/openapi.yaml', 'utf8');
  const refs = [...source.matchAll(/\$ref:\s*['"]?#\/components\/([^'"\s]+)['"]?/g)]
    .map((match) => match[1]);
  assert.ok(refs.length > 0);
  for (const ref of refs) {
    const [section, name] = ref.split('/');
    const sectionPattern = new RegExp(`^  ${section}:\\s*$`, 'm');
    const namePattern = new RegExp(`^    ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*$`, 'm');
    assert.match(source, sectionPattern, `missing component section ${section}`);
    assert.match(source, namePattern, `missing component ${ref}`);
  }
});
