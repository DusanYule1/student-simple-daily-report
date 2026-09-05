import React, { useMemo } from 'react';

const labels = {
  satisfied: '满意',
  average: '一般',
  dissatisfied: '不满意',
  other: '其他',
};

const WEEKDAY_LABELS = ['一', '', '三', '', '五', '', '日'];
const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const isoDate = (date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

const shanghaiToday = () => isoDate(new Date());

// GitHub 风格提交格子图：列=周，行=周一…周日，颜色复用现有 evaluation-* 分类色。
function ContributionHeatmap({ reports }) {
  const { weeks, monthSpans, today } = useMemo(() => {
    const byDate = new Map();
    (reports || []).forEach((report) => {
      byDate.set(report.report_date, report.self_evaluation);
    });

    const todayIso = shanghaiToday();
    // 结束=今天；起点=今天往前推到整周（周一），再补齐 12 周余量对齐 3 个月窗口。
    const todayDate = new Date(`${todayIso}T00:00:00`);
    const endDate = addDays(todayDate, 1);
    const firstDow = (todayDate.getDay() + 6) % 7; // 周一=0
    const gridStart = addDays(todayDate, -(firstDowOf13Weeks(firstDow, todayDate)));
    const weeks = [];
    for (let cursor = new Date(gridStart); cursor < endDate; cursor = addDays(cursor, 7)) {
      const week = [];
      for (let d = 0; d < 7; d += 1) {
        const day = addDays(cursor, d);
        const iso = isoDate(day);
        week.push({
          date: iso,
          dayOfMonth: day.getDate(),
          evaluation: byDate.get(iso) || null,
          future: iso > todayIso,
        });
      }
      weeks.push(week);
    }

    // 月份标签：记录每个月第一次出现的列索引
    const monthSpans = [];
    weeks.forEach((week, index) => {
      const month = Number(week[0].date.slice(5, 7));
      const last = monthSpans[monthSpans.length - 1];
      if (last && last.month === month) {
        last.span += 1;
      } else {
        monthSpans.push({ month, span: 1 });
      }
      void index;
    });

    return { weeks, monthSpans, today: todayIso };
  }, [reports]);

  return (
    <section className="section heatmap-section">
      <h2>近 3 个月活跃度</h2>
      <div className="heatmap-scroll" role="img" aria-label="近 3 个月日报活跃度格子图">
        <div className="heatmap">
          <div className="heatmap__months">
            {monthSpans.map(({ month, span }) => (
              <span key={`${month}-${span}`} style={{ gridColumn: `span ${span}` }}>
                {MONTH_LABELS[month - 1]}
              </span>
            ))}
          </div>
          <div className="heatmap__body">
            <div className="heatmap__weekdays">
              {WEEKDAY_LABELS.map((label, index) => (
                <span key={index}>{label}</span>
              ))}
            </div>
            <div className="heatmap__grid" style={{ '--heatmap-cols': weeks.length }}>
              {weeks.map((week, weekIndex) => (
                <div className="heatmap__col" key={weekIndex}>
                  {week.map((day) => {
                    const title = day.future
                      ? `${day.date} · 未来`
                      : `${day.date} · ${day.evaluation ? labels[day.evaluation] : '未提交'}`;
                    return (
                      <span
                        key={day.date}
                        className={[
                          'heatmap-day',
                          day.future ? 'heatmap-day--future' : `evaluation-${day.evaluation || 'missing'}`,
                          day.date === today ? 'is-today' : '',
                        ].filter(Boolean).join(' ')}
                        title={title}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="heatmap__legend">
        <span>少</span>
        <span className="heatmap-day evaluation-missing" title="未提交" />
        <span className="heatmap-day evaluation-other" title="其他" />
        <span className="heatmap-day evaluation-dissatisfied" title="不满意" />
        <span className="heatmap-day evaluation-average" title="一般" />
        <span className="heatmap-day evaluation-satisfied" title="满意" />
        <span>多</span>
        <span className="heatmap-legend__hint">颜色表示当天自评：浅绿=满意，黄=一般，红=不满意，灰=其他，白=未提交</span>
      </div>
    </section>
  );
}

// 今天往前退 13 周（91 天）并落到周一，作为格子图固定窗口起点。
const firstDowOf13Weeks = (firstDow, todayDate) => {
  const daysFor13Weeks = 13 * 7 - 1;
  const start = new Date(todayDate);
  start.setDate(start.getDate() - daysFor13Weeks);
  const startDow = (start.getDay() + 6) % 7;
  void firstDow;
  return daysFor13Weeks + (startDow - firstDow + 7) % 7;
};

export default ContributionHeatmap;
