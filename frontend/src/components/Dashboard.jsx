// frontend/src/components/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSession, logout, getStudents, getProgress, getProgressByDate, submitProgress } from '../services/api';
import ProgressTable from './ProgressTable';

function Dashboard() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [progressMap, setProgressMap] = useState({});
  const [currentUser, setCurrentUser] = useState(null); // 存储当前登录用户信息
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [todayData, setTodayData] = useState({
    work_time: 8,
    effective_time: 6,
    main_work: '',
    tomorrow_plan: '',
    difficulty: '',
  });
  const [submitStatus, setSubmitStatus] = useState('');
  const [toast, setToast] = useState({ visible: false, type: 'success', message: '' });
  const [activeTab, setActiveTab] = useState('table'); // 'table' or 'form'

  const SEPARATOR = '\n------\n';

  const parseMainWork = (raw) => {
    const idx = (raw || '').indexOf(SEPARATOR);
    if (idx === -1) return { main_work: raw || '', tomorrow_plan: '' };
    return {
      main_work: raw.slice(0, idx),
      tomorrow_plan: raw.slice(idx + SEPARATOR.length),
    };
  };

  const getPrevDate = (dateStr) => {
    const base = new Date(dateStr + 'T00:00:00Z');
    base.setUTCDate(base.getUTCDate() - 1);
    return base.toISOString().slice(0, 10);
  };
  const formatShanghaiDate = (d) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  const shiftDate = (dateStr, offsetDays) => {
    const base = new Date(dateStr + 'T00:00:00Z');
    base.setUTCDate(base.getUTCDate() + offsetDays);
    return formatShanghaiDate(base);
  };
  // 以 Asia/Shanghai 时区、03:00 为切分的“今天”（避免使用 UTC 的 toISOString）
  const computeAdjustedToday = () => {
    const now = new Date();
    const shanghaiHour = parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        hour12: false,
      }).format(now),
      10
    );

    if (shanghaiHour < 3) {
      // 归属到“前一天”的上海日期
      const shanghaiTodayStr = formatShanghaiDate(now);
      const base = new Date(shanghaiTodayStr + 'T00:00:00Z'); // 以字符串构造可稳定减一天
      const prev = new Date(base);
      prev.setUTCDate(base.getUTCDate() - 1);
      return formatShanghaiDate(prev);
    }
    return formatShanghaiDate(now);
  };
  const today = computeAdjustedToday();
  const MAX_MAIN = 2000;
  const MAX_DIFF = 2000;
  const getDateRangeForPastThreeWeeks = (todayStr) => ({
    startDate: shiftDate(todayStr, -20),
    endDate: todayStr,
  });
  const [dateRange, setDateRange] = useState(() => getDateRangeForPastThreeWeeks(today));

  // 当前用户 ID（从 session 获取）
  const currentStudentId = currentUser ? currentUser.id : null;

  useEffect(() => {
    const checkSessionAndLoadData = async () => {
      try {
        // 首先检查session并获取当前用户信息
        const sessionRes = await getSession();
        if (!sessionRes.data.logged_in) {
          navigate('/');
          return;
        }
        
        // 设置当前用户信息
        setCurrentUser(sessionRes.data.student);

        // 加载学生列表
        const sRes = await getStudents();
        setStudents(sRes.data);

        // 单独加载今日的完整数据用于表单填充（如果需要main_work和difficulty）
        const studentId = sessionRes.data.student.id;
        try {
          const todayRes = await getProgressByDate(studentId, today);
          const todayData_full = todayRes.data;
          const parsed = parseMainWork(todayData_full.main_work);
          setTodayData({
            work_time: todayData_full.work_time || 8,
            effective_time: todayData_full.effective_time || 6,
            main_work: parsed.main_work,
            tomorrow_plan: parsed.tomorrow_plan,
            difficulty: todayData_full.difficulty || '',
          });
        } catch (err) {
          // 今日无数据，尝试从昨天的明日计划中提取默认主要工作
          const base = {
            work_time: 8,
            effective_time: 6,
            main_work: '',
            tomorrow_plan: '',
            difficulty: '',
          };
          try {
            const prevRes = await getProgressByDate(studentId, getPrevDate(today));
            const prevParsed = parseMainWork(prevRes.data.main_work);
            base.main_work = prevParsed.tomorrow_plan;
          } catch (_) {
            // 昨天也没有数据，保持空
          }
          setTodayData(base);
        }
      } catch (err) {
        navigate('/');
      }
    };

    checkSessionAndLoadData();
  }, [navigate, today]);

  useEffect(() => {
    if (!currentUser) return;

    const loadProgress = async () => {
      try {
        const pRes = await getProgress(dateRange.startDate, dateRange.endDate);
        setProgressMap(pRes.data);
      } catch (err) {
        setProgressMap({});
      }
    };

    loadProgress();
  }, [currentUser, dateRange.startDate, dateRange.endDate]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const handleSubmit = async () => {
    if (!currentStudentId) {
      setSubmitStatus('用户信息未加载，请刷新页面重试');
      return;
    }

    // 表单校验
    const errors = {};
    const { work_time, effective_time, main_work, tomorrow_plan, difficulty } = todayData;
    if (typeof work_time !== 'number' || isNaN(work_time) || work_time < 0 || work_time > 24) {
      errors.work_time = '工作时间需为0-24的数字';
    }
    if (typeof effective_time !== 'number' || isNaN(effective_time) || effective_time < 0 || effective_time > 24) {
      errors.effective_time = '有效时间需为0-24的数字';
    }
    if ((main_work || '').length > MAX_MAIN) {
      errors.main_work = `主要工作字数不能超过${MAX_MAIN}`;
    }
    if ((tomorrow_plan || '').length > MAX_MAIN) {
      errors.tomorrow_plan = `明日计划字数不能超过${MAX_MAIN}`;
    }
    if ((difficulty || '').length > MAX_DIFF) {
      errors.difficulty = `困难描述字数不能超过${MAX_DIFF}`;
    }

    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      setSubmitStatus('请修正表单错误后再提交');
      return;
    }

    const merged_main_work = tomorrow_plan
      ? main_work + SEPARATOR + tomorrow_plan
      : main_work;

    setSubmitStatus('提交中...');
    setIsSubmitting(true);
    try {
      await submitProgress({
        work_time,
        effective_time,
        main_work: merged_main_work,
        difficulty,
      });
      setSubmitStatus('提交成功！');
      setToast({ visible: true, type: 'success', message: '提交成功' });
      setTimeout(() => setToast((t) => ({ ...t, visible: false })), 1800);
      setTimeout(() => setSubmitStatus(''), 3000);

      const pRes = await getProgress(dateRange.startDate, dateRange.endDate);
      setProgressMap(pRes.data);

      // 单独加载今日的完整数据用于更新表单状态
      try {
        const todayRes = await getProgressByDate(currentStudentId, today);
        const updated = todayRes.data;
        const parsed = parseMainWork(updated.main_work);
        setTodayData({
          work_time: updated.work_time || 8,
          effective_time: updated.effective_time || 6,
          main_work: parsed.main_work,
          tomorrow_plan: parsed.tomorrow_plan,
          difficulty: updated.difficulty || '',
        });
      } catch (err) {
        // 如果加载失败，至少更新基本字段
        const key = `${currentStudentId}_${today}`;
        const updated = pRes.data[key];
        if (updated) {
          setTodayData((prev) => ({
            ...prev,
            work_time: updated.work_time || 8,
            effective_time: updated.effective_time || 6,
          }));
        }
      }
    } catch (err) {
      const msg = '提交失败：' + (err.response?.data?.error || '未知错误');
      setSubmitStatus(msg);
      setToast({ visible: true, type: 'error', message: msg });
      setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2200);
    }
    finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`container ${activeTab === 'table' ? 'container--left container--fluid' : ''}`}>
      {/* Toast */}
      {toast.visible && (
        <div
          role="status"
          aria-live="polite"
          className={`toast is-visible ${toast.type === 'success' ? 'toast--success' : 'toast--error'}`}
        >
          {toast.message}
        </div>
      )}
      {/* 导航栏 */}
      <div className="navbar">
        <h1 className="navbar-title">学生进度记录系统</h1>
        <div className="navbar-actions">
          {currentUser && (
            <span className="subtle mr-3">{currentUser.name} · {today}（统计时间 03:00 至次日 03:00）</span>
          )}
          <button onClick={handleLogout} className="btn btn--ghost">登出</button>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="tabs mb-3">
        <button
          onClick={() => setActiveTab('table')}
          className={`tab ${activeTab === 'table' ? 'is-active' : ''}`}
        >
          查看进展表格
        </button>
        <button
          onClick={() => setActiveTab('form')}
          className={`tab ${activeTab === 'form' ? 'is-active' : ''}`}
        >
          填写今日进展
        </button>
      </div>

      {/* 表格标签页 */}
      {activeTab === 'table' && (
        <ProgressTable
          students={students}
          progressMap={progressMap}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        />
      )}

      {/* 填写进展标签页 */}
      {activeTab === 'form' && (
        <div className="section narrow">
          <h2 className="heading">填写今日进展（统计时间 03:00 至次日 03:00）</h2>
          <form className="grid">
            <div className="grid grid--2cols">
              <div className="form-row">
                <label className="label">工作时间（小时）：</label>
                <input
                  type="number"
                  value={todayData.work_time}
                  onChange={(e) =>
                    setTodayData({
                      ...todayData,
                      work_time: parseInt(e.target.value) || 0,
                    })
                  }
                  min="0"
                  max="24"
                  className={`input input--xs ${formErrors.work_time ? 'is-invalid' : ''}`}
                  aria-invalid={!!formErrors.work_time}
                  aria-describedby={formErrors.work_time ? 'err-work-time' : undefined}
                />
                {formErrors.work_time && (
                  <span id="err-work-time" className="field-error ml-2">{formErrors.work_time}</span>
                )}
              </div>
              <div className="form-row">
                <label className="label">有效时间（小时）：</label>
                <input
                  type="number"
                  value={todayData.effective_time}
                  onChange={(e) =>
                    setTodayData({
                      ...todayData,
                      effective_time: parseInt(e.target.value) || 0,
                    })
                  }
                  min="0"
                  max="24"
                  className={`input input--xs ${formErrors.effective_time ? 'is-invalid' : ''}`}
                  aria-invalid={!!formErrors.effective_time}
                  aria-describedby={formErrors.effective_time ? 'err-effective-time' : undefined}
                />
                {formErrors.effective_time && (
                  <span id="err-effective-time" className="field-error ml-2">{formErrors.effective_time}</span>
                )}
              </div>
            </div>
            
            <div className="form-group">
              <label className="label">主要工作（≤2000字）：</label>
              <textarea
                value={todayData.main_work}
                onChange={(e) =>
                  setTodayData({ ...todayData, main_work: e.target.value })
                }
                rows="6"
                className={`input ${formErrors.main_work ? 'is-invalid' : ''}`}
                placeholder="请描述今天的主要工作内容..."
                maxLength={MAX_MAIN}
                aria-invalid={!!formErrors.main_work}
                aria-describedby={formErrors.main_work ? 'err-main-work' : undefined}
              />
              <div className="text-muted mt-1">{todayData.main_work.length}/{MAX_MAIN}</div>
              {formErrors.main_work && (
                <div id="err-main-work" className="field-error mt-1">{formErrors.main_work}</div>
              )}
            </div>

            <div className="form-group">
              <label className="label">明日计划（≤2000字）：</label>
              <textarea
                value={todayData.tomorrow_plan}
                onChange={(e) =>
                  setTodayData({ ...todayData, tomorrow_plan: e.target.value })
                }
                rows="6"
                className={`input ${formErrors.tomorrow_plan ? 'is-invalid' : ''}`}
                placeholder="请描述明天的工作计划..."
                maxLength={MAX_MAIN}
                aria-invalid={!!formErrors.tomorrow_plan}
                aria-describedby={formErrors.tomorrow_plan ? 'err-tomorrow-plan' : undefined}
              />
              <div className="text-muted mt-1">{todayData.tomorrow_plan.length}/{MAX_MAIN}</div>
              {formErrors.tomorrow_plan && (
                <div id="err-tomorrow-plan" className="field-error mt-1">{formErrors.tomorrow_plan}</div>
              )}
            </div>
            
            <div className="form-group">
              <label className="label">遇到的困难（≤2000字）：</label>
              <textarea
                value={todayData.difficulty}
                onChange={(e) =>
                  setTodayData({ ...todayData, difficulty: e.target.value })
                }
                rows="6"
                className={`input ${formErrors.difficulty ? 'is-invalid' : ''}`}
                placeholder="请描述遇到的问题或困难..."
                maxLength={MAX_DIFF}
                aria-invalid={!!formErrors.difficulty}
                aria-describedby={formErrors.difficulty ? 'err-difficulty' : undefined}
              />
              <div className="text-muted mt-1">{todayData.difficulty.length}/{MAX_DIFF}</div>
              {formErrors.difficulty && (
                <div id="err-difficulty" className="field-error mt-1">{formErrors.difficulty}</div>
              )}
            </div>
            
            <div className="form-group">
              <button
                type="button"
                onClick={handleSubmit}
                className={`btn btn--primary ${isSubmitting ? 'is-loading' : ''}`}
                disabled={isSubmitting}
              >
                {isSubmitting ? '正在提交...' : '提交今日进展'}
              </button>
              {submitStatus && (
                <p className={`${submitStatus.includes('成功') ? 'text-success' : submitStatus.includes('提交中') ? 'text-muted' : 'text-danger'} mt-2`}>
                  {submitStatus}
                </p>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
