alter table public.students
  add column if not exists missing_report_exempt boolean not null default false;