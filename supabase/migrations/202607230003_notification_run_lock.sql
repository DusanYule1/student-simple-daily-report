create unique index uq_notification_runs_running_date
  on public.notification_runs (report_date)
  where status = 'running';
