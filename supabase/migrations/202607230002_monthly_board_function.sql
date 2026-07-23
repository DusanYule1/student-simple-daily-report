create or replace function public.get_monthly_board(
  p_month_start date,
  p_next_month_start date,
  p_search text default null
)
returns table (
  student_id uuid,
  student_name text,
  activities jsonb,
  submitted_count bigint,
  satisfied_count bigint,
  average_count bigint,
  dissatisfied_count bigint,
  other_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with active_students as (
    select id, name
    from public.students
    where status = 'active'
      and (
        nullif(trim(p_search), '') is null
        or name ilike '%' || trim(p_search) || '%'
      )
  )
  select
    s.id as student_id,
    s.name as student_name,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'date', r.report_date,
          'report_id', r.id,
          'self_evaluation', r.self_evaluation
        )
        order by r.report_date
      ) filter (where r.id is not null),
      '[]'::jsonb
    ) as activities,
    count(r.id) as submitted_count,
    count(*) filter (
      where r.self_evaluation = 'satisfied'
    ) as satisfied_count,
    count(*) filter (
      where r.self_evaluation = 'average'
    ) as average_count,
    count(*) filter (
      where r.self_evaluation = 'dissatisfied'
    ) as dissatisfied_count,
    count(*) filter (
      where r.self_evaluation = 'other'
    ) as other_count
  from active_students s
  left join public.daily_reports r
    on r.student_id = s.id
   and r.report_date >= p_month_start
   and r.report_date < p_next_month_start
  group by s.id, s.name
  order by s.name, s.id;
$$;

revoke all on function public.get_monthly_board(date, date, text)
  from public, anon, authenticated;
grant execute on function public.get_monthly_board(date, date, text)
  to service_role;
