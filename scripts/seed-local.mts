import { ensureLocalDatabase } from '../server/src/local/bootstrap';

const main = async () => {
  await ensureLocalDatabase();
  console.log('本地预览数据库就绪');
  console.log('  管理员: admin@example.com / local-admin-123（可用 LOCAL_ADMIN_PASSWORD 覆盖）');
  console.log('  学生:  13 人（10 启用 / 3 停用），密码均为 student-123456');
  console.log('  启用: zhangwei lina wangqiang chenchen zhaolei sunyue zhoujie wuxia zhengkai fengxue');
  console.log('  停用: liuyang xutao gaoli');
};

main().catch((error) => {
  console.error('种子数据初始化失败:', error);
  process.exit(1);
});