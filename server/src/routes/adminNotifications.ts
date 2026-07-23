import { z } from 'zod';
import { getDb } from '../db';
import { ApiError, badRequest, notFound } from '../errors';
import { json, parseJson, positiveIntegerParam } from '../http';
import { authenticateAdmin } from '../security/admin';
import { sendDailyReportMail } from '../services/dailyMail';

const recipientSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  display_name: z.string().trim().default(''),
  enabled: z.boolean().default(true),
}).strict();

const recipientPatchSchema = recipientSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
);

const pageRange = (url: URL) => {
  const page = positiveIntegerParam(url.searchParams, 'page', 1, 1_000_000);
  const pageSize = positiveIntegerParam(url.searchParams, 'page_size', 20, 100);
  return { page, pageSize, from: (page - 1) * pageSize, to: page * pageSize - 1 };
};

export const listNotificationRecipients = async (request: Request, id: string) => {
  await authenticateAdmin(request);
  const url = new URL(request.url);
  const { page, pageSize, from, to } = pageRange(url);
  const { data, count, error } = await getDb().from('notification_recipients')
    .select('*', { count: 'exact' }).order('email').range(from, to);
  if (error) throw error;
  return json(data || [], id, 200, {
    page, page_size: pageSize, total: count || 0,
    total_pages: Math.ceil((count || 0) / pageSize),
  });
};

export const createNotificationRecipient = async (request: Request, id: string) => {
  await authenticateAdmin(request);
  const parsed = recipientSchema.safeParse(await parseJson(request));
  if (!parsed.success) throw badRequest('收件人信息格式不正确');
  const { data, error } = await getDb().from('notification_recipients')
    .insert(parsed.data).select('*').single();
  if (error?.code === '23505') throw new ApiError(409, 'STATE_CONFLICT', '邮箱已经存在');
  if (error) throw error;
  return json(data, id, 201);
};

export const updateNotificationRecipient = async (
  request: Request, id: string, recipientId: string,
) => {
  await authenticateAdmin(request);
  const parsed = recipientPatchSchema.safeParse(await parseJson(request));
  if (!parsed.success) throw badRequest('至少提供一个有效的修改字段');
  const { data, error } = await getDb().from('notification_recipients')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', recipientId).select('*').maybeSingle();
  if (error?.code === '23505') throw new ApiError(409, 'STATE_CONFLICT', '邮箱已经存在');
  if (error) throw error;
  if (!data) throw notFound('收件人不存在');
  return json(data, id);
};

export const listNotificationRuns = async (request: Request, id: string) => {
  await authenticateAdmin(request);
  const url = new URL(request.url);
  const { page, pageSize, from, to } = pageRange(url);
  let query = getDb().from('notification_runs').select('*', { count: 'exact' })
    .order('created_at', { ascending: false }).range(from, to);
  const status = url.searchParams.get('status');
  const start = url.searchParams.get('start_date');
  const end = url.searchParams.get('end_date');
  if (status) query = query.eq('status', status);
  if (start) query = query.gte('report_date', start);
  if (end) query = query.lte('report_date', end);
  const { data, count, error } = await query;
  if (error) throw error;
  return json(data || [], id, 200, {
    page, page_size: pageSize, total: count || 0,
    total_pages: Math.ceil((count || 0) / pageSize),
  });
};

export const retryNotificationRun = async (
  request: Request,
  id: string,
  reportDate: string,
) => {
  const admin = await authenticateAdmin(request);
  const body = await parseJson(request);
  const parsed = z.object({ reason: z.string().trim().min(1).max(500) }).strict().safeParse(body);
  if (!parsed.success) throw badRequest('请填写补发原因');
  const run = await sendDailyReportMail(reportDate);
  const { error } = await getDb().from('admin_audit_logs').insert({
    actor_id: admin.id,
    action: 'notification.retry',
    change_summary: { report_date: reportDate, reason: parsed.data.reason, run_id: run.id },
  });
  if (error) throw error;
  return json(run, id, 202);
};
