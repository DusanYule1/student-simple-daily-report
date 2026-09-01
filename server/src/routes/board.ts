import { getDb } from '../db';
import { badRequest } from '../errors';
import { json } from '../http';
import { authenticateViewer } from '../security/viewer';
import {
  getCachedMonthlyBoard,
  monthlyBoardCacheKey,
  setCachedMonthlyBoard,
} from '../services/monthlyBoardCache';
import { businessDate, datesInMonth, monthBounds } from '../time';

type Evaluation = 'very_satisfied' | 'satisfied' | 'average' | 'dissatisfied' | 'other';

interface RpcActivity {
  date: string;
  report_id: string;
  self_evaluation: Evaluation;
}

interface RpcRow {
  student_id: string;
  student_name: string;
  activities: RpcActivity[] | null;
  submitted_count: number | string;
  very_satisfied_count: number | string;
  satisfied_count: number | string;
  average_count: number | string;
  dissatisfied_count: number | string;
  other_count: number | string;
}

export const getMonthlyBoard = async (
  request: Request,
  id: string,
): Promise<Response> => {
  await authenticateViewer(request);
  const url = new URL(request.url);
  const month = url.searchParams.get('month') || '';
  let bounds;
  try {
    bounds = monthBounds(month);
  } catch {
    throw badRequest('月份格式必须是 YYYY-MM', [
      { field: 'month', reason: '必须使用 YYYY-MM 格式' },
    ]);
  }

  const search = url.searchParams.get('q')?.trim() || null;
  const cacheKey = monthlyBoardCacheKey(month, search);
  const cached = getCachedMonthlyBoard<Record<string, unknown>>(cacheKey);
  if (cached) {
    return json(cached, id, 200, {}, {
      'Cache-Control': 'private, max-age=30',
      'X-Board-Cache': 'HIT',
    });
  }

  const { data, error } = await getDb().rpc('get_monthly_board', {
    p_month_start: bounds.start,
    p_next_month_start: bounds.next,
    p_search: search,
  });
  if (error) throw error;

  const dates = datesInMonth(month);
  const today = businessDate();
  const students = ((data || []) as RpcRow[]).map((row) => {
    const activityByDate = new Map(
      (row.activities || []).map((activity) => [activity.date, activity]),
    );
    const activities = dates.map((date) => {
      const activity = activityByDate.get(date);
      return {
        date,
        report_id: activity?.report_id || null,
        self_evaluation: activity?.self_evaluation || null,
      };
    });
    const missingElapsedDays = activities.filter(
      (activity) => activity.date <= today && !activity.report_id,
    ).length;

    return {
      student: {
        id: row.student_id,
        name: row.student_name,
      },
      summary: {
        submitted: Number(row.submitted_count),
        very_satisfied: Number(row.very_satisfied_count),
        satisfied: Number(row.satisfied_count),
        average: Number(row.average_count),
        dissatisfied: Number(row.dissatisfied_count),
        other: Number(row.other_count),
        missing_elapsed_days: missingElapsedDays,
      },
      activities,
    };
  });

  const result = {
    month,
    timezone: 'Asia/Shanghai',
    business_day_cutoff: '03:00',
    students,
  };
  setCachedMonthlyBoard(cacheKey, result);

  return json(result, id, 200, {}, {
    'Cache-Control': 'private, max-age=30',
    'X-Board-Cache': 'MISS',
  });
};
