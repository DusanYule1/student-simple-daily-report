const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

export const getConfig = () => ({
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  sessionCookieName: process.env.STUDENT_SESSION_COOKIE || 'student_session',
  sessionTtlSeconds: 60 * 60 * 24 * 30,
  timezone: 'Asia/Shanghai',
  businessDayCutoffHour: 3,
});
