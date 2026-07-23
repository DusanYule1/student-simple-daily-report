import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const initial = readFileSync(
  'supabase/migrations/202607230001_initial_schema.sql',
  'utf8',
).toLowerCase();
const board = readFileSync(
  'supabase/migrations/202607230002_monthly_board_function.sql',
  'utf8',
).toLowerCase();
const mailLock = readFileSync(
  'supabase/migrations/202607230003_notification_run_lock.sql',
  'utf8',
).toLowerCase();

test('sensitive tables have RLS enabled and required lookup indexes', () => {
  for (const table of [
    'students',
    'student_sessions',
    'daily_reports',
    'admin_profiles',
    'admin_audit_logs',
    'notification_recipients',
    'notification_runs',
  ]) {
    assert.match(initial, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(initial, /unique \(student_id, report_date\)/);
  assert.match(initial, /on public\.daily_reports \(report_date, student_id\)/);
  assert.match(initial, /on public\.student_sessions \(student_id, expires_at\)/);
});

test('monthly board uses one set-based date range query', () => {
  assert.match(board, /report_date >= p_month_start/);
  assert.match(board, /report_date < p_next_month_start/);
  assert.match(board, /left join public\.daily_reports/);
  assert.doesNotMatch(board, /\b(loop|cursor)\b/);
});

test('mail runs prevent concurrent sends for the same report date', () => {
  assert.match(mailLock, /unique index/);
  assert.match(mailLock, /\(report_date\)/);
  assert.match(mailLock, /where status = 'running'/);
});
