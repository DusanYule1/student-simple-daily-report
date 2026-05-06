// frontend/src/components/ProgressTable.jsx
import React, { useState, useEffect, useRef } from 'react';
import { getProgressByDate } from '../services/api';

function ProgressTable({ students, progressMap, dateRange, onDateRangeChange }) {
  const [detail, setDetail] = useState(null);
  // 以 Asia/Shanghai 时区获取“今天”的 YYYY-MM-DD
  const formatShanghaiDate = (d) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  const today = formatShanghaiDate(new Date());

  const getDatesInRange = (startDate, endDate) => {
    if (!startDate || !endDate || startDate > endDate) return [];

    const dates = [];
    const current = new Date(startDate + 'T00:00:00Z');
    const last = new Date(endDate + 'T00:00:00Z');

    while (current <= last) {
      dates.push(formatShanghaiDate(current));
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return dates;
  };

  const dates = getDatesInRange(dateRange.startDate, dateRange.endDate);

  // 为今天这一列创建 ref
  const todayRef = useRef(null);

  // 自动滚动到今天列
  useEffect(() => {
    if (todayRef.current) {
      todayRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [dates, today]);

  const getColorStyle = (color) => {
    const colors = {
      green: '#4ade80',
      lightgreen: '#a7f3d0',
      yellow: '#fbbf24',
      lightred: '#fca5a5',
      red: '#ef4444',
      lightgrey: '#d1d5db',
    };
    return { backgroundColor: colors[color] || 'transparent' };
  };

  const SEPARATOR = '\n------\n';

  const parseMainWork = (raw) => {
    const idx = (raw || '').indexOf(SEPARATOR);
    if (idx === -1) return { main_work: raw || '', tomorrow_plan: '' };
    return {
      main_work: raw.slice(0, idx),
      tomorrow_plan: raw.slice(idx + SEPARATOR.length),
    };
  };

  const showDetail = async (studentId, date) => {
    try {
      const res = await getProgressByDate(studentId, date);
      const parsed = parseMainWork(res.data.main_work);
      setDetail({ ...res.data, main_work: parsed.main_work, tomorrow_plan: parsed.tomorrow_plan });
    } catch (err) {
      setDetail({ error: '无法加载详情' });
    }
  };

  const closeDetail = () => setDetail(null);

  return (
    <div className="mb-4">
      <div className="form-row mb-3" style={{ gap: '12px', flexWrap: 'wrap' }}>
        <h2 className="heading" style={{ marginBottom: 0 }}>进展看板</h2>
        <label className="label">
          开始日期：
          <input
            type="date"
            value={dateRange.startDate}
            max={dateRange.endDate}
            className="input input--xs ml-2"
            onChange={(e) =>
              onDateRangeChange((prev) => ({
                startDate: e.target.value,
                endDate: prev.endDate < e.target.value ? e.target.value : prev.endDate,
              }))
            }
          />
        </label>
        <label className="label">
          结束日期：
          <input
            type="date"
            value={dateRange.endDate}
            min={dateRange.startDate}
            className="input input--xs ml-2"
            onChange={(e) =>
              onDateRangeChange((prev) => ({
                startDate: prev.startDate > e.target.value ? e.target.value : prev.startDate,
                endDate: e.target.value,
              }))
            }
          />
        </label>
      </div>
      <table>
        <thead>
          <tr>
            <th className="sticky-col name-col">学生</th>
            {dates.map((d) => (
              <th
                key={d}
                ref={d === today ? todayRef : null}
                className={`cell ${d === today ? 'is-today' : ''}`}
                style={{ fontWeight: 'bold' }}
              >
                {d.split('-').slice(1).join('-')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.id}>
              <td className="sticky-col name-col" style={{ fontWeight: 'bold' }}>
                {student.name}
              </td>
              {dates.map((date) => {
                const key = `${student.id}_${date}`;
                const progress = progressMap[key];
                const color = progress ? progress.color : 'lightgrey';
                return (
                  <td
                    key={date}
                    className="cell"
                    style={getColorStyle(color)}
                    onClick={() => showDetail(student.id, date)}
                  >
                    {progress ? `${progress.work_time}/${progress.effective_time}` : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* 详情弹窗 */}
      {detail && (
        <div className="modalOverlay" onClick={closeDetail}>
          <div className="modalContent" onClick={(e) => e.stopPropagation()}>
            <button className="modalClose" onClick={closeDetail} aria-label="关闭">×</button>
            <div className="modalHeader">
              <h3 style={{ margin: 0 }}>{detail.error ? '加载失败' : `${detail.date} 进展详情`}</h3>
            </div>
            <div className="grid">
              {detail.error ? (
                <p className="text-danger">{detail.error}</p>
              ) : (
                <>
                  <p><strong>工作时间：</strong>{detail.work_time} 小时</p>
                  <p><strong>有效时间：</strong>{detail.effective_time} 小时</p>
                  <p>
                    <strong>主要工作：</strong>
                    <span style={{ whiteSpace: 'pre-wrap' }}>{detail.main_work || '无'}</span>
                  </p>
                  <p>
                    <strong>明日计划：</strong>
                    <span style={{ whiteSpace: 'pre-wrap' }}>{detail.tomorrow_plan || '无'}</span>
                  </p>
                  <p>
                    <strong>困难：</strong>
                    <span style={{ whiteSpace: 'pre-wrap' }}>{detail.difficulty || '无'}</span>
                  </p>
                </>
              )}
            </div>
            <div style={{ textAlign: 'right', marginTop: 'var(--space-4)' }}>
              <button onClick={closeDetail} className="btn btn--ghost">关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProgressTable;
