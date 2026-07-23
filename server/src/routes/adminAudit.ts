import { getDb } from '../db';
import { json, positiveIntegerParam } from '../http';
import { authenticateAdmin } from '../security/admin';

export const listAdminAuditLogs = async (request: Request, id: string) => {
  await authenticateAdmin(request);
  const url = new URL(request.url);
  const page = positiveIntegerParam(url.searchParams, 'page', 1, 1_000_000);
  const pageSize = positiveIntegerParam(url.searchParams, 'page_size', 20, 100);
  let query = getDb().from('admin_audit_logs').select(`
    id, action, change_summary, created_at,
    actor:admin_profiles!actor_id (id, name),
    target_student:students!target_student_id (id, name)
  `, { count: 'exact' }).order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  const actorId = url.searchParams.get('actor_id');
  const targetId = url.searchParams.get('target_student_id');
  const action = url.searchParams.get('action');
  const start = url.searchParams.get('start_time');
  const end = url.searchParams.get('end_time');
  if (actorId) query = query.eq('actor_id', actorId);
  if (targetId) query = query.eq('target_student_id', targetId);
  if (action) query = query.eq('action', action);
  if (start) query = query.gte('created_at', start);
  if (end) query = query.lte('created_at', end);
  const { data, count, error } = await query;
  if (error) throw error;
  return json(data || [], id, 200, {
    page, page_size: pageSize, total: count || 0,
    total_pages: Math.ceil((count || 0) / pageSize),
  });
};
