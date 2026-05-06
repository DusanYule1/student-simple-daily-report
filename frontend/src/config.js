// frontend/src/config.js
// 统一管理前端配置（优先级：window.__APP_CONFIG__ > 环境变量 > 默认值）

const defaultBaseUrl = '/api';

export const apiBaseUrl = (
  typeof window !== 'undefined' &&
  window.__APP_CONFIG__ &&
  window.__APP_CONFIG__.API_BASE_URL
) || process.env.REACT_APP_API_BASE_URL || defaultBaseUrl;

export default {
  apiBaseUrl
};


