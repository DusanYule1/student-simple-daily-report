import { createClient } from '@supabase/supabase-js';

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const url = required('SUPABASE_URL');
const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
const email = required('BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
const password = required('BOOTSTRAP_ADMIN_PASSWORD');
const name = required('BOOTSTRAP_ADMIN_NAME');

if (password.length < 12) {
  throw new Error('BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters');
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: users, error: listError } = await supabase.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});
if (listError) throw listError;

let user = users.users.find((candidate) => candidate.email?.toLowerCase() === email);
if (!user) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  user = data.user;
}
if (!user) throw new Error('Unable to resolve bootstrap administrator');

const { error: profileError } = await supabase.from('admin_profiles').upsert({
  id: user.id,
  name,
  status: 'active',
  updated_at: new Date().toISOString(),
});
if (profileError) throw profileError;

console.log(`Administrator ready: ${email} (${user.id})`);
