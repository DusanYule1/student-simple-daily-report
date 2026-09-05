import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ContributionHeatmap from './ContributionHeatmap';
import { getStudentReportRange } from '../services/api';

const isoDate = (date) => date.toISOString().slice(0, 10);
const monthsAgo = (months) => {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return isoDate(date);
};

const labels = {
  satisfied: '满意',
  average: '一般',
  dissatisfied: '不满意',
  other: '其他',
};

function PersonTimeline() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState(monthsAgo(3));
  const [endDate, setEndDate] = useState(isoDate(new Date()));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError('');
    getStudentReportRange(studentId, {
      start_date: startDate,
      end_date: endDate,
      sort: 'date_desc',
      page_size: 100,
    })
      .then((response) => setData(response.data.data))
      .catch((err) => {
        if (err.response?.status === 401) navigate('/', { replace: true });
        else setError(err.response?.data?.error?.message || '历史日报加载失败');
      })
      .finally(() => setLoading(false));
  }, [studentId, startDate, endDate, navigate]);

  const summary = useMemo(() => data?.summary || {}, [data]);

  return (
    <main className="container timeline-page">
      <button className="btn btn--ghost mb-3" onClick={() => navigate('/dashboard')}>
        返回看板
      </button>
      <section className="section">
        <div className="timeline-header">
          <div>
            <h1 className="heading">{data?.student?.name || '工作详情'}</h1>
            <p className="text-muted">查看指定时间段内的全部日报</p>
          </div>
          <div className="timeline-filters">
            <label>
              开始日期
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label>
              结束日期
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>
        </div>
        {data && (
          <div className="timeline-summary">
            <span>共提交 {summary.submitted || 0} 天</span>
            <span>满意 {summary.satisfied || 0}</span>
            <span>一般 {summary.average || 0}</span>
            <span>不满意 {summary.dissatisfied || 0}</span>
            <span>其他 {summary.other || 0}</span>
          </div>
        )}
      </section>

      {data && <ContributionHeatmap reports={data.reports} />}

      {error && <p className="text-danger">{error}</p>}
      {loading ? <p className="text-muted">正在加载...</p> : (
        <div className="timeline-list">
          {(data?.reports || []).map((report) => (
            <article key={report.id} className="card timeline-entry">
              <header>
                <time>{report.report_date}</time>
                <span className={`status-chip evaluation-${report.self_evaluation}`}>
                  {labels[report.self_evaluation]}
                </span>
              </header>
              <h3>今日总结</h3>
              <p className="pre-wrap">{report.today_summary || '无'}</p>
              <h3>明日计划</h3>
              <p className="pre-wrap">{report.tomorrow_plan || '无'}</p>
              <h3>其他说明</h3>
              <p className="pre-wrap">{report.other_notes || '无'}</p>
            </article>
          ))}
          {!loading && !data?.reports?.length && <p className="text-muted">该时间段暂无日报。</p>}
        </div>
      )}
    </main>
  );
}

export default PersonTimeline;
