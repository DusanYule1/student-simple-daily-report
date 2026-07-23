alter table public.students
  add column if not exists email text;

alter table public.students
  drop constraint if exists students_email_format;

alter table public.students
  add constraint students_email_format
  check (
    email is null
    or (
      length(trim(email)) >= 5
      and position('@' in email) > 1
      and position('.' in split_part(email, '@', 2)) > 1
    )
  );

create unique index if not exists uq_students_email_normalized
  on public.students (lower(trim(email)))
  where email is not null;

comment on column public.students.email is
  'Required by the application for active students and used as a BCC recipient for daily reports.';
