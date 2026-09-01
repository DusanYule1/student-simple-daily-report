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

type SeedStyle =
  | 'diligent'    // every seeded day, mostly satisfied
  | 'spotty'      // about half the days, visible gaps
  | 'fluctuating' // mixed evaluations, colourful board
  | 'leave';      // continuous block of missing days in the middle

type SeedSpec = {
  name: string;
  username: string;
  email: string;
  status: 'active' | 'disabled';
  style: SeedStyle;
};

const SEED_DAYS = 30;

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
  {
    summary: '排查了测试环境的偶发超时，定位到连接池配置问题。',
    plan: '补充监控埋点，观察一周数据。',
  },
  {
    summary: '整理了需求评审的反馈意见，更新了原型稿。',
    plan: '和设计师确认视觉细节。',
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

const fluctuatingEvaluations: Array<SeedReport['selfEvaluation']> = [
  'satisfied',
  'average',
  'dissatisfied',
  'average',
  'other',
  'dissatisfied',
];

const styleSubmits = (style: SeedStyle, dayIndex: number): boolean => {
  switch (style) {
    case 'diligent':
      return true;
    case 'spotty':
      return dayIndex % 2 === 0 || dayIndex % 5 === 0;
    case 'fluctuating':
      return dayIndex % 4 !== 3;
    case 'leave':
      return !(dayIndex >= 4 && dayIndex <= 6);
  }
};

const styleEvaluation = (
  style: SeedStyle,
  dayIndex: number,
  studentIndex: number,
): SeedReport['selfEvaluation'] => {
  switch (style) {
    case 'diligent':
      return evaluations[(studentIndex + dayIndex) % evaluations.length];
    case 'spotty':
      return evaluations[(studentIndex * 2 + dayIndex) % evaluations.length];
    case 'fluctuating':
      return fluctuatingEvaluations[(studentIndex + dayIndex) % fluctuatingEvaluations.length];
    case 'leave':
      return evaluations[(studentIndex + dayIndex * 3) % evaluations.length];
  }
};

const spec: SeedSpec[] = [
  { name: '张伟', username: 'zhangwei', email: 'zhangwei@example.com', status: 'active', style: 'diligent' },
  { name: '李娜', username: 'lina', email: 'lina@example.com', status: 'active', style: 'diligent' },
  { name: '王强', username: 'wangqiang', email: 'wangqiang@example.com', status: 'active', style: 'diligent' },
  { name: '陈晨', username: 'chenchen', email: 'chenchen@example.com', status: 'active', style: 'diligent' },
  { name: '刘洋', username: 'liuyang', email: 'liuyang@example.com', status: 'disabled', style: 'spotty' },
  { name: '赵磊', username: 'zhaolei', email: 'zhaolei@example.com', status: 'active', style: 'spotty' },
  { name: '孙悦', username: 'sunyue', email: 'sunyue@example.com', status: 'active', style: 'leave' },
  { name: '周杰', username: 'zhoujie', email: 'zhoujie@example.com', status: 'active', style: 'fluctuating' },
  { name: '吴霞', username: 'wuxia', email: 'wuxia@example.com', status: 'active', style: 'spotty' },
  { name: '郑凯', username: 'zhengkai', email: 'zhengkai@example.com', status: 'active', style: 'leave' },
  { name: '冯雪', username: 'fengxue', email: 'fengxue@example.com', status: 'active', style: 'fluctuating' },
  { name: '许涛', username: 'xutao', email: 'xutao@example.com', status: 'disabled', style: 'fluctuating' },
  { name: '高丽', username: 'gaoli', email: 'gaoli@example.com', status: 'disabled', style: 'diligent' },
];

export const buildStudents = async (
  hash: (password: string) => Promise<string>,
): Promise<SeedStudent[]> => {
  const today = businessToday();
  const passwordHash = await hash('student-123456');
  const students: SeedStudent[] = [];

  for (const [index, item] of spec.entries()) {
    const reports: SeedReport[] = [];
    for (let offset = -SEED_DAYS; offset <= 0; offset += 1) {
      const dayIndex = offset + SEED_DAYS;
      if (!styleSubmits(item.style, dayIndex)) continue;
      const date = dayShift(today, offset);
      const summaryIndex = (index * 3 + dayIndex) % summaries.length;
      reports.push({
        date,
        selfEvaluation: styleEvaluation(item.style, dayIndex, index),
        todaySummary: summaries[summaryIndex].summary,
        tomorrowPlan: summaries[summaryIndex].plan,
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