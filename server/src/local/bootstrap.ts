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

// SQLite CHECK constraints cannot be altered in place; rebuild daily_reports
// when it predates the 'very_satisfied' evaluation (idempotent table swap).
const migrateDailyReportsEvaluation = (database: DatabaseSync): void => {
  const info = database.prepare(
    "select sql from sqlite_master where type = 'table' and name = 'daily_reports'",
  ).get() as { sql: string } | undefined;
  if (!info?.sql) return;
  if (info.sql.includes("'very_satisfied'")) return;

  database.exec('pragma foreign_keys = off;');
  try {
    database.exec('begin;');
    database.exec(`
      create table daily_reports_new (
        id text primary key,
        student_id text not null references students(id) on delete restrict,
        report_date text not null,
        self_evaluation text not null check (self_evaluation in ('very_satisfied', 'satisfied', 'average', 'dissatisfied', 'other')),
        today_summary text,
        tomorrow_plan text,
        other_notes text,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        constraint uq_daily_reports_student_date unique (student_id, report_date)
      );
      insert into daily_reports_new (id, student_id, report_date, self_evaluation, today_summary, tomorrow_plan, other_notes, created_at, updated_at)
        select id, student_id, report_date, self_evaluation, today_summary, tomorrow_plan, other_notes, created_at, updated_at from daily_reports;
      drop table daily_reports;
      alter table daily_reports_new rename to daily_reports;
      create index if not exists idx_daily_reports_date_student on daily_reports (report_date, student_id);
    `);
    database.exec('commit;');
  } catch (error) {
    database.exec('rollback;');
    throw error;
  }
  database.exec('pragma foreign_keys = on;');
  console.log('[local-db] daily_reports 已迁移：支持 very_satisfied 评价');
};
export const LOCAL_ADMIN_EMAIL = 'admin@example.com';
export const LOCAL_ADMIN_NAME = '系统管理员';
export const DEFAULT_LOCAL_ADMIN_PASSWORD = 'local-admin-123';

let cached: DatabaseSync | undefined;

export const localDbPath = (): string =>
  process.env.LOCAL_SQLITE_DB || DEFAULT_DB_FILE;

export const isLocalMode = (): boolean =>
  !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;

export const getLocalDb = (): DatabaseSync => {
  if (cached) return cached;
  const file = localDbPath();
  mkdirSync(dirname(file), { recursive: true });
  cached = new DatabaseSync(file);
  cached.exec('pragma journal_mode = wal;');
  cached.exec('pragma foreign_keys = on;');
  return cached;
};

export const getLocalClient = (): LocalSupabaseClient =>
  new LocalSupabaseClient(getLocalDb());

export const ensureLocalDatabase = async (): Promise<void> => {
  const database = getLocalDb();
  database.exec(readFileSync(join(__dirname, './schema.sql'), 'utf8'));
  migrateDailyReportsEvaluation(database);

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