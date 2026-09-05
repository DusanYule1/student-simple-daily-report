#!/usr/bin/env node
// 生产库备份：通过 PostgREST 导出全部业务表为 JSON（保真可回灌）+ CSV（Excel 查看），
// 并通过 Supabase Admin API 导出 auth 用户信息。输出目录 backups/<时间戳>/。
// 用法：npx tsx scripts/backup-db.mts [--delete-after] [--tables students,daily_reports,...]
//   --delete-after  导出并校验通过后清空业务表（顺序：daily_reports → notification_runs → students）
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');

const readEnv = (key: string): string => {
  const envFile = existsSync(join(root, '.env'))
    ? readFileSync(join(root, '.env'), 'utf8')
    : '';
  const match = envFile.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return process.env[key] ?? (match ? match[1].trim() : '');
};

const SUPABASE_URL = readEnv('SUPABASE_URL');
const SERVICE_KEY = readEnv('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY（.env 或环境变量）');
  process.exit(1);
}

const DELETE_AFTER = process.argv.includes('--delete-after');
const TABLES = [
  'students',
  'daily_reports',
  'notification_runs',
  'notification_recipients',
  'admin_profiles',
];

const rest = async (path: string, init?: RequestInit) => {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${await res.text()}`);
  return res;
};

const csvEscape = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const toJsonl = (rows: Record<string, unknown>[]) =>
  rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');

const toCsv = (rows: Record<string, unknown>[]): string => {
  if (!rows.length) return '';
  const columns = Object.keys(rows[0]);
  const lines = rows.map((row) => columns.map((c) => csvEscape(row[c])).join(','));
  return `${columns.join(',')}\n${lines.join('\n')}\n`;
};

const fetchAll = async (table: string): Promise<Record<string, unknown>[]> => {
  const rows: Record<string, unknown>[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const res = await rest(`/rest/v1/${table}?select=*&order=id&limit=${pageSize}&offset=${offset}`);
    const chunk = (await res.json()) as Record<string, unknown>[];
    rows.push(...chunk);
    if (chunk.length < pageSize) return rows;
  }
};

const main = async () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = join(root, 'backups', stamp);
  mkdirSync(dir, { recursive: true });
  const manifest: Record<string, unknown> = { created_at: new Date().toISOString(), tables: {} };

  for (const table of TABLES) {
    const rows = await fetchAll(table);
    writeFileSync(join(dir, `${table}.json`), toJsonl(rows), 'utf8');
    if (rows.length) writeFileSync(join(dir, `${table}.csv`), '\uFEFF' + toCsv(rows), 'utf8');
    manifest.tables[table] = rows.length;
    console.log(`${table}: ${rows.length} 行`);
  }

  // auth 用户（管理员账号）导出
  try {
    const res = await rest('/auth/v1/admin/users?per_page=100');
    const body = (await res.json()) as { users?: unknown[] };
    const users = body.users ?? [];
    writeFileSync(join(dir, 'auth_users.json'), JSON.stringify(users, null, 2), 'utf8');
    manifest.auth_users = users.length;
    console.log(`auth_users: ${users.length} 人`);
  } catch (error) {
    console.warn(`auth 用户导出失败（不影响业务表备份）：${error}`);
  }

  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  // 校验：每个 json 文件存在、可解析、行数与导出时一致
  let failures = 0;
  for (const [table, expected] of Object.entries(manifest.tables) as [string, number][]) {
    const file = join(dir, `${table}.json`);
    // 空表（0 行）合法：文件存在且内容为空即通过
    if (expected === 0) continue;
    if (!existsSync(file) || statSync(file).size === 0) {
      console.error(`校验失败：${table}.json 缺失或为空`); failures += 1; continue;
    }
    const parsed = readFileSync(file, 'utf8').split('\n').filter(Boolean);
    if (parsed.length !== expected) {
      console.error(`校验失败：${table}.json 行数 ${parsed.length} ≠ ${expected}`); failures += 1;
    }
  }
  if (failures > 0) {
    console.error(`备份校验未通过（${failures} 项），中止后续操作。`);
    process.exit(1);
  }
  console.log(`备份完成并通过校验：${dir}`);

  if (!DELETE_AFTER) return;

  // 清空业务表：外键顺序 daily_reports → notification_runs → students
  for (const table of ['daily_reports', 'notification_runs', 'students']) {
    await rest(`/rest/v1/${table}?id=neq.00000000-0000-0000-0000-000000000000`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    });
    console.log(`已清空 ${table}`);
  }
  for (const table of ['students', 'daily_reports', 'notification_runs']) {
    const rows = await fetchAll(table);
    console.log(`验证 ${table}: ${rows.length} 行（应为 0）`);
    if (rows.length > 0) { console.error(`清空失败：${table} 仍有数据`); process.exit(1); }
  }
  console.log('全部业务表已清空并验证。');
};

main().catch((error) => { console.error(error); process.exit(1); });