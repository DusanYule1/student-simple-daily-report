import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createAdminStudent,
  getAdminMe,
  listAdminStudents,
  listAdminAuditLogs,
  listNotificationRuns,
  resetAdminStudentPassword,
  retryNotificationRun,
  updateAdminStudent,
} from '../services/api';
import { supabase } from '../services/supabase';

const messageOf = (error) =>
  error.response?.data?.error?.message || error.message || '操作失败';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState(null);
  const [students, setStudents] = useState([]);
  const [runs, setRuns] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [studentForm, setStudentForm] = useState({
    name: '', username: '', email: '', temporary_password: '', status: 'active',
  });

  const load = useCallback(async () => {
    try {
      const [me, studentResult, runResult, auditResult] = await Promise.all([
        getAdminMe(),
        listAdminStudents({ q: query || undefined, page_size: 100 }),
        listNotificationRuns(),
        listAdminAuditLogs(),
      ]);
      setAdmin(me.data.data);
      setStudents(studentResult.data.data);
      setRuns(runResult.data.data);
      setAuditLogs(auditResult.data.data);
      setError('');
    } catch (requestError) {
      if (requestError.response?.status === 401 || requestError.response?.status === 403) {
        await supabase?.auth.signOut();
        navigate('/admin/login', { replace: true });
        return;
      }
      setError(messageOf(requestError));
    }
  }, [navigate, query]);

  useEffect(() => { load(); }, [load]);

  const addStudent = async (event) => {
    event.preventDefault();
    try {
      await createAdminStudent(studentForm);
      setStudentForm({ name: '', username: '', email: '', temporary_password: '', status: 'active' });
      await load();
    } catch (requestError) { setError(messageOf(requestError)); }
  };

  const toggleStudent = async (student) => {
    const status = student.status === 'active' ? 'disabled' : 'active';
    if (!window.confirm(`确认${status === 'active' ? '启用' : '停用'} ${student.name}？`)) return;
    try { await updateAdminStudent(student.id, { status }); await load(); }
    catch (requestError) { setError(messageOf(requestError)); }
  };

  const resetPassword = async (student) => {
    const value = window.prompt(`为 ${student.name} 设置临时密码（至少 8 位）`);
    if (!value) return;
    try {
      await resetAdminStudentPassword(student.id, value);
      window.alert('密码已重置，学生下次登录必须修改密码。');
      await load();
    } catch (requestError) { setError(messageOf(requestError)); }
  };

  const editStudent = async (student) => {
    const name = window.prompt('学生姓名', student.name);
    if (!name) return;
    const username = window.prompt('登录用户名', student.username);
    if (!username) return;
    const email = window.prompt('学生邮箱', student.email || '');
    if (!email) return;
    try { await updateAdminStudent(student.id, { name, username, email }); await load(); }
    catch (requestError) { setError(messageOf(requestError)); }
  };

  const retry = async () => {
    const date = window.prompt('补发日期（YYYY-MM-DD）');
    if (!date) return;
    const reason = window.prompt('补发原因');
    if (!reason) return;
    try { await retryNotificationRun(date, reason); await load(); }
    catch (requestError) { setError(messageOf(requestError)); }
  };

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div><h1>系统管理</h1><span className="muted">{admin?.name} · {admin?.email}</span></div>
        <button className="btn btn--ghost" onClick={async () => {
          await supabase.auth.signOut(); navigate('/admin/login', { replace: true });
        }}>退出</button>
      </header>
      {error && <div className="alert alert--error">{error}</div>}

      <section className="panel admin-section">
        <div className="section-heading"><h2>学生用户</h2>
          <input placeholder="搜索姓名或用户名" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <form className="inline-form" onSubmit={addStudent}>
          <input placeholder="姓名" value={studentForm.name} onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })} required />
          <input placeholder="用户名" value={studentForm.username} onChange={(e) => setStudentForm({ ...studentForm, username: e.target.value })} required />
          <input type="email" placeholder="学生邮箱" value={studentForm.email} onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })} required />
          <input type="password" placeholder="临时密码（至少 8 位）" value={studentForm.temporary_password} onChange={(e) => setStudentForm({ ...studentForm, temporary_password: e.target.value })} minLength="8" required />
          <button className="btn btn--primary">新增学生</button>
        </form>
        <div className="table-scroll"><table><thead><tr><th>姓名</th><th>用户名</th><th>邮箱</th><th>状态</th><th>改密</th><th>最后登录</th><th>操作</th></tr></thead>
          <tbody>{students.map((student) => <tr key={student.id}>
            <td>{student.name}</td><td>{student.username}</td><td>{student.email || <strong className="text-danger">待补充</strong>}</td>
            <td>{student.status === 'active' ? '启用' : '停用'}</td>
            <td>{student.must_change_password ? '待修改' : '正常'}</td>
            <td>{student.last_login_at ? new Date(student.last_login_at).toLocaleString() : '—'}</td>
            <td className="actions"><button onClick={() => editStudent(student)}>编辑</button>
              <button onClick={() => resetPassword(student)}>重置密码</button>
              <button onClick={() => toggleStudent(student)}>{student.status === 'active' ? '停用' : '启用'}</button></td>
          </tr>)}</tbody></table></div>
      </section>

      <section className="panel admin-section">
        <div className="section-heading"><h2>邮件发送记录</h2><button className="btn btn--ghost" onClick={retry}>手动补发</button></div>
        <div className="table-scroll"><table><thead><tr><th>日期</th><th>状态</th><th>次数</th><th>收件人</th><th>完成时间</th><th>错误</th></tr></thead>
          <tbody>{runs.map((run) => <tr key={run.id}><td>{run.report_date}</td><td>{run.status}</td>
            <td>{run.attempt_count}</td><td>{run.recipient_count}</td>
            <td>{run.finished_at ? new Date(run.finished_at).toLocaleString() : '—'}</td>
            <td>{run.error_summary || '—'}</td></tr>)}</tbody></table></div>
      </section>

      <section className="panel admin-section">
        <h2>管理员审计记录</h2>
        <div className="table-scroll"><table><thead><tr><th>时间</th><th>管理员</th><th>操作</th><th>目标学生</th><th>变更摘要</th></tr></thead>
          <tbody>{auditLogs.map((log) => <tr key={log.id}>
            <td>{new Date(log.created_at).toLocaleString()}</td>
            <td>{log.actor?.name || '—'}</td><td>{log.action}</td>
            <td>{log.target_student?.name || '—'}</td>
            <td><code>{JSON.stringify(log.change_summary)}</code></td>
          </tr>)}</tbody></table></div>
      </section>
    </main>
  );
}
