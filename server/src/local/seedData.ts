import { hashPassword } from '../security/password';

export type SeedReport = {
  date: string;
  selfEvaluation: 'satisfied' | 'average' | 'dissatisfied' | 'other';
  todaySummary: string;
  tomorrowPlan: string;
  otherNotes: string;
};

export type SeedStudent = {
  name: string;
  username: string;
  email: string;
  status: 'active' | 'disabled';
  passwordHash: string;
  reports: SeedReport[];
};

const dayShift = (base: string, offset: number): string => {
  const value = new Date(`${base}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
};

// Business "today" (Asia/Shanghai, 03:00 cutoff mirrors server/src/time.ts).
const businessToday = (): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  const base = new Date(`${value('year')}-${value('month')}-${value('day')}T00:00:00Z`);
  if (Number(value('hour')) < 3) base.setUTCDate(base.getUTCDate() - 1);
  return base.toISOString().slice(0, 10);
};

const summaries = [
  {
    summary: '完成了用户模块的接口联调，修复了三个表单校验问题。',
    plan: '继续完成权限模块的前端页面。',
  },
  {
    summary: '阅读了项目文档，搭建了本地开发环境，跑通了第一个示例。',
    plan: '开始编写看板组件的原型。',
  },
  {
    summary: '重构了数据访问层，补充了单元测试，覆盖率提升到 72%。',
    plan: '优化查询性能，整理重构笔记。',
  },
  {
    summary: '修复了昨晚提测的两个 bug，协助测试同学复现问题。',
    plan: '开始准备周会演示材料。',
  },
  {
    summary: '学习了 CSS Grid 布局，尝试应用到看板页面。',
    plan: '继续完善响应式样式。',
  },
  {
    summary: '完成了代码评审反馈的修改，整理了 TODO 清单。',
    plan: '开始新模块的技术方案调研。',
  },
];

const evaluations: Array<SeedReport['selfEvaluation']> = [
  'satisfied',
  'average',
  'satisfied',
  'other',
  'satisfied',
  'dissatisfied',
];

const spec = [
  { name: '张伟', username: 'zhangwei', email: 'zhangwei@example.com', status: 'active' as const },
  { name: '李娜', username: 'lina', email: 'lina@example.com', status: 'active' as const },
  { name: '王强', username: 'wangqiang', email: 'wangqiang@example.com', status: 'active' as const },
  { name: '刘洋', username: 'liuyang', email: 'liuyang@example.com', status: 'disabled' as const },
];

export const buildStudents = async (
  hash: (password: string) => Promise<string>,
): Promise<SeedStudent[]> => {
  const today = businessToday();
  const passwordHash = await hash('student-123456');
  const students: SeedStudent[] = [];

  for (const [index, item] of spec.entries()) {
    const reports: SeedReport[] = [];
    // Past 13 business days ending yesterday; skip one to show a missing cell.
    for (let offset = -13; offset <= -1; offset += 1) {
      if (offset === -4) continue;
      const date = dayShift(today, offset);
      const seedIndex = ((index + offset + 26) % summaries.length + summaries.length)
        % summaries.length;
      reports.push({
        date,
        selfEvaluation: evaluations[seedIndex],
        todaySummary: summaries[seedIndex].summary,
        tomorrowPlan: summaries[seedIndex].plan,
        otherNotes: offset % 5 === 0 ? '需要协助 review 设计稿' : '',
      });
    }
    students.push({
      name: item.name,
      username: item.username,
      email: item.email,
      status: item.status,
      passwordHash,
      reports,
    });
  }
  return students;
};