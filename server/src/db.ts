import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from './config';

let client: SupabaseClient | undefined;

export const getDb = (): SupabaseClient => {
  if (!client) {
    const config = getConfig();
    client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          'X-Client-Info': 'student-daily-report-functions/2.0',
        },
      },
    });
  }
  return client;
};

