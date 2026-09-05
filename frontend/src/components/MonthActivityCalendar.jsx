import React from 'react';

const labels = {
  satisfied: '满意',
  average: '一般',
  dissatisfied: '不满意',
  other: '其他',
};

const shanghaiToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

function MonthActivityCalendar({ student, activities, onDayClick }) {
  const today = shanghaiToday();
  return (
    <article
      className="activity-row"
      style={{ '--activity-days': activities.length }}
    >
      <div className="activity-row__student">
        <button
          type="button"
          className="activity-card__student"
          onClick={() => onDayClick({ openTimeline: true })}
        >
          {student.name}
        </button>
      </div>
      <div className="activity-row__days" aria-label={`${student.name} 月度日报状态`}>
        {activities.map((activity) => {
          const label = activity.self_evaluation
            ? labels[activity.self_evaluation]
            : '未提交';
          return (
            <button
              key={activity.date}
              type="button"
              className={[
                'activity-day',
                `evaluation-${activity.self_evaluation || 'missing'}`,
                activity.date === today ? 'is-today' : '',
              ].filter(Boolean).join(' ')}
              title={`${activity.date} · ${label}`}
              aria-label={`${activity.date} ${label}`}
              onClick={() => activity.report_id && onDayClick(activity)}
              disabled={!activity.report_id}
            >
              <span className="sr-only">
                {Number(activity.date.slice(-2))} 日 · {label}
              </span>
            </button>
          );
        })}
      </div>
    </article>
  );
}

export default MonthActivityCalendar;
