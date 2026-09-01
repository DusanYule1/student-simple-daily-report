-- Local-only SQLite schema mirroring supabase/migrations (dev preview, not for production).

create table if not exists students (
  id text primary key,
  name text not null check (length(trim(name)) > 0),
  username text not null,
  password_hash text not null,
  email text,
  status text not null default 'active' check (status in ('active', 'disabled')),
  must_change_password integer not null default 1,
  last_login_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create unique index if not exists uq_students_username_normalized
  on students (lower(trim(username)));
create unique index if not exists uq_students_email_normalized
  on students (lower(trim(email))) where email is not null;
create index if not exists idx_students_active_name on students (name, id) where status = 'active';

create table if not exists student_sessions (
  id text primary key,
  student_id text not null references students(id) on delete cascade,
  token_hash text not null unique,
  expires_at text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at text
);
create index if not exists idx_student_sessions_student_expiry
  on student_sessions (student_id, expires_at);

create table if not exists daily_reports (
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
create index if not exists idx_daily_reports_date_student on daily_reports (report_date, student_id);

create table if not exists admin_profiles (
  id text primary key,
  email text not null,
  password_hash text,
  name text not null check (length(trim(name)) > 0),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists admin_sessions (
  id text primary key,
  admin_id text not null references admin_profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists admin_audit_logs (
  id text primary key,
  actor_id text not null references admin_profiles(id) on delete restrict,
  target_student_id text references students(id) on delete set null,
  action text not null,
  change_summary text not null default '{}',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index if not exists idx_admin_audit_logs_created on admin_audit_logs (created_at desc);
create index if not exists idx_admin_audit_logs_target_created
  on admin_audit_logs (target_student_id, created_at desc);

create table if not exists notification_recipients (
  id text primary key,
  email text not null unique,
  display_name text not null default '',
  enabled integer not null default 1,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists notification_runs (
  id text primary key,
  report_date text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  error_summary text,
  started_at text,
  finished_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create unique index if not exists uq_notification_runs_running_date
  on notification_runs (report_date) where status = 'running';
create index if not exists idx_notification_runs_date_created
  on notification_runs (report_date, created_at desc);