import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as nodeTest from 'node:test';
import { ensureLocalDatabase } from '../src/local/bootstrap';
import { route } from '../src/router';
import { businessDate } from '../src/time';

const { before, test } = nodeTest;

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.RESEND_API_KEY;
delete process.env.RESEND_FROM_EMAIL;
process.env.LOCAL_SQLITE_DB = join(
  mkdtempSync(join(tmpdir(), 'sdr-local-test-')),
  'local.sqlite3',
);

before(async () => {
  await ensureLocalDatabase();
  await loginAdmin();
  zhangweiCookie = await loginStudent('zhangwei', 'student-123456');
});

const yearMonth = businessDate().slice(0, 7);

const call = async (
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Response> => {
  const response = await route(new Request(`http://localhost/api/v1${path}`, {
    method,
    headers: {
      ...headers,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  if (response.status !== 204) {
    const text = await response.clone().text();
    assert.match(text, /"request_id":"[^"]+"/, 'every payload carries a request id');
  }
  return response;
};

const loginStudent = async (username: string, password: string) => {
  const response = await call('POST', '/student/session', { username, password });
  assert.equal(response.status, 200, `login ${username} should succeed`);
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  return cookie as string;
};

let adminToken = '';
const loginAdmin = async () => {
  const login = await call('POST', '/admin/session', {
    email: 'admin@example.com',
    password: 'local-admin-123',
  });
  assert.equal(login.status, 200);
  adminToken = ((await login.json()) as { data: { token: string } }).data.token;
};
const adminHeaders = () => ({ authorization: `Bearer ${adminToken}` });
let zhangweiCookie = '';

test('local admin session issues a verifiable bearer token', async () => {
  const me = await call('GET', '/admin/me', undefined, adminHeaders());
  assert.equal(me.status, 200);
  const { data } = await me.json();
  assert.equal(data.email, 'admin@example.com');
  assert.equal(data.name, '系统管理员');

  const badLogin = await call('POST', '/admin/session', {
    email: 'admin@example.com',
    password: 'wrong-password',
  });
  assert.equal(badLogin.status, 401);
});

test('seeded students see the monthly board with seeded activity', async () => {
  const board = await call('GET', `/board/monthly?month=${yearMonth}`, undefined, {
    cookie: zhangweiCookie,
  });
  assert.equal(board.status, 200);
  const { data } = await board.json();
  const zhangwei = data.students.find((row: any) => row.student.name === '张伟');
  assert.ok(zhangwei, 'zhangwei should be on the board');
  assert.ok(zhangwei.summary.submitted > 0, 'seeded reports should count');
  assert.ok(
    zhangwei.activities.some((activity: any) => activity.report_id),
    'seeded activity days should carry report ids',
  );
  const disabledLiu = data.students.find((row: any) => row.student.name === '刘洋');
  assert.equal(disabledLiu, undefined, 'disabled students stay off the board');
});

test('board shows all ten active students from the thirteen-student seed', async () => {
  const board = await call('GET', `/board/monthly?month=${yearMonth}`, undefined, {
    cookie: zhangweiCookie,
  });
  const { data } = await board.json();
  assert.equal(data.students.length, 10, 'ten active students on the board');

  const diligent = data.students.find((row: any) => row.student.name === '张伟');
  assert.ok(diligent);
  assert.ok(diligent.summary.submitted >= 1, 'diligent style shows current month activity');

  const spotty = data.students.find((row: any) => row.student.name === '赵磊');
  assert.ok(spotty);
  assert.ok(
    spotty.summary.submitted <= diligent.summary.submitted,
    'spotty style leaves visible gaps on the board',
  );

  const leave = data.students.find((row: any) => row.student.name === '孙悦');
  assert.ok(leave);
  assert.ok(
    leave.summary.submitted <= diligent.summary.submitted,
    'leave style shows a lighter row than diligent',
  );
});

test('board search mirrors rpc behaviour and consistent counters', async () => {
  const mine = await call(
    'GET',
    `/board/monthly?month=${yearMonth}&q=${encodeURIComponent('李')}`,
    undefined,
    { cookie: zhangweiCookie },
  );
  assert.equal(mine.status, 200);
  const { data } = await mine.json();
  assert.deepEqual(data.students.map((row: any) => row.student.name), ['李娜']);
  const lina = data.students[0];
  assert.equal(
    lina.summary.submitted,
    lina.summary.satisfied + lina.summary.average
      + lina.summary.dissatisfied + lina.summary.other,
  );
});

test('student submits today report with prefill and upsert semantics', async () => {
  const todayBefore = await call('GET', '/reports/today', undefined, { cookie: zhangweiCookie });
  assert.equal(todayBefore.status, 200);
  const beforeBody = ((await todayBefore.json()) as any).data;
  assert.ok(beforeBody.business_date);
  assert.ok(beforeBody.report, 'zhangwei already submitted today via seed');
  assert.ok(
    beforeBody.report.tomorrow_plan === null
      || typeof beforeBody.report.tomorrow_plan === 'string',
    'seeded today report carries readable fields',
  );

  const submitted = await call('PUT', '/reports/today', {
    self_evaluation: 'satisfied',
    today_summary: '完成本地 shim 联调',
    tomorrow_plan: '继续验证看板',
    other_notes: '无',
  }, { cookie: zhangweiCookie });
  assert.equal(submitted.status, 200, 're-submitting a seeded day upserts');
  const firstBody = ((await submitted.json()) as any).data;
  assert.equal(firstBody.student.name, '张伟');

  const resubmitted = await call('PUT', '/reports/today', {
    self_evaluation: 'average',
    today_summary: '重复提交应为更新',
  }, { cookie: zhangweiCookie });
  assert.equal(resubmitted.status, 200, 'same business date upserts instead of duplicating');
  const secondBody = ((await resubmitted.json()) as any).data;
  assert.equal(secondBody.self_evaluation, 'average');
  assert.equal(secondBody.id, firstBody.id);
});

test('first-time password flow blocks reports until password changed', async () => {
  const adminCreate = await call('POST', '/admin/students', {
    name: '陈新',
    username: 'chenxin',
    email: 'chenxin@example.com',
    temporary_password: 'temp-pass-123',
  }, adminHeaders());
  assert.equal(adminCreate.status, 201);

  const createdLogin = await loginStudent('chenxin', 'temp-pass-123');
  const blocked = await call('GET', '/reports/today', undefined, { cookie: createdLogin });
  assert.equal(blocked.status, 403);
  const changed = await call('PUT', '/student/password', {
    current_password: 'temp-pass-123',
    new_password: 'chenxin-8888',
  }, { cookie: createdLogin });
  assert.equal(changed.status, 204);
  const newCookie = changed.headers.get('set-cookie')?.split(';')[0];
  const allowed = await call('GET', '/reports/today', undefined, { cookie: newCookie as string });
  assert.equal(allowed.status, 200);
});

test('admin can list, search and disable students with audit trail', async () => {
  const listed = await call('GET', '/admin/students?page=1&page_size=50', undefined, adminHeaders());
  assert.equal(listed.status, 200);
  const listBody = ((await listed.json()) as any);
  assert.ok(listBody.data.length >= 13, 'thirteen seeded students plus chenxin');
  assert.ok(listBody.meta.total >= listBody.data.length);

  const searched = await call('GET', '/admin/students?q=chen', undefined, adminHeaders());
  assert.equal(searched.status, 200);
  assert.deepEqual(
    ((await searched.json()) as any).data.map((row: any) => row.username).sort(),
    ['chenchen', 'chenxin'],
  );

  const target = listBody.data.find((row: any) => row.username === 'chenxin');
  const disabled = await call('PATCH', `/admin/students/${target.id}`, {
    status: 'disabled',
  }, adminHeaders());
  assert.equal(disabled.status, 200);

  const revokedLogin = await call('POST', '/student/session', {
    username: 'chenxin',
    password: 'chenxin-8888',
  });
  assert.equal(revokedLogin.status, 401, 'disabled student cannot log in');

  const audit = await call('GET', '/admin/audit-logs?page=1&page_size=20', undefined, adminHeaders());
  assert.equal(audit.status, 200);
  const disabledAction = ((await audit.json()) as any).data
    .find((row: any) => row.action === 'student.disabled');
  assert.ok(disabledAction, 'status change lands in audit log');
  assert.equal(disabledAction.actor.name, '系统管理员');
  assert.equal(disabledAction.target_student.name, '陈新');
});

test('duplicate username and duplicate recipient email return 409', async () => {
  const duplicated = await call('POST', '/admin/students', {
    name: '重复学生',
    username: 'zhangwei',
    email: 'another@example.com',
    temporary_password: 'some-password',
  }, adminHeaders());
  assert.equal(duplicated.status, 409);

  const recipient = await call('POST', '/admin/notification-recipients', {
    email: 'teacher@example.com',
    display_name: '王老师',
  }, adminHeaders());
  assert.equal(recipient.status, 201);
  const duplicatedRecipient = await call('POST', '/admin/notification-recipients', {
    email: 'teacher@example.com',
    display_name: '王老师',
  }, adminHeaders());
  assert.equal(duplicatedRecipient.status, 409);
});

test('daily mail retry writes a local preview file and run record', async () => {
  // 取 3 天前的业务日：种子在该天有规律性缺勤（fluctuating/spotty），可验证未提交名单。
  const mailDate = (() => {
    const date = new Date(`${businessDate()}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 3);
    return date.toISOString().slice(0, 10);
  })();
  const retried = await call('POST', `/admin/notification-runs/${mailDate}/retry`, {
    reason: '本地演示补发',
  }, adminHeaders());
  assert.equal(retried.status, 202);
  const runBody = ((await retried.json()) as any).data;
  assert.equal(runBody.status, 'succeeded');

  const previewPath = `${process.env.LOCAL_SQLITE_DB}.mail/${mailDate}.html`;
  const html = readFileSync(previewPath, 'utf8');
  assert.match(html, /学习进度日报/);
  assert.match(html, /张伟/);
  assert.match(html, /📅/);
  assert.match(html, /📊 自评分布/);
  assert.match(html, /今天有 \d+ 人提交了进度/);
  assert.match(html, /#dcfce7|#fef9c3|#fee2e2|#e5e7eb/);
  assert.match(html, /—— 自动化日报系统/);
  // 未提交名单：列出缺口学生并标注距最近提交的空天数
  assert.match(html, /未提交名单（\d+ 人）/);
  assert.match(html, /\(\w+\) \(\d+\)/);

  const runs = await call(
    'GET',
    '/admin/notification-runs?page=1&page_size=10',
    undefined,
    adminHeaders(),
  );
  assert.equal(runs.status, 200);
  const run = ((await runs.json()) as any).data[0];
  assert.equal(run.report_date, mailDate);
  assert.ok(run.recipient_count >= 3, 'every active student receives a copy');
});

test('admin can create a student without email and mail run skips them', async () => {
  const created = await call('POST', '/admin/students', {
    name: '无邮箱生',
    username: 'noemail',
    temporary_password: 'noemail-pass-123',
  }, adminHeaders());
  assert.equal(created.status, 201, 'email is optional on create');
  const createdBody = ((await created.json()) as any).data;
  assert.equal(createdBody.email, null);

  // 首次登录改密后提交一份日报，让无邮箱学生也出现在日报统计里
  const login = await loginStudent('noemail', 'noemail-pass-123');
  const changed = await call('PUT', '/student/password', {
    current_password: 'noemail-pass-123',
    new_password: 'noemail-8888',
  }, { cookie: login });
  assert.equal(changed.status, 204);
  const newCookie = changed.headers.get('set-cookie')?.split(';')[0] as string;
  const submitted = await call('PUT', '/reports/today', {
    self_evaluation: 'satisfied',
    today_summary: '无邮箱学生也能正常提交日报',
  }, { cookie: newCookie });
  assert.ok([200, 201].includes(submitted.status), 'no-email student can submit reports');

  // 补发当日邮件：无邮箱学生被跳过，但日报统计仍包含 TA
  const retried = await call('POST', `/admin/notification-runs/${businessDate()}/retry`, {
    reason: '无邮箱跳过验证',
  }, adminHeaders());
  assert.equal(retried.status, 202);
  const runBody = ((await retried.json()) as any).data;
  assert.equal(runBody.status, 'succeeded');
  assert.equal(runBody.recipient_count, 10, "10 seeded actives with email; the no-email student is skipped");

  const html = readFileSync(
    `${process.env.LOCAL_SQLITE_DB}.mail/${businessDate()}.html`,
    'utf8',
  );
  assert.match(html, /无邮箱生/, 'no-email student still appears in the report body');
});

test('range listing and single day lookup expose serialized reports', async () => {
  const board = await call('GET', `/board/monthly?month=${yearMonth}`, undefined, {
    cookie: zhangweiCookie,
  });
  const { data: boardData } = await board.json();
  const zhangwei = boardData.students.find((row: any) => row.student.name === '张伟');
  const withReport = zhangwei.activities.find((activity: any) => activity.report_id);
  assert.ok(withReport, 'zhangwei has a submitted day to inspect');

  const detail = await call(
    'GET',
    `/students/${zhangwei.student.id}/reports/${withReport.date}`,
    undefined,
    { cookie: zhangweiCookie },
  );
  assert.equal(detail.status, 200);
  assert.equal(((await detail.json()) as any).data.student.name, '张伟');

  const range = await call(
    'GET',
    `/students/${zhangwei.student.id}/reports?start_date=${withReport.date}&end_date=${withReport.date}&include_missing=true&page_size=31`,
    undefined,
    { cookie: zhangweiCookie },
  );
  assert.equal(range.status, 200);
  const rangeBody = ((await range.json()) as any).data;
  assert.equal(rangeBody.summary.submitted, 1);
  assert.equal(rangeBody.student.name, '张伟');
});

test('openapi documents the local admin session endpoints', () => {
  const source = readFileSync('docs/openapi.yaml', 'utf8');
  assert.match(source, /^  \/admin\/session:\s*$/m);
  assert.match(source, /^    post:\s*$/m);
  assert.match(source, /^    delete:\s*$/m);
});