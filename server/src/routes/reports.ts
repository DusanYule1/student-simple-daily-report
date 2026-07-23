import { z } from 'zod';
import { getDb } from '../db';
import { badRequest, notFound } from '../errors';
import { json, parseJson, positiveIntegerParam } from '../http';
import { authenticateStudent } from '../security/session';
import { authenticateViewer } from '../security/viewer';
import { clearMonthlyBoardCache } from '../services/monthlyBoardCache';
import { businessDate } from '../time';

const reportSchema = z.object({
  self_evaluation: z.enum([
    'satisfied',
    'average',
    'dissatisfied',
    'other',
  ]),
  today_summary: z.string().nullable().optional(),
  tomorrow_plan: z.string().nullable().optional(),
  other_notes: z.string().nullable().optional(),
}).strict();

const reportSelect = `
  id,
  report_date,
  self_evaluation,
  today_summary,
  tomorrow_plan,
  other_notes,
  created_at,
  updated_at,
  students!inner (id, name, status)
`;

const serializeReport = (row: any) => {
  const student = Array.isArray(row.students) ? row.students[0] : row.students;
  return {
    id: row.id,
    student: { id: student.id, name: student.name },
    report_date: row.report_date,
    self_evaluation: row.self_evaluation,
    today_summary: row.today_summary,
    tomorrow_plan: row.tomorrow_plan,
    other_notes: row.other_notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

const previousDate = (date: string): string => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
};

const isValidDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export const getTodayReport = async (
  request: Request,
  id: string,
): Promise<Response> => {
  const principal = await authenticateStudent(request);
  const date = businessDate();
  const { data: report, error } = await getDb()
    .from('daily_reports')
    .select(reportSelect)
    .eq('student_id', principal.id)
    .eq('report_date', date)
    .maybeSingle();
  if (error) throw error;

  let prefill = { today_summary: '', tomorrow_plan: '', other_notes: '' };
  if (!report) {
    const { data: previous, error: previousError } = await getDb()
      .from('daily_reports')
      .select('tomorrow_plan')
      .eq('student_id', principal.id)
      .eq('report_date', previousDate(date))
      .maybeSingle();
    if (previousError) throw previousError;
    prefill = {
      ...prefill,
      today_summary: previous?.tomorrow_plan || '',
    };
  }

  return json({
    business_date: date,
    report: report ? serializeReport(report) : null,
    prefill,
  }, id);
};

const upsertReportForDate = async (
  request: Request,
  id: string,
  reportDate: string,
): Promise<Response> => {
  const principal = await authenticateStudent(request);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    throw badRequest('日期格式必须是 YYYY-MM-DD');
  }
  const parsed = reportSchema.safeParse(await parseJson(request));
  if (!parsed.success) {
    throw badRequest('日报内容不正确', parsed.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      reason: issue.message,
    })));
  }

  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await getDb()
    .from('daily_reports')
    .select('id')
    .eq('student_id', principal.id)
    .eq('report_date', reportDate)
    .maybeSingle();
  if (existingError) throw existingError;

  const { data, error } = await getDb()
    .from('daily_reports')
    .upsert({
      student_id: principal.id,
      report_date: reportDate,
      ...parsed.data,
      updated_at: now,
    }, {
      onConflict: 'student_id,report_date',
    })
    .select(reportSelect)
    .single();
  if (error) throw error;
  clearMonthlyBoardCache();
  return json(serializeReport(data), id, existing ? 200 : 201);
};

export const upsertTodayReport = (
  request: Request,
  id: string,
): Promise<Response> => upsertReportForDate(request, id, businessDate());

export const getOwnReportByDate = async (
  request: Request,
  id: string,
  reportDate: string,
): Promise<Response> => {
  const principal = await authenticateStudent(request);
  if (!isValidDate(reportDate)) throw badRequest('日报日期格式不正确');
  const { data, error } = await getDb().from('daily_reports')
    .select(reportSelect)
    .eq('student_id', principal.id)
    .eq('report_date', reportDate)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('日报不存在');
  return json(serializeReport(data), id);
};

