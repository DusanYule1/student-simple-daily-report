import { z } from 'zod';
import { getDb } from '../db';
import { ApiError, badRequest, notFound } from '../errors';
import { json, noContent, parseJson, positiveIntegerParam } from '../http';
import { authenticateAdmin, type AdminPrincipal } from '../security/admin';
import { hashPassword } from '../security/password';

const createSchema = z.object({
  name: z.string().trim().min(1),
  username: z.string().trim().min(1).max(100),
  email: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
  temporary_password: z.string().min(8),
  status: z.enum(['active', 'disabled']).default('active'),
}).strict();

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  username: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
  status: z.enum(['active', 'disabled']).optional(),
}).strict().refine((value) => Object.keys(value).length > 0);

const passwordSchema = z.object({
  temporary_password: z.string().min(8),
}).strict();

const normalizeUsername = (value: string) => value.trim().toLowerCase();

const writeAudit = async (
  actor: AdminPrincipal,
  action: string,
  targetStudentId: string | null,
  summary: Record<string, unknown>,
) => {
  const { error } = await getDb().from('admin_audit_logs').insert({
    actor_id: actor.id,
    target_student_id: targetStudentId,
    action,
    change_summary: summary,
  });
  if (error) throw error;
};

const studentFields = `
  id, name, username, email, status, must_change_password,
  last_login_at, created_at, updated_at
`;

const pagination = (url: URL) => {
  const page = positiveIntegerParam(url.searchParams, 'page', 1, 1_000_000);
  const pageSize = positiveIntegerParam(url.searchParams, 'page_size', 20, 100);
  return { page, pageSize, from: (page - 1) * pageSize, to: page * pageSize - 1 };
};

export const getAdminMe = async (request: Request, id: string) => {
  const admin = await authenticateAdmin(request);
  return json(admin, id);
};

export const listAdminStudents = async (request: Request, id: string) => {
  await authenticateAdmin(request);
  const url = new URL(request.url);
  const { page, pageSize, from, to } = pagination(url);
  let query = getDb()
    .from('students')
    .select(studentFields, { count: 'exact' })
    .order('name')
    .range(from, to);
  const q = url.searchParams.get('q')?.trim();
  const status = url.searchParams.get('status');
  if (q) query = query.or(`name.ilike.%${q}%,username.ilike.%${q}%`);
  if (status === 'active' || status === 'disabled') query = query.eq('status', status);
  const { data, count, error } = await query;
  if (error) throw error;
  return json(data || [], id, 200, {
    page,
    page_size: pageSize,
    total: count || 0,
    total_pages: Math.ceil((count || 0) / pageSize),
  });
};

export const createAdminStudent = async (request: Request, id: string) => {
  const admin = await authenticateAdmin(request);
  const parsed = createSchema.safeParse(await parseJson(request));
  if (!parsed.success) throw badRequest('学生信息格式不正确');
  const username = normalizeUsername(parsed.data.username);
  const passwordHash = await hashPassword(parsed.data.temporary_password);
  const { data, error } = await getDb()
    .from('students')
    .insert({
      name: parsed.data.name,
      username,
      email: parsed.data.email ?? null,
      password_hash: passwordHash,
      status: parsed.data.status,
      must_change_password: true,
    })
    .select(studentFields)
    .single();
  if (error?.code === '23505') throw new ApiError(409, 'STATE_CONFLICT', '用户名已经存在');
  if (error) throw error;
  await writeAudit(admin, 'student.created', data.id, {
    name: data.name,
    username: data.username,
    email: data.email,
    status: data.status,
  });
  return json(data, id, 201);
};

export const getAdminStudent = async (
  request: Request,
  id: string,
  studentId: string,
) => {
  await authenticateAdmin(request);
  const db = getDb();
  const [{ data, error }, { count: reportCount }, { count: sessionCount }] = await Promise.all([
    db.from('students').select(studentFields).eq('id', studentId).maybeSingle(),
    db.from('daily_reports').select('id', { count: 'exact', head: true }).eq('student_id', studentId),
    db.from('student_sessions').select('id', { count: 'exact', head: true })
      .eq('student_id', studentId).gt('expires_at', new Date().toISOString()),
  ]);
  if (error) throw error;
  if (!data) throw notFound('学生不存在');
  return json({
    student: data,
    statistics: {
      report_count: reportCount || 0,
      active_session_count: sessionCount || 0,
    },
  }, id);
};

export const updateAdminStudent = async (
  request: Request,
  id: string,
  studentId: string,
) => {
  const admin = await authenticateAdmin(request);
  const parsed = updateSchema.safeParse(await parseJson(request));
  if (!parsed.success) throw badRequest('至少提供一个有效的修改字段');
  const db = getDb();
  const { data: before, error: beforeError } = await db
    .from('students').select(studentFields).eq('id', studentId).maybeSingle();
  if (beforeError) throw beforeError;
  if (!before) throw notFound('学生不存在');
  const patch = {
    ...parsed.data,
    ...(parsed.data.username ? { username: normalizeUsername(parsed.data.username) } : {}),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db
    .from('students').update(patch).eq('id', studentId).select(studentFields).single();
  if (error?.code === '23505') throw new ApiError(409, 'STATE_CONFLICT', '用户名已经存在');
  if (error) throw error;
  if (before.status !== data.status && data.status === 'disabled') {
    const { error: revokeError } = await db.from('student_sessions').delete().eq('student_id', studentId);
    if (revokeError) throw revokeError;
  }
  const beforeRecord = before as Record<string, unknown>;
  const dataRecord = data as Record<string, unknown>;
  const changed = Object.fromEntries(
    Object.keys(parsed.data).map((key) => [key, {
      from: beforeRecord[key],
      to: dataRecord[key],
    }]),
  );
  const action = before.status !== data.status
    ? `student.${data.status === 'active' ? 'enabled' : 'disabled'}`
    : 'student.updated';
  await writeAudit(admin, action, studentId, changed);
  return json(data, id);
};

export const resetAdminStudentPassword = async (
  request: Request,
  studentId: string,
) => {
  const admin = await authenticateAdmin(request);
  const parsed = passwordSchema.safeParse(await parseJson(request));
  if (!parsed.success) throw badRequest('临时密码至少需要 8 个字符');
  const db = getDb();
  const { data, error } = await db.from('students').update({
    password_hash: await hashPassword(parsed.data.temporary_password),
    must_change_password: true,
    updated_at: new Date().toISOString(),
  }).eq('id', studentId).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('学生不存在');
  const { error: revokeError } = await db.from('student_sessions').delete().eq('student_id', studentId);
  if (revokeError) throw revokeError;
  await writeAudit(admin, 'student.temporary_password_set', studentId, {
    must_change_password: true,
    sessions_revoked: true,
  });
  return noContent();
};

export const revokeAdminStudentSessions = async (
  request: Request,
  id: string,
  studentId: string,
) => {
  const admin = await authenticateAdmin(request);
  const db = getDb();
  const { count: exists, error: existsError } = await db.from('students')
    .select('id', { count: 'exact', head: true }).eq('id', studentId);
  if (existsError) throw existsError;
  if (!exists) throw notFound('学生不存在');
  const { data, error } = await db.from('student_sessions')
    .delete().eq('student_id', studentId).select('id');
  if (error) throw error;
  await writeAudit(admin, 'student.sessions_revoked', studentId, {
    revoked_count: data?.length || 0,
  });
  return json({ revoked_count: data?.length || 0 }, id);
};
