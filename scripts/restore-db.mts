#!/usr/bin/env node
// 从备份目录恢复业务表：JSONL 整行回灌（保留原 id/时间戳），顺序 students → daily_reports → notification_runs
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [backupDir] = process.argv.slice(2);
if (!backupDir || !existsSync(backupDir)) { console.error(`备份目录不存在：${backupDir}`); process.exit(1); }

const envFile = readFileSync('/opt/data/private/Projects/student-simple-daily-report/.env', 'utf8');
const env = (key) => process.env[key] ?? envFile.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();
const SUPABASE_URL = env('SUPABASE_URL');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('缺 SUPABASE 凭据'); process.exit(1); }

const rest = async (path, init) => {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${await res.text()}`);
  return res;
};

const loadRows = (table) => {
  const file = join(backupDir, `${table}.json`);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
};

const clearTable = async (table: string) => {
  await rest(`/rest/v1/${table}?id=neq.00000000-0000-0000-0000-000000000000`, { method: 'DELETE' });
};

const upsertTable = async (table, rows) => {
  if (!rows.length) { console.log(`${table}: 备份为空，跳过`); return; }
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    await rest(`/rest/v1/${table}?on_conflict=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(chunk),
    });
    console.log(`${table}: 已回灌 ${Math.min(i + 500, rows.length)}/${rows.length} 行`);
  }
};

const main = async () => {
  // 外键顺序：先清子表（daily_reports 引用 students），再逐表回灌
  for (const table of ['daily_reports', 'notification_runs', 'students']) {
    await clearTable(table);
  }
  for (const table of ['students', 'daily_reports', 'notification_runs']) {
    await upsertTable(table, loadRows(table));
  }
  // 恢复后校验：行数与备份一致
  for (const table of ['students', 'daily_reports', 'notification_runs']) {
    const res = await rest(`/rest/v1/${table}?select=id&limit=1000`);
    const rows = await res.json() as unknown[];
    const expected = loadRows(table).length;
    console.log(`验证 ${table}: ${rows.length} 行（备份 ${expected}）${rows.length === expected ? '✓' : '✗ 不一致!'}`);
    if (rows.length !== expected) process.exit(1);
  }
  console.log('恢复完成并通过校验。');
};
main().catch((e) => { console.error(e); process.exit(1); });
