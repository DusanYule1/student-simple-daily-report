import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getAdminMe } from '../services/api';
import { isAdminAuthConfigured, supabase } from '../services/supabase';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate('/admin/users', { replace: true });
    });
  }, [navigate]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!isAdminAuthConfigured) throw new Error('管理员认证环境变量尚未配置');
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) throw loginError;
      await getAdminMe();
      navigate('/admin/users', { replace: true });
    } catch (requestError) {
      await supabase?.auth.signOut();
      setError(requestError.response?.data?.error?.message || requestError.message || '登录失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <form className="panel auth-card" onSubmit={submit}>
        <h1>管理员登录</h1>
        <p className="muted">管理员账号由 Supabase Auth 管理。</p>
        {error && <div className="alert alert--error">{error}</div>}
        <label>邮箱<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>密码<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <button className="btn btn--primary" disabled={busy}>{busy ? '登录中…' : '登录'}</button>
        <Link to="/">返回学生登录</Link>
      </form>
    </main>
  );
}
