import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getMonthlyBoard,
  getProgressByDate,
  getSession,
  getTodayReport,
  logout,
  submitProgress,
} from '../services/api';
import MonthActivityCalendar from './MonthActivityCalendar';

const evaluationOptions = [
  { value: 'satisfied', label: '满意' },
  { value: 'average', label: '一般' },
  { value: 'dissatisfied', label: '不满意' },
  { value: 'other', label: '其他' },
];

const currentMonth = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date()).slice(0, 7);

const shiftMonth = (month, offset) => {
  const [year, value] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, value - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

const emptyForm = {
  self_evaluation: 'satisfied',
  today_summary: '',
  tomorrow_plan: '',
  other_notes: '',
};

function Dashboard() {
  const [session, setSession] = useState(null);
  const [month, setMonth] = useState(currentMonth);
  const [board, setBoard] = useState([]);
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('board');
  const [form, setForm] = useState(emptyForm);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    getSession()
      .then(({ data }) => {
        const value = data.data;
        if (value.student.must_change_password) {
          navigate('/change-password', { replace: true });
          return;
        }
        setSession(value);
      })
      .catch(() => navigate('/', { replace: true }));
  }, [navigate]);

  const loadBoard = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getMonthlyBoard(month, query);
      setBoard(data.data.students);
    } catch (error) {
      if (error.response?.status === 401) {
        navigate('/', { replace: true });
      } else {
        setMessage(error.response?.data?.error?.message || '看板加载失败');
      }
    } finally {
      setLoading(false);
    }
  }, [month, query, navigate]);

  useEffect(() => {
    if (session) loadBoard();
  }, [session, loadBoard]);

  useEffect(() => {
    if (!session || activeTab !== 'form') return;
    getTodayReport()
      .then(({ data }) => {
        const payload = data.data;
        const source = payload.report || payload.prefill || emptyForm;
        setForm({
          self_evaluation: source.self_evaluation || 'satisfied',
          today_summary: source.today_summary || '',
          tomorrow_plan: source.tomorrow_plan || '',
          other_notes: source.other_notes || '',
        });
      })
      .catch(() => setMessage('今日日报加载失败'));
  }, [session, activeTab]);

  const monthLabel = useMemo(() => {
    const [year, value] = month.split('-');
    return `${year} 年 ${Number(value)} 月`;
  }, [month]);

  const monthDays = useMemo(() => {
    const [year, value] = month.split('-').map(Number);
    const count = new Date(Date.UTC(year, value, 0)).getUTCDate();
    return Array.from({ length: count }, (_, index) => index + 1);
  }, [month]);

  const handleDayClick = async (student, activity) => {
    if (activity.openTimeline) {
      navigate(`/people/${student.id}/reports`);
      return;
    }
    setDetail(null);
    setDetailLoading(true);
    setMessage('');
    try {
      const { data } = await getProgressByDate(student.id, activity.date);
      setDetail(data.data);
    } catch {
      setMessage('日报详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      await submitProgress(form);
      setSaveSuccess(true);
      await Promise.all([
        loadBoard(),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
      setActiveTab('board');
      setSaveSuccess(false);
    } catch (error) {
      setMessage(error.response?.data?.error?.message || '日报提交失败');
      setSaveSuccess(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <main className="container container--fluid">
      <header className="navbar">
        <div>
          <h1 className="navbar-title">学生日报</h1>
          {session && <span className="subtle">你好，{session.student.name}</span>}
        </div>
        <div className="navbar-actions">
          <button className="btn btn--ghost" onClick={() => navigate('/change-password')}>
            修改密码
          </button>
          <button className="btn btn--ghost" onClick={handleLogout}>退出</button>
        </div>
      </header>

      <div className="tabs mb-4">
        <button
          className={`tab ${activeTab === 'board' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('board')}
        >
          月度看板
        </button>
        <button
          className={`tab ${activeTab === 'form' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('form')}
        >
          填写今日日报
        </button>
      </div>

      {message && <div className="notice mb-3">{message}</div>}

      {activeTab === 'board' && (
        <section>
          <div className="board-toolbar">
            <div className="month-nav">
              <button className="btn btn--ghost" onClick={() => setMonth(shiftMonth(month, -1))}>
                上个月
              </button>
              <strong>{monthLabel}</strong>
              <button className="btn btn--ghost" onClick={() => setMonth(shiftMonth(month, 1))}>
                下个月
              </button>
              <button className="btn btn--ghost" onClick={() => setMonth(currentMonth())}>
                回到本月
              </button>
            </div>
            <input
              className="input board-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索学生姓名"
            />
          </div>

          <div className="evaluation-legend">
            {evaluationOptions.map((option) => (
              <span key={option.value}>
                <i className={`legend-dot evaluation-${option.value}`} />
                {option.label}
              </span>
            ))}
            <span><i className="legend-dot evaluation-missing" />未提交</span>
          </div>

          {loading ? (
            <p className="text-muted">正在加载看板...</p>
          ) : (
            <div className="activity-board-scroll">
              <div className="activity-card-list">
                {!!board.length && (
                  <div
                    className="activity-table-header"
                    style={{ '--activity-days': monthDays.length }}
                    aria-hidden="true"
                  >
                    <span className="activity-table-header__name">学生</span>
                    <div className="activity-table-header__days">
                      {monthDays.map((day) => (
                        <span key={day}>{day % 5 === 1 ? day : ''}</span>
                      ))}
                    </div>
                  </div>
                )}
                {board.map((item) => (
                  <MonthActivityCalendar
                    key={item.student.id}
                    student={item.student}
                    activities={item.activities}
                    onDayClick={(activity) => handleDayClick(item.student, activity)}
                  />
                ))}
                {!board.length && <p className="text-muted">没有匹配的学生。</p>}
              </div>
            </div>
          )}
        </section>
      )}

      {activeTab === 'form' && (
        <section className="section narrow">
          <h2 className="heading">填写今日日报</h2>
          <form className="report-form" onSubmit={handleSubmit}>
            <fieldset className="evaluation-picker">
              <legend className="label">自我评价</legend>
              {evaluationOptions.map((option) => (
                <label key={option.value} className={`evaluation-option evaluation-${option.value}`}>
                  <input
                    type="radio"
                    name="self_evaluation"
                    checked={form.self_evaluation === option.value}
                    onChange={() => setForm({ ...form, self_evaluation: option.value })}
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>
            <label className="label">
              今日总结
              <textarea
                className="input"
                rows="7"
                value={form.today_summary}
                onChange={(event) => setForm({ ...form, today_summary: event.target.value })}
              />
            </label>
            <label className="label">
              明日计划
              <textarea
                className="input"
                rows="7"
                value={form.tomorrow_plan}
                onChange={(event) => setForm({ ...form, tomorrow_plan: event.target.value })}
              />
            </label>
            <label className="label">
              其他说明
              <textarea
                className="input"
                rows="7"
                value={form.other_notes}
                onChange={(event) => setForm({ ...form, other_notes: event.target.value })}
                placeholder="遇到的困难、需要的支持或其他备注"
              />
            </label>
            <button className="btn btn--primary" type="submit" disabled={submitting}>
              {submitting ? '正在保存…' : '保存日报'}
            </button>
          </form>
        </section>
      )}

      {saveSuccess && (
        <div className="success-popup" role="status" aria-live="polite">
          <div className="success-popup__icon">✓</div>
          <strong>保存成功</strong>
          <span>即将返回月度看板…</span>
        </div>
      )}

      {detailLoading && (
        <div className="modalOverlay" role="status" aria-live="polite">
          <div className="detail-loading">
            <span className="detail-loading__spinner" aria-hidden="true" />
            <strong>正在加载日报详情</strong>
            <span>请稍候…</span>
          </div>
        </div>
      )}

      {detail && (
        <div className="modalOverlay" onClick={() => setDetail(null)}>
          <article className="modalContent report-detail" onClick={(event) => event.stopPropagation()}>
            <button className="modalClose" onClick={() => setDetail(null)} aria-label="关闭">×</button>
            <h2>{detail.student.name} · {detail.report_date}</h2>
            <p><strong>自我评价：</strong>{
              evaluationOptions.find((item) => item.value === detail.self_evaluation)?.label
            }</p>
            <h3>今日总结</h3>
            <p className="pre-wrap">{detail.today_summary || '无'}</p>
            <h3>明日计划</h3>
            <p className="pre-wrap">{detail.tomorrow_plan || '无'}</p>
            <h3>其他说明</h3>
            <p className="pre-wrap">{detail.other_notes || '无'}</p>
          </article>
        </div>
      )}
    </main>
  );
}

export default Dashboard;