export const upsertOwnReportByDate = async (
  request: Request,
  id: string,
  reportDate: string,
): Promise<Response> => {
  if (!isValidDate(reportDate)) throw badRequest('日报日期格式不正确');
  if (reportDate > businessDate()) throw badRequest('不能填写未来日期的日报');
  return upsertReportForDate(request, id, reportDate);
};

export const getStudentReportByDate = async (
  request: Request,
  id: string,
  studentId: string,
  reportDate: string,
): Promise<Response> => {
  await authenticateViewer(request);
  if (!isValidDate(reportDate)) throw badRequest('日报日期格式不正确');
  const { data, error } = await getDb()
    .from('daily_reports')
    .select(reportSelect)
    .eq('student_id', studentId)
    .eq('report_date', reportDate)
    .eq('students.status', 'active')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('日报不存在');
  return json(serializeReport(data), id);
};

export const listStudentReports = async (
  request: Request,
  id: string,
  studentId: string,
): Promise<Response> => {
  await authenticateViewer(request);
  const url = new URL(request.url);
  const startDate = url.searchParams.get('start_date') || '';
  const endDate = url.searchParams.get('end_date') || '';
  if (
    !isValidDate(startDate) ||
    !isValidDate(endDate) ||
    startDate > endDate
  ) {
    throw badRequest('开始和结束日期不正确');
  }
  const rangeDays = Math.floor(
    (new Date(`${endDate}T00:00:00Z`).getTime() -
      new Date(`${startDate}T00:00:00Z`).getTime()) / 86_400_000,
  ) + 1;
  if (rangeDays > 366) throw badRequest('单次查询不能超过 366 天');

  const page = positiveIntegerParam(url.searchParams, 'page', 1, 1_000_000);
  const pageSize = positiveIntegerParam(url.searchParams, 'page_size', 31, 100);
  const ascending = url.searchParams.get('sort') === 'date_asc';
  const includeMissing = url.searchParams.get('include_missing') === 'true';

  const { data: student, error: studentError } = await getDb()
    .from('students')
    .select('id, name')
    .eq('id', studentId)
    .eq('status', 'active')
    .maybeSingle();
  if (studentError) throw studentError;
  if (!student) throw notFound('学生不存在');

  const { data, error } = await getDb().from('daily_reports')
    .select(`
      id, report_date, self_evaluation, today_summary,
      tomorrow_plan, other_notes, created_at, updated_at
    `)
    .eq('student_id', studentId)
    .gte('report_date', startDate)
    .lte('report_date', endDate)
    .order('report_date', { ascending });
  if (error) throw error;

  const submittedRows = data || [];
  const summary = submittedRows.reduce((acc: Record<string, number>, report: any) => {
    acc.submitted += 1;
    acc[report.self_evaluation] += 1;
    return acc;
  }, {
    submitted: 0,
    satisfied: 0,
    average: 0,
    dissatisfied: 0,
    other: 0,
  });
  let allRows: Array<Record<string, unknown>> = submittedRows;
  if (includeMissing) {
    const byDate = new Map(submittedRows.map((report) => [report.report_date, report]));
    const dates: string[] = [];
    const cursor = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    while (cursor <= end) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    if (!ascending) dates.reverse();
    allRows = dates.map((date) => byDate.get(date) || {
      id: null,
      report_date: date,
      self_evaluation: null,
      today_summary: null,
      tomorrow_plan: null,
      other_notes: null,
      created_at: null,
      updated_at: null,
    });
  }
  const total = allRows.length;
  const from = (page - 1) * pageSize;
  const rows = allRows.slice(from, from + pageSize);

  return json({
    student,
    range: { start_date: startDate, end_date: endDate },
    summary,
    reports: rows,
  }, id, 200, {
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: Math.ceil(total / pageSize),
    },
  });
};
