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

const renderText = (value: unknown): string =>
  escapeHtml(value || '无').replaceAll('\n', '<br>');

const labels: Record<string, string> = {
  satisfied: '满意',
  average: '一般',
  dissatisfied: '不满意',
  other: '其他',
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
    const [
      { data: students, error: studentsError },
      { data: reports, error: reportsError },
    ] = await Promise.all([
      db.from('students')
        .select('id, name, username, email').eq('status', 'active').order('name'),
      db.from('daily_reports').select(`
        report_date, self_evaluation, today_summary, tomorrow_plan, other_notes,
        students!inner (name, username, status)
      `).eq('report_date', reportDate).eq('students.status', 'active'),
    ]);
    if (studentsError) throw studentsError;
    if (reportsError) throw reportsError;
    if (!students?.length) throw new Error('没有启用的学生，无法发送每日邮件');
    const missingEmailStudents = students.filter((student: any) => !student.email);
    if (missingEmailStudents.length) {
      throw new Error(
        `以下启用学生缺少邮箱：${missingEmailStudents.map((student: any) => student.name).join('、')}`,
      );
    }
    const recipients = students.map((student: any) => student.email as string);

    const counts = { satisfied: 0, average: 0, dissatisfied: 0, other: 0 };
    for (const report of reports || []) {
      counts[report.self_evaluation as keyof typeof counts] += 1;
    }
    const missing = Math.max(0, students.length - (reports?.length || 0));
    const details = (reports || []).map((report: any) => {
      const student = Array.isArray(report.students) ? report.students[0] : report.students;
      return `<li style="margin-bottom:20px">
        <strong>${escapeHtml(student.name)} (${escapeHtml(student.username)})</strong>
        · ${escapeHtml(labels[report.self_evaluation])}<br>
        <strong>今日总结</strong><br>${renderText(report.today_summary)}<br>
        <strong>明日计划</strong><br>${renderText(report.tomorrow_plan)}<br>
        <strong>其他说明</strong><br>${renderText(report.other_notes)}
      </li>`;
    }).join('');
    const html = `<h2>${reportDate} 学生日报汇总</h2>
      <p>已提交 ${reports?.length || 0} 人，未提交 ${missing} 人；
      满意 ${counts.satisfied}，一般 ${counts.average}，
      不满意 ${counts.dissatisfied}，其他 ${counts.other}。</p>
      <h3>日报详情</h3><ul>${details || '<li>当日无人提交</li>'}</ul>`;

    await deliverMail(
      recipients,
      `${reportDate} 学习进度日报`,
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
