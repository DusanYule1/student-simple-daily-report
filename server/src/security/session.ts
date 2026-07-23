import { createHash, randomBytes } from 'node:crypto';
import { getConfig } from '../config';
import { getDb } from '../db';
import { authRequired, forbidden } from '../errors';
import { getCookie } from '../http';

export interface StudentPrincipal {
  id: string;
  name: string;
  username: string;
  mustChangePassword: boolean;
  sessionId: string;
  expiresAt: string;
}

export const hashSessionToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export const createStudentSession = async (studentId: string) => {
  const config = getConfig();
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(
    Date.now() + config.sessionTtlSeconds * 1000,
  ).toISOString();

  const { data, error } = await getDb()
    .from('student_sessions')
    .insert({
      student_id: studentId,
      token_hash: hashSessionToken(token),
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (error) throw error;
  return { token, sessionId: data.id as string, expiresAt };
};

export const sessionCookie = (token: string): string => {
  const config = getConfig();
  return [
    `${config.sessionCookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${config.sessionTtlSeconds}`,
  ].join('; ');
};

export const clearSessionCookie = (): string => {
  const config = getConfig();
  return [
    `${config.sessionCookieName}=`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=0',
  ].join('; ');
};

export const authenticateStudent = async (
  request: Request,
  allowPasswordChangeOnly = false,
): Promise<StudentPrincipal> => {
  const config = getConfig();
  const token = getCookie(request, config.sessionCookieName);
  if (!token) throw authRequired();

  const { data, error } = await getDb()
    .from('student_sessions')
    .select(`
      id,
      expires_at,
      students!inner (
        id,
        name,
        username,
        status,
        must_change_password
      )
    `)
    .eq('token_hash', hashSessionToken(token))
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !data) throw authRequired();
  const student = Array.isArray(data.students) ? data.students[0] : data.students;
  if (!student || student.status !== 'active') throw authRequired();
  if (student.must_change_password && !allowPasswordChangeOnly) {
    throw forbidden('PASSWORD_CHANGE_REQUIRED', '请先修改临时密码');
  }

  return {
    id: student.id,
    name: student.name,
    username: student.username,
    mustChangePassword: student.must_change_password,
    sessionId: data.id,
    expiresAt: data.expires_at,
  };
};

export const revokeSession = async (sessionId: string): Promise<void> => {
  const { error } = await getDb()
    .from('student_sessions')
    .delete()
    .eq('id', sessionId);
  if (error) throw error;
};

export const revokeAllStudentSessions = async (studentId: string): Promise<void> => {
  const { error } = await getDb()
    .from('student_sessions')
    .delete()
    .eq('student_id', studentId);
  if (error) throw error;
};

