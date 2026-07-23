import { getDb } from '../db';
import { json, positiveIntegerParam } from '../http';
import { authenticateViewer } from '../security/viewer';

export const listVisibleStudents = async (request: Request, id: string) => {
  await authenticateViewer(request);
  const url = new URL(request.url);
  const page = positiveIntegerParam(url.searchParams, 'page', 1, 1_000_000);
  const pageSize = positiveIntegerParam(url.searchParams, 'page_size', 100, 200);
  const from = (page - 1) * pageSize;
  let query = getDb().from('students')
    .select('id, name', { count: 'exact' })
    .eq('status', 'active')
    .order('name')
    .range(from, from + pageSize - 1);
  const search = url.searchParams.get('q')?.trim();
  if (search) query = query.ilike('name', `%${search}%`);
  const { data, count, error } = await query;
  if (error) throw error;
  return json(data || [], id, 200, {
    pagination: {
      page,
      page_size: pageSize,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / pageSize),
    },
  });
};
