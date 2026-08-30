import { badRequest, invalidCredentials } from '../errors';
import { parseJson } from '../http';
import { localAdminLogin } from '../local/bootstrap';

const loginSchema = {
  safeParse: (value: unknown) => {
    const data = value as { email?: unknown; password?: unknown } | null;
    const valid = Boolean(
      data && typeof data.email === 'string' && typeof data.password === 'string',
    );
    return { success: valid, data: data as { email: string; password: string } };
  },
};

export const loginLocalAdmin = async (request: Request): Promise<Response> => {
  const parsed = loginSchema.safeParse(await parseJson(request));
  if (!parsed.success) throw badRequest('邮箱和密码不能为空');
  const session = await localAdminLogin(parsed.data.email, parsed.data.password);
  if (!session) throw invalidCredentials();
  return Response.json(
    {
      data: {
        token: session.token,
        admin: session.principal,
      },
      meta: { request_id: 'local' },
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
};