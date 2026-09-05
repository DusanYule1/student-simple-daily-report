import { getDb } from '../db';
import { ApiError } from '../errors';
import {
  resolveMailChannel,
  sendViaSmtp,
  writeMailPreview,
} from './smtpSender';

const deliverMail = async (
  recipients: string[],
  subject: string,
  html: string,
  reportDate: string,
): Promise<void> => {
  const channel = resolveMailChannel();
  if (channel === 'smtp') {
    await sendViaSmtp(recipients, subject, html);
    console.log(`[smtp-mail] 已通过 SMTP 发送 ${recipients.length} 封日报邮件`);
    return;
  }
  if (channel === 'resend') {
    await sendResendBatch(recipients, subject, html, reportDate);
    return;
  }
  if (channel === 'local-preview') {
    writeMailPreview(reportDate, recipients, subject, html);
    return;
  }
  throw new Error('未配置邮件发送渠道（RESEND_API_KEY 或 SMTP_*）');
};

const sendResendBatch = async (
  recipients: string[],
  subject: string,
  html: string,
  reportDate: string,
): Promise<void> => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey) throw new Error('RESEND_API_KEY 未配置');
  if (!from) throw new Error('RESEND_FROM_EMAIL 未配置');

  for (let offset = 0; offset < recipients.length; offset += 100) {
    const batch = recipients.slice(offset, offset + 100).map((recipient) => ({
      from,
      to: [recipient],
      subject,
      html,
    }));
    const batchNumber = Math.floor(offset / 100) + 1;
    const response = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `daily-report-${reportDate}-${batchNumber}`,
      },
      body: JSON.stringify(batch),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(`Resend 发送失败：${body?.message || response.statusText}`);
    }
  }
};

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

import { renderMailMarkdown } from './mailMarkdown';

const labels: Record<string, string> = {
  satisfied: '满意',
  average: '一般',
  dissatisfied: '不满意',
  other: '其他',
};

// 与前端看板 .evaluation-* 配色保持一致。
const evaluationColors: Record<keyof typeof labels, string> = {
  satisfied: '#dcfce7',
  average: '#fef9c3',
  dissatisfied: '#fee2e2',
  other: '#e5e7eb',
};

const renderText = (value: unknown): string => renderMailMarkdown(value);

// "未提交名单"的间隔口径：距最近一次提交空了几个自然日。
// 查询窗口（天）之外没有提交记录的学生视为从未提交，不进名单。
export const MISSING_WINDOW_DAYS = 90;

