import type { Config, Context } from '@netlify/functions';
import { route } from '../../server/src/router';

export default async (request: Request, _context: Context): Promise<Response> =>
  route(request);

export const config: Config = {
  path: '/api/*',
};

