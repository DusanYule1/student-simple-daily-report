const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const isLocalMode = (): boolean =>
  !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;

export const getConfig = () => ({
  supabaseUrl: isLocalMode() ? 'local' : required('SUPABASE_URL'),
  supabaseServiceRoleKey: isLocalMode() ? 'local' : required('SUPABASE_SERVICE_ROLE_KEY'),
  sessionCookieName: process.env.STUDENT_SESSION_COOKIE || 'student_session',
  sessionTtlSeconds: 60 * 60 * 24 * 30,
  timezone: 'Asia/Shanghai',
  businessDayCutoffHour: 3,
});
