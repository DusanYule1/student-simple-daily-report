import type { Config, Context } from '@netlify/functions';
import { sendDailyReportMail } from '../../server/src/services/dailyMail';
import { businessDate } from '../../server/src/time';

const previousDate = (date: string): string => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
};

export default async (_request: Request, _context: Context): Promise<Response> => {
  const reportDate = previousDate(businessDate());
  const run = await sendDailyReportMail(reportDate);
  return Response.json({ ok: true, report_date: reportDate, run_id: run.id });
};

export const config: Config = {
  schedule: '0 22 * * *',
};
