begin;

create extension if not exists pgcrypto;

create type public.student_status as enum ('active', 'disabled');
create type public.self_evaluation as enum (
  'satisfied',
  'average',
  'dissatisfied',
  'other'
);
create type public.notification_run_status as enum (
  'pending',
  'running',
  'succeeded',
  'failed'
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  username text not null,
  password_hash text not null,
  status public.student_status not null default 'active',
  must_change_password boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uq_students_username_normalized
  on public.students (lower(trim(username)));
create index idx_students_active_name
  on public.students (name, id)
  where status = 'active';

create table public.student_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create index idx_student_sessions_student_expiry
  on public.student_sessions (student_id, expires_at);

create table public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  report_date date not null,
  self_evaluation public.self_evaluation not null,
  today_summary text,
  tomorrow_plan text,
  other_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_daily_reports_student_date unique (student_id, report_date)
);

create index idx_daily_reports_date_student
  on public.daily_reports (report_date, student_id);

create table public.admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  status public.student_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.admin_profiles(id) on delete restrict,
  target_student_id uuid references public.students(id) on delete set null,
  action text not null,
  change_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_admin_audit_logs_created
  on public.admin_audit_logs (created_at desc);
create index idx_admin_audit_logs_target_created
  on public.admin_audit_logs (target_student_id, created_at desc);

create table public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_runs (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  status public.notification_run_status not null default 'pending',
  attempt_count integer not null default 1 check (attempt_count > 0),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  error_summary text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notification_runs_date_created
  on public.notification_runs (report_date, created_at desc);

alter table public.students enable row level security;
alter table public.student_sessions enable row level security;
alter table public.daily_reports enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.notification_recipients enable row level security;
alter table public.notification_runs enable row level security;

create policy admin_can_read_own_profile
  on public.admin_profiles
  for select
  to authenticated
  using (id = auth.uid());

comment on table public.students is
  'Students use application-managed credentials; never expose this table to anon/authenticated clients.';
comment on table public.student_sessions is
  'Opaque student session tokens are stored as hashes only.';

commit;
