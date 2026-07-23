export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Array<{ field?: string; reason: string }>,
  ) {
    super(message);
  }
}

export const badRequest = (
  message: string,
  details?: Array<{ field?: string; reason: string }>,
) => new ApiError(400, 'VALIDATION_ERROR', message, details);

export const authRequired = () =>
  new ApiError(401, 'AUTH_REQUIRED', '需要登录后访问');

export const invalidCredentials = () =>
  new ApiError(401, 'AUTH_INVALID_CREDENTIALS', '用户名或密码错误');

export const forbidden = (code = 'FORBIDDEN', message = '无权执行此操作') =>
  new ApiError(403, code, message);

export const notFound = (message = '资源不存在') =>
  new ApiError(404, 'RESOURCE_NOT_FOUND', message);

