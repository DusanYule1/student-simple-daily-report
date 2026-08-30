import axios from 'axios';
import { apiBaseUrl } from '../config';
import { isAdminAuthConfigured, supabase } from './supabase';

const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
});

export const login = (username, password) =>
  api.post('/student/session', { username, password });

export const logout = () => api.delete('/student/session');

export const getSession = () => api.get('/student/session');

export const changePassword = (currentPassword, newPassword) =>
  api.put('/student/password', {
    current_password: currentPassword,
    new_password: newPassword,
  });

export const getMonthlyBoard = (month, query = '') =>
  api.get('/board/monthly', { params: { month, q: query || undefined } });

export const getProgressByDate = (studentId, dateStr) =>
  api.get(`/students/${studentId}/reports/${dateStr}`);

export const getTodayReport = () => api.get('/reports/today');

export const submitProgress = (data) =>
  api.put('/reports/today', data);

export const getStudentReportRange = (studentId, params) =>
  api.get(`/students/${studentId}/reports`, { params });

// ---------------------------------------------------------------------------
// Admin auth: Supabase Auth in production, local /admin/session in local mode.
// ---------------------------------------------------------------------------

export const isAdminLocalMode = !isAdminAuthConfigured;

const LOCAL_ADMIN_TOKEN_KEY = 'local_admin_token';

export const getLocalAdminToken = (): string | null =>
  (typeof window !== 'undefined' && window.localStorage.getItem(LOCAL_ADMIN_TOKEN_KEY)) || null;

export const storeLocalAdminToken = (token: string) => {
  window.localStorage.setItem(LOCAL_ADMIN_TOKEN_KEY, token);
};

export const clearLocalAdminToken = () => {
  window.localStorage.removeItem(LOCAL_ADMIN_TOKEN_KEY);
};

export const localAdminLogin = async (email: string, password: string) => {
  const response = await axios.post(`${apiBaseUrl}/admin/session`, { email, password });
  storeLocalAdminToken(response.data.data.token);
  return response;
};

export const localAdminLogout = () => {
  clearLocalAdminToken();
};

export const adminApi = axios.create({ baseURL: apiBaseUrl });

adminApi.interceptors.request.use(async (config) => {
  if (isAdminLocalMode) {
    const token = getLocalAdminToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  }
  if (!supabase) return config;
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) {
    config.headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  return config;
});

adminApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (isAdminLocalMode && error.response?.status === 401) {
      clearLocalAdminToken();
      if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
        window.location.href = '/admin/login';
      }
    }
    throw error;
  },
);

export const getAdminMe = () => adminApi.get('/admin/me');
export const listAdminStudents = (params) => adminApi.get('/admin/students', { params });
export const createAdminStudent = (data) => adminApi.post('/admin/students', data);
export const updateAdminStudent = (id, data) => adminApi.patch(`/admin/students/${id}`, data);
export const resetAdminStudentPassword = (id, temporaryPassword) =>
  adminApi.post(`/admin/students/${id}/temporary-password`, {
    temporary_password: temporaryPassword,
  });
export const revokeAdminStudentSessions = (id) =>
  adminApi.delete(`/admin/students/${id}/sessions`);
export const listNotificationRecipients = () =>
  adminApi.get('/admin/notification-recipients', { params: { page_size: 100 } });
export const createNotificationRecipient = (data) =>
  adminApi.post('/admin/notification-recipients', data);
export const updateNotificationRecipient = (id, data) =>
  adminApi.patch(`/admin/notification-recipients/${id}`, data);
export const listNotificationRuns = () =>
  adminApi.get('/admin/notification-runs', { params: { page_size: 30 } });
export const retryNotificationRun = (date, reason) =>
  adminApi.post(`/admin/notification-runs/${date}/retry`, { reason });
export const listAdminAuditLogs = () =>
  adminApi.get('/admin/audit-logs', { params: { page_size: 30 } });