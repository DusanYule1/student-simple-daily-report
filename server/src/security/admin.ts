import { getDb } from '../db';
import { authRequired, forbidden } from '../errors';

export type AdminPrincipal = {
  id: string;
  name: string;
  email: string;
};

export const authenticateAdmin = async (
  request: Request,
): Promise<AdminPrincipal> => {
  const header = request.headers.get('authorization') || '';
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw authRequired();

  const db = getDb();
  const { data: authData, error: authError } = await db.auth.getUser(token);
  if (authError || !authData.user) throw authRequired();

  const { data: profile, error } = await db
    .from('admin_profiles')
    .select('id, name, status')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!profile || profile.status !== 'active') {
    throw forbidden('FORBIDDEN', '该账号没有有效的管理员权限');
  }

  return {
    id: profile.id,
    name: profile.name,
    email: authData.user.email || '',
  };
};
