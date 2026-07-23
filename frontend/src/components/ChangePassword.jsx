import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { changePassword } from '../services/api';

function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('新密码至少需要 8 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }
    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error?.message || '密码修改失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="full-center">
      <div className="card login-card">
        <h1 className="login-title text-center">修改临时密码</h1>
        <p className="text-muted text-center">首次登录必须设置新密码后才能继续。</p>
        <form onSubmit={handleSubmit} className="login-form">
          <label className="label">
            当前临时密码
            <input
              className="input login-input"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label className="label">
            新密码
            <input
              className="input login-input"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength="8"
              required
            />
          </label>
          <label className="label">
            确认新密码
            <input
              className="input login-input"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength="8"
              required
            />
          </label>
          <button className="btn btn--primary btn--block" disabled={loading}>
            {loading ? '正在修改...' : '修改密码'}
          </button>
          {error && <p className="text-danger text-center">{error}</p>}
        </form>
      </div>
    </div>
  );
}

export default ChangePassword;
