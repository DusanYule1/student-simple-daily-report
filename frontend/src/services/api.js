// frontend/src/services/api.js
import axios from 'axios';
import { apiBaseUrl } from '../config';

// ✅ 创建一个 axios 实例，启用 withCredentials
const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true  // ✅ 关键：允许携带 cookie
});

// ✅ 所有请求都使用这个实例
export const login = (username, password) =>
  api.post('/login', { username, password });

export const logout = () => api.post('/logout');

export const getSession = () => api.get('/session');

export const getStudents = () => api.get('/students');

export const getProgress = (startDate, endDate) => {
  const params = {};
  if (startDate) params.start_date = startDate;
  if (endDate) params.end_date = endDate;
  return api.get('/progress', { params });
};

export const getProgressByDate = (studentId, dateStr) =>
  api.get(`/progress/${studentId}/${dateStr}`);

export const submitProgress = (data) =>
  api.post('/progress', data);