const diffDays = (from: string, to: string): number =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`))
      / 86_400_000,
  );

export const daysSinceLastSubmission = (
  submittedDates: string[],
  reportDate: string,
): number | null => {
  const windowStart = new Date(`${reportDate}T00:00:00Z`);
  windowStart.setUTCDate(windowStart.getUTCDate() - MISSING_WINDOW_DAYS);
  const windowStartIso = windowStart.toISOString().slice(0, 10);
  const latest = submittedDates
    .filter((date) => date >= windowStartIso && date < reportDate)
    .sort()
    .at(-1);
  if (!latest) return null;
  return diffDays(latest, reportDate);
};

export const sendDailyReportMail = async (reportDate: string) => {
  const db = getDb();
  const { count: attempts, error: attemptsError } = await db
    .from('notification_runs')
    .select('id', { count: 'exact', head: true })
    .eq('report_date', reportDate);
  if (attemptsError) throw attemptsError;

  const { data: run, error: runError } = await db
    .from('notification_runs')
    .insert({
      report_date: reportDate,
      status: 'running',
      attempt_count: (attempts || 0) + 1,
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (runError?.code === '23505') {
    throw new ApiError(409, 'STATE_CONFLICT', '该日期的邮件正在发送');
  }
  if (runError) throw runError;

  try {
    const windowStart = new Date(`${reportDate}T00:00:00Z`);
    windowStart.setUTCDate(windowStart.getUTCDate() - MISSING_WINDOW_DAYS);
    const [
      { data: students, error: studentsError },
      { data: reports, error: reportsError },
      { data: recentSubmissions, error: recentSubmissionsError },
    ] = await Promise.all([
      db.from('students')
        .select('id, name, username, email').eq('status', 'active').order('name'),
      db.from('daily_reports').select(`
        report_date, self_evaluation, today_summary, tomorrow_plan, other_notes,
        students!inner (id, name, username, status)
      `).eq('report_date', reportDate).eq('students.status', 'active'),
      db.from('daily_reports')
        .select('student_id, report_date')
        .gte('report_date', windowStart.toISOString().slice(0, 10))
        .lte('report_date', reportDate),
    ]);
    if (studentsError) throw studentsError;
    if (reportsError) throw reportsError;
    if (recentSubmissionsError) throw recentSubmissionsError;
    if (!students?.length) throw new Error('没有启用的学生，无法发送每日邮件');
    // 无邮箱的学生跳过发送（邮件仍是全班日报，缺邮箱只影响其个人副本）。
    const recipients = students
      .map((student: any) => student.email as string | null)
      .filter((email: string | null): email is string => Boolean(email));
    if (!recipients.length) {
      throw new Error('没有任何学生配置了邮箱，无法发送每日邮件');
    }

    const counts = { satisfied: 0, average: 0, dissatisfied: 0, other: 0 };
    for (const report of reports || []) {
      counts[report.self_evaluation as keyof typeof counts] += 1;
    }
    const missing = Math.max(0, students.length - (reports?.length || 0));
    const submittedByStudent = new Map<string, string[]>();
    for (const row of recentSubmissions || []) {
      const list = submittedByStudent.get(row.student_id as string) || [];
      list.push(row.report_date as string);
      submittedByStudent.set(row.student_id as string, list);
    }
    type MissingEntry = { student: any; gap: number };
    const missingStudents = students
      .filter((student: any) => !(reports || []).some((report: any) => {
        const embedded = Array.isArray(report.students) ? report.students[0] : report.students;
        return embedded?.id === student.id;
      }))
      .map((student: any): { student: any; gap: number | null } => ({
        student,
        gap: daysSinceLastSubmission(submittedByStudent.get(student.id) || [], reportDate),
      }))
      .filter((entry: { student: any; gap: number | null }): entry is MissingEntry => entry.gap !== null)
      .sort((a: MissingEntry, b: MissingEntry) => b.gap - a.gap);
    const missingList = missingStudents
      .map((entry: MissingEntry) => `<li style="color:#b91c1c;">${escapeHtml(entry.student.name)} (${escapeHtml(entry.student.username)}) (${entry.gap})</li>`)
      .join('');
    const evaluationKeys = ['satisfied', 'average', 'dissatisfied', 'other'] as const;
    const distribution = evaluationKeys
      .filter((key) => counts[key] > 0)
      .map((key) => `<li style="color:#334155;"><span style="background:${evaluationColors[key]}; padding:1px 8px; border-radius:4px; font-weight:bold;">${escapeHtml(labels[key])}</span>: ${counts[key]} 人</li>`)
      .join('');
    const details = (reports || []).map((report: any) => {
      const student = Array.isArray(report.students) ? report.students[0] : report.students;
      const evaluation = report.self_evaluation as keyof typeof labels;
      const color = evaluationColors[evaluation] || '#ffffff';
      return `<li style="background-color:${color}; padding:12px 16px; border-radius:6px; margin-bottom:16px;">
        <strong>${escapeHtml(student.name)} (${escapeHtml(student.username)})</strong>
        · ${escapeHtml(labels[evaluation])}<br>
        <strong>今日总结</strong><br>${renderText(report.today_summary)}<br>
        <strong>明日计划</strong><br>${renderText(report.tomorrow_plan)}<br>
        <strong>其他说明</strong><br>${renderText(report.other_notes)}
      </li>`;
    }).join('');
    const boardUrl = process.env.MAIL_BOARD_URL?.trim();
    const boardLink = boardUrl
      ? `\n      <p><a href="${escapeHtml(boardUrl)}" rel="noopener noreferrer">详情可查看 ${escapeHtml(boardUrl)} 的进展看板。</a></p>`
      : '';
    const html = `<h2>📅 ${reportDate} 学习进度日报</h2>
      <p>今天有 ${reports?.length || 0} 人提交了进度${missing > 0 ? `，未提交 ${missing} 人` : ''}。${boardLink}
      </p>
      ${distribution ? `<h3>📊 自评分布</h3><ul>${distribution}</ul>` : ''}
      ${missingList ? `<h3>⚠️ 未提交名单（${missingStudents.length} 人）</h3><ul>${missingList}</ul>` : ''}
      <h3>👥 详细情况</h3><ul>${details || '<li>当日无人提交。</li>'}</ul>
      <p><em>—— 自动化日报系统</em></p>`;

    await deliverMail(
      recipients,
      `📊 ${reportDate} 学习进度日报`,
      html,
      reportDate,
    );

    const finishedAt = new Date().toISOString();
    const { data: completed, error: updateError } = await db
      .from('notification_runs')
      .update({
        status: 'succeeded',
        recipient_count: recipients.length,
        finished_at: finishedAt,
      })
      .eq('id', run.id).select('*').single();
    if (updateError) throw updateError;
    return completed;
  } catch (error) {
    await db.from('notification_runs').update({
      status: 'failed',
      error_summary: error instanceof Error ? error.message.slice(0, 1000) : 'Unknown error',
      finished_at: new Date().toISOString(),
    }).eq('id', run.id);
    throw error;
  }
};
