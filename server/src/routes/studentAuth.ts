import { z } from 'zod';
import { getConfig } from '../config';
import { getDb } from '../db';
import { badRequest, invalidCredentials } from '../errors';
import { json, noContent, parseJson } from '../http';
import { hashPassword, verifyPassword } from '../security/password';
import {
  authenticateStudent,
  clearSessionCookie,
  createStudentSession,
  revokeAllStudentSessions,
  revokeSession,
  sessionCookie,
} from '../security/session';

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
}).strict();

const passwordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
}).strict();

const studentSessionPayload = (
  student: {
    id: string;
    name: string;
    username: string;
    mustChangePassword: boolean;
  },
  expiresAt: string,
) => ({
  authenticated: true,
  student: {
    id: student.id,
    name: student.name,
    username: student.username,
    must_change_password: student.mustChangePassword,
  },
  session: { expires_at: expiresAt },
});

export const loginStudent = async (request: Request, id: string): Promise<Response> => {
  const parsed = loginSchema.safeParse(await parseJson(request));
  if (!parsed.success) {
    throw badRequest('用户名和密码不能为空');
  }

  const normalizedUsername = parsed.data.username.toLowerCase();
  const { data: student, error } = await getDb()
    .from('students')
    .select('id, name, username, password_hash, status, must_change_password')
    .eq('username', normalizedUsername)
    .maybeSingle();

  if (
    error ||
    !student ||
    student.status !== 'active' ||
    !(await verifyPassword(parsed.data.password, student.password_hash))
  ) {
    throw invalidCredentials();
  }

  const session = await createStudentSession(student.id);
  await getDb()
    .from('students')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', student.id);

  return json(
    studentSessionPayload({
      id: student.id,
      name: student.name,
      username: student.username,
      mustChangePassword: student.must_change_password,
    }, session.expiresAt),
    id,
    200,
    {},
    { 'Set-Cookie': sessionCookie(session.token) },
  );
};

export const getStudentSession = async (
  request: Request,
  id: string,
): Promise<Response> => {
  const principal = await authenticateStudent(request, true);
  return json(studentSessionPayload(principal, principal.expiresAt), id);
};

export const logoutStudent = async (
  request: Request,
): Promise<Response> => {
  try {
    const principal = await authenticateStudent(request, true);
    await revokeSession(principal.sessionId);
  } catch {
    // Logout is intentionally idempotent.
  }
  return noContent({ 'Set-Cookie': clearSessionCookie() });
};

export const updateStudentPassword = async (
  request: Request,
): Promise<Response> => {
  const principal = await authenticateStudent(request, true);
  const parsed = passwordSchema.safeParse(await parseJson(request));
  if (!parsed.success) {
    throw badRequest('新密码至少需要 8 位');
  }

  const { data: student, error } = await getDb()
    .from('students')
    .select('password_hash')
    .eq('id', principal.id)
    .single();
  if (error || !student || !(await verifyPassword(
    parsed.data.current_password,
    student.password_hash,
  ))) {
    throw invalidCredentials();
  }

  const newHash = await hashPassword(parsed.data.new_password);
  const { error: updateError } = await getDb()
    .from('students')
    .update({
      password_hash: newHash,
      must_change_password: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', principal.id);
  if (updateError) throw updateError;

  await revokeAllStudentSessions(principal.id);
  const session = await createStudentSession(principal.id);
  return noContent({ 'Set-Cookie': sessionCookie(session.token) });
};

