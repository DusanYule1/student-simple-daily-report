const SHANGHAI = 'Asia/Shanghai';

const partsAtShanghai = (instant: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
};

export const businessDate = (instant = new Date()): string => {
  const parts = partsAtShanghai(instant);
  const base = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  if (Number(parts.hour) < 3) {
    base.setUTCDate(base.getUTCDate() - 1);
  }
  return base.toISOString().slice(0, 10);
};

export const monthBounds = (month: string) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error('INVALID_MONTH');
  }
  const [year, value] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, value - 1, 1));
  const next = new Date(Date.UTC(year, value, 1));
  return {
    start: start.toISOString().slice(0, 10),
    next: next.toISOString().slice(0, 10),
    days: Math.round((next.getTime() - start.getTime()) / 86_400_000),
  };
};

export const datesInMonth = (month: string): string[] => {
  const { start, days } = monthBounds(month);
  const cursor = new Date(`${start}T00:00:00Z`);
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(cursor);
    day.setUTCDate(cursor.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
};

