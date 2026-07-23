import { randomUUID } from 'node:crypto';
import { ApiError } from './errors';

export type HandlerResult = Response | Promise<Response>;

export const requestId = (request: Request): string => {
  const supplied = request.headers.get('x-request-id');
  if (supplied && /^[A-Za-z0-9._:-]{1,128}$/.test(supplied)) {
    return supplied;
  }
  return `req_${randomUUID()}`;
};

export const json = (
  data: unknown,
  id: string,
  status = 200,
  extraMeta: Record<string, unknown> = {},
  headers?: HeadersInit,
): Response =>
  Response.json(
    {
      data,
      meta: {
        request_id: id,
        ...extraMeta,
      },
    },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        ...headers,
      },
    },
  );

export const noContent = (headers?: HeadersInit): Response =>
  new Response(null, { status: 204, headers });

export const errorResponse = (error: unknown, id: string): Response => {
  if (error instanceof ApiError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          request_id: id,
        },
      },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  console.error(JSON.stringify({
    level: 'error',
    request_id: id,
    message: error instanceof Error ? error.message : 'Unknown error',
  }));

  return Response.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务暂时不可用',
        request_id: id,
      },
    },
    { status: 500, headers: { 'Cache-Control': 'no-store' } },
  );
};

export const parseJson = async (request: Request): Promise<unknown> => {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Content-Type 必须是 application/json');
  }
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, 'VALIDATION_ERROR', 'JSON 格式不正确');
  }
};

export const getCookie = (request: Request, name: string): string | null => {
  const cookies = request.headers.get('cookie') || '';
  for (const pair of cookies.split(';')) {
    const [key, ...parts] = pair.trim().split('=');
    if (key === name) {
      return decodeURIComponent(parts.join('='));
    }
  }
  return null;
};

export const positiveIntegerParam = (
  searchParams: URLSearchParams,
  name: string,
  fallback: number,
  maximum: number,
): number => {
  const raw = searchParams.get(name);
  if (raw === null || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${name} 必须是正整数`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${name} 必须在 1 到 ${maximum} 之间`);
  }
  return value;
};
