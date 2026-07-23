import { notFound } from './errors';
import { errorResponse, requestId } from './http';
import { getMonthlyBoard } from './routes/board';
import {
  getStudentSession,
  loginStudent,
  logoutStudent,
  updateStudentPassword,
} from './routes/studentAuth';
import {
  getStudentReportByDate,
  getOwnReportByDate,
  getTodayReport,
  listStudentReports,
  upsertTodayReport,
  upsertOwnReportByDate,
} from './routes/reports';
import { listVisibleStudents } from './routes/students';
import {
  createAdminStudent,
  getAdminMe,
  getAdminStudent,
  listAdminStudents,
  resetAdminStudentPassword,
  revokeAdminStudentSessions,
  updateAdminStudent,
} from './routes/adminStudents';
import {
  createNotificationRecipient,
  listNotificationRecipients,
  listNotificationRuns,
  retryNotificationRun,
  updateNotificationRecipient,
} from './routes/adminNotifications';
import { listAdminAuditLogs } from './routes/adminAudit';

const apiPath = (request: Request): string => {
  const path = new URL(request.url).pathname;
  const marker = '/api/v1';
  const index = path.indexOf(marker);
  if (index >= 0) return path.slice(index + marker.length) || '/';
  return path.replace(/^\/\.netlify\/functions\/api/, '') || '/';
};

export const route = async (request: Request): Promise<Response> => {
  const id = requestId(request);
  const path = apiPath(request);
  const method = request.method.toUpperCase();

  try {
    if (path === '/student/session' && method === 'POST') {
      return await loginStudent(request, id);
    }
    if (path === '/student/session' && method === 'GET') {
      return await getStudentSession(request, id);
    }
    if (path === '/student/session' && method === 'DELETE') {
      return await logoutStudent(request);
    }
    if (path === '/student/password' && method === 'PUT') {
      return await updateStudentPassword(request);
    }
    if (path === '/students' && method === 'GET') {
      return await listVisibleStudents(request, id);
    }
    if (path === '/board/monthly' && method === 'GET') {
      return await getMonthlyBoard(request, id);
    }
    if (path === '/reports/today' && method === 'GET') {
      return await getTodayReport(request, id);
    }
    if (path === '/reports/today' && method === 'PUT') {
      return await upsertTodayReport(request, id);
    }
    if (path === '/admin/me' && method === 'GET') {
      return await getAdminMe(request, id);
    }
    if (path === '/admin/students' && method === 'GET') {
      return await listAdminStudents(request, id);
    }
    if (path === '/admin/students' && method === 'POST') {
      return await createAdminStudent(request, id);
    }
    if (path === '/admin/audit-logs' && method === 'GET') {
      return await listAdminAuditLogs(request, id);
    }
    if (path === '/admin/notification-recipients' && method === 'GET') {
      return await listNotificationRecipients(request, id);
    }
    if (path === '/admin/notification-recipients' && method === 'POST') {
      return await createNotificationRecipient(request, id);
    }
    if (path === '/admin/notification-runs' && method === 'GET') {
      return await listNotificationRuns(request, id);
    }

    const adminStudentMatch = path.match(/^\/admin\/students\/([^/]+)$/);
    if (adminStudentMatch && method === 'GET') {
      return await getAdminStudent(request, id, adminStudentMatch[1]);
    }
    if (adminStudentMatch && method === 'PATCH') {
      return await updateAdminStudent(request, id, adminStudentMatch[1]);
    }
    const adminPasswordMatch = path.match(
      /^\/admin\/students\/([^/]+)\/temporary-password$/,
    );
    if (adminPasswordMatch && method === 'POST') {
      return await resetAdminStudentPassword(request, adminPasswordMatch[1]);
    }
    const adminSessionsMatch = path.match(/^\/admin\/students\/([^/]+)\/sessions$/);
    if (adminSessionsMatch && method === 'DELETE') {
      return await revokeAdminStudentSessions(request, id, adminSessionsMatch[1]);
    }
    const recipientMatch = path.match(
      /^\/admin\/notification-recipients\/([^/]+)$/,
    );
    if (recipientMatch && method === 'PATCH') {
      return await updateNotificationRecipient(request, id, recipientMatch[1]);
    }
    const retryMatch = path.match(
      /^\/admin\/notification-runs\/(\d{4}-\d{2}-\d{2})\/retry$/,
    );
    if (retryMatch && method === 'POST') {
      return await retryNotificationRun(request, id, retryMatch[1]);
    }

    const reportMatch = path.match(
      /^\/students\/([^/]+)\/reports\/(\d{4}-\d{2}-\d{2})$/,
    );
    if (reportMatch && method === 'GET') {
      return await getStudentReportByDate(
        request,
        id,
        reportMatch[1],
        reportMatch[2],
      );
    }
    const reportListMatch = path.match(/^\/students\/([^/]+)\/reports$/);
    if (reportListMatch && method === 'GET') {
      return await listStudentReports(request, id, reportListMatch[1]);
    }
    const ownReportMatch = path.match(/^\/reports\/(\d{4}-\d{2}-\d{2})$/);
    if (ownReportMatch && method === 'GET') {
      return await getOwnReportByDate(request, id, ownReportMatch[1]);
    }
    if (ownReportMatch && method === 'PUT') {
      return await upsertOwnReportByDate(request, id, ownReportMatch[1]);
    }

    throw notFound('接口不存在');
  } catch (error) {
    return errorResponse(error, id);
  }
};
