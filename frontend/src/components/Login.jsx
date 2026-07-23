// src/components/Login.jsx
import React, { useState } from 'react';
import { login } from '../services/api';
import { useNavigate } from 'react-router-dom';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await login(username, password);

      const session = response.data?.data;
      navigate(
        session?.student?.must_change_password ? '/change-password' : '/dashboard',
        { replace: true },
      );
    } catch (err) {
      // 处理网络错误或 4xx/5xx 响应
      if (err.response) {
        // 服务器返回了响应（如 401, 500）
        setError(err.response.data?.error?.message || '登录失败，请检查用户名和密码');
      } else if (err.request) {
        // 请求已发出，但无响应（如后端未启动）
        setError('无法连接到服务器，请稍后重试');
      } else {
        // 其他错误
        setError('发生未知错误：' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="full-center">
      <div className="card login-card">
        <h1 className="login-title text-center">学生进度记录系统</h1>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label className="label">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              disabled={loading}
              className="input login-input"
            />
          </div>
          <div className="form-group">
            <label className="label">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              disabled={loading}
              className="input login-input"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn btn--primary btn--block login-button"
          >
            {loading ? '登录中...' : '登 录'}
          </button>
          
          {error && <p className="text-danger text-center">{error}</p>}
        </form>
      </div>
    </div>
  );
}

export default Login;
