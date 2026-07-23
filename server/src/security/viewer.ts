import { authenticateAdmin } from './admin';
import { authenticateStudent } from './session';

export const authenticateViewer = async (request: Request) => {
  if (request.headers.get('authorization')?.match(/^Bearer\s+/i)) {
    const admin = await authenticateAdmin(request);
    return { role: 'admin' as const, id: admin.id };
  }
  const student = await authenticateStudent(request);
  return { role: 'student' as const, id: student.id };
};
