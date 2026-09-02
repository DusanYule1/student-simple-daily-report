import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from './config';
import { assertProductionSupabaseConfig, getLocalClient, getLocalDb, isLocalMode } from './local/bootstrap';
import type { LocalSupabaseClient } from './local/supabaseShim';

export type AppDbClient = SupabaseClient | LocalSupabaseClient;

let client: SupabaseClient | undefined;

export const getDb = (): AppDbClient => {
  assertProductionSupabaseConfig();
  if (isLocalMode()) {
    return getLocalClient();
  }
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

// Keep the sqlite handle reachable for local-only callers (tests, dev server).
export const getLocalDatabase = getLocalDb;