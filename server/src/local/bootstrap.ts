import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  hashToken,
  LocalSupabaseClient,
  newId,
  newToken,
  verifyLocalAdminToken,
  type LocalAdminPrincipal,
} from './supabaseShim';
import { hashPassword } from '../security/password';

const DEFAULT_DB_FILE = 'instance/local-preview.sqlite3';

export const LOCAL_ADMIN_EMAIL = 'admin@example.com';
export const LOCAL_ADMIN_NAME = '系统管理员';
export const DEFAULT_LOCAL_ADMIN_PASSWORD = 'local-admin-123';

let cached: DatabaseSync | undefined;

export const localDbPath = (): string =>
  process.env.LOCAL_SQLITE_DB || DEFAULT_DB_FILE;

export const isLocalMode = (): boolean =>
  !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;

// Netlify/Azure 等托管运行环境标识：命中其一即视为生产部署。
const PROD_RUNTIME_ENV_KEYS = [
  'NETLIFY',
  'AWS_LAMBDA_FUNCTION_NAME',
  'NETLIFY_DEV',
  'CONTEXT',
] as const;

const isManagedRuntime = (): boolean =>
  PROD_RUNTIME_ENV_KEYS.some(
    (key) => key === 'NETLIFY_DEV'
      ? process.env.NETLIFY_DEV === 'true' && process.env.NETLIFY === 'true'
      : Boolean(process.env[key] && key !== 'CONTEXT'),
  ) || process.env.CONTEXT === 'production';

// 托管环境（Netlify Function）里绝不允许静默降级到 SQLite：
// 临时文件系统会丢数据，必须启动即抛错提醒配置缺失。
export const assertProductionSupabaseConfig = (): void => {
  if (!isManagedRuntime()) return;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  throw new Error(
    '[config] 托管生产环境缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY，'
    + '已拒绝启动以防数据写入临时文件系统丢失。请在 Netlify 环境变量中配置。',
  );
};

export const getLocalDb = (): DatabaseSync => {
  if (cached) return cached;
  const file = localDbPath();
  mkdirSync(dirname(file), { recursive: true });
  // NFS 软挂载上 SQLite 锁可能瞬断（"unable to open database file"），
  // 短退避重试几次而不是直接 500。
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      cached = new DatabaseSync(file);
      break;
    } catch (error) {
      lastError = error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200 * (attempt + 1));
    }
  }
  if (!cached) {
    throw lastError ?? new Error('unable to open local sqlite database');
  }
  cached.exec('pragma journal_mode = wal;');
  cached.exec('pragma foreign_keys = on;');
  return cached;
};

export const getLocalClient = (): LocalSupabaseClient =>
  new LocalSupabaseClient(getLocalDb());

export const ensureLocalDatabase = async (): Promise<void> => {
  const database = getLocalDb();
  database.exec(readFileSync(join(__dirname, './schema.sql'), 'utf8'));

  const adminCount = database.prepare(
    'select count(*) as total from admin_profiles',
  ).get() as { total: number };
  if (!adminCount.total) {
    const { hashPassword } = await import('../security/password');
    const password = process.env.LOCAL_ADMIN_PASSWORD || DEFAULT_LOCAL_ADMIN_PASSWORD;
    database.prepare(
      'insert into admin_profiles (id, email, password_hash, name, status) values (?, ?, ?, ?, ?)',
    ).run(newId(), LOCAL_ADMIN_EMAIL, await hashPassword(password), LOCAL_ADMIN_NAME, 'active');
  }

  const studentCount = database.prepare(
    'select count(*) as total from students',
  ).get() as { total: number };
  if (!studentCount.total) {
    const { buildStudents } = await import('./seedData');
    const seedHash = process.env.LOCAL_SEED_PASSWORD
      ? async (password: string) => hashPassword(password)
      : hashPassword;
    const students = await buildStudents(seedHash);
    const insertStudent = database.prepare(`
      insert into students
        (id, name, username, password_hash, email, status, must_change_password)
      values (?, ?, ?, ?, ?, ?, 0)
    `);
    const insertReport = database.prepare(`
      insert into daily_reports
        (id, student_id, report_date, self_evaluation, today_summary, tomorrow_plan, other_notes)
      values (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const student of students) {
      if (student.status === 'disabled' && !process.env.LOCAL_SEED_PASSWORD) {
        // Disabled students are part of the demo; insert with real hash too.
      }
      const id = newId();
      insertStudent.run(
        id,
        student.name,
        student.username,
        student.passwordHash,
        student.email,
        student.status,
      );
      for (const report of student.reports) {
        insertReport.run(
          newId(),
          id,
          report.date,
          report.selfEvaluation,
          report.todaySummary,
          report.tomorrowPlan,
          report.otherNotes,
        );
      }
    }
  }
};

export type LocalAdminSession = {
  token: string;
  principal: LocalAdminPrincipal;
};

export const localAdminLogin = async (
  email: string,
  password: string,
): Promise<LocalAdminSession | null> => {
  const database = getLocalDb();
  const row = database.prepare(`
    select id, name, password_hash from admin_profiles
    where lower(trim(email)) = lower(trim(?)) and status = 'active'
  `).get(email) as { id: string; name: string; password_hash: string | null } | undefined;
  if (!row?.password_hash) return null;
  const { verifyPassword } = await import('../security/password');
  if (!(await verifyPassword(password, row.password_hash))) return null;

  const token = newToken();
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  database.prepare(
    'insert into admin_sessions (id, admin_id, token_hash, expires_at) values (?, ?, ?, ?)',
  ).run(newId(), row.id, hashToken(token), expiresAt);
  return {
    token,
    principal: { id: row.id, email: LOCAL_ADMIN_EMAIL, name: row.name },
  };
};

export { verifyLocalAdminToken };