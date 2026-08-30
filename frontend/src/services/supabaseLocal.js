import { supabase, isAdminAuthConfigured } from './supabase';

export { supabase, isAdminAuthConfigured };

export const isAdminLocalMode = !isAdminAuthConfigured;

export const localAdminLogout = () => {
  // Token removal lives in services/api; re-import lazily to avoid cycles there.
  import('./api').then((api) => api.clearLocalAdminToken());
};