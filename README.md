# 学生日报系统

面向学生团队的轻量日报系统。学生使用系统内置账号登录，管理员使用 Supabase Auth；前端和 API 部署在 Netlify，业务数据保存于 Supabase PostgreSQL，每日汇总邮件通过 Resend 发送。

生产环境：[student-daily-report-duxy.netlify.app](https://student-daily-report-duxy.netlify.app)

## 功能

### 学生端

- 使用用户名和密码登录，Session 有效期 30 天；
- 管理员创建账号后，学生首次登录必须修改临时密码；
- 填写今日总结、明日计划和其他说明，不限制字数；
- 自我评价支持满意、一般、不满意和其他四种状态；
- GitHub 贡献图风格月度看板，一名学生占一行；
- 支持前后月份切换、姓名搜索、当天高亮和小屏横向滚动；
- 学生可以查看所有启用学生的日报和历史记录；
- 支持查看某位学生指定时间段内的全部工作明细。

### 管理端

- 管理员通过 Supabase Auth 登录；
- 创建、编辑、启用或停用学生；
- 重置学生临时密码、强制修改密码和撤销现有 Session；
- 管理学生邮箱；
- 查看每日邮件发送记录并手动补发；
- 记录管理员敏感操作审计日志。

### 每日邮件

- Netlify Scheduled Function 每天北京时间 06:00 执行；
- 汇总前一个业务日所有已提交学生的日报；
- 每位启用学生都会收到完整汇总，收件人之间互不可见；
- 使用已验证域名上的 Resend Batch API 发送；
- 每批最多 100 封，并使用幂等键避免重复发送；
- 发送结果保存在 `notification_runs`。

## 架构

```text
浏览器 React SPA
    │
    ├── 学生登录、看板、日报、用户管理
    │       └── /api/v1/* → Netlify Function
    │                            ├── Supabase PostgreSQL / RPC
    │                            └── Resend API
    │
    └── 管理员登录 → Supabase Auth
                         │
                         └── Access Token → Netlify Function 验证
```

业务表不会由浏览器直接读取。`SUPABASE_SERVICE_ROLE_KEY` 和 `RESEND_API_KEY` 仅供 Netlify Functions 使用，不能出现在前端环境变量或 Git 中。

月度看板使用单次 PostgreSQL RPC 聚合查询，并包含两层短缓存：

- Netlify Function 实例缓存 30 秒；
- 浏览器 `sessionStorage` 缓存 60 秒，先显示缓存再后台刷新；
- 搜索输入有 300ms 防抖；
- 日报保存后立即清除缓存并重新加载。

## 技术栈

- React、React Router、Axios
- TypeScript 服务端模块
- Netlify Functions 与 Scheduled Functions
- Supabase PostgreSQL、RPC、Row Level Security
- Supabase Auth（仅管理员）
- Resend Email API
- Zod
- Node.js 22+

旧版 Flask、SQLite、Docker 和 Nginx 文件仅作为原项目历史代码保留。新系统不兼容或读取旧平台数据。

## 目录结构

```text
frontend/              React 前端
server/src/            API、鉴权、缓存和邮件业务
server/test/           服务端测试
netlify/functions/     API 与每日定时任务入口
supabase/migrations/   Supabase 数据库迁移
scripts/               本地服务和管理员初始化脚本
docs/                  需求、架构、API 与部署文档
```

## 环境变量

复制示例文件：

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env.local
```

服务端配置：

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key
STUDENT_SESSION_COOKIE=student_session

RESEND_API_KEY=re_replace-with-send-only-key
RESEND_FROM_EMAIL=日报系统 <report@maildr.example.com>
```

前端配置：

```dotenv
REACT_APP_API_BASE_URL=/api/v1
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=replace-with-publishable-key
```

管理员初始化脚本还需要：

```dotenv
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_PASSWORD=replace-with-strong-password
BOOTSTRAP_ADMIN_NAME=系统管理员
```

`.env` 和 `frontend/.env.local` 已加入 `.gitignore`。不得提交任何真实密钥或密码。

## 本地运行

要求 Node.js 22 或更高版本。

```bash
npm install
npm --prefix frontend ci
npm run typecheck
npm run test:server
npm run build
npm run dev:local
```

启动后访问：

```text
http://127.0.0.1:8888
```

`dev:local` 会同时提供前端静态文件和 `/api/v1/*` 本地 API。修改前端后需要重新执行 `npm run build`。

也可以安装 Netlify CLI 后使用：

```bash
npx netlify dev
```

## 本地零依赖预览（无需 Supabase / Netlify）

本分支提供完全本地的运行模式：不依赖 Docker、不注册 Supabase/Resend 账号，把 Supabase 数据库调用映射到 Node.js 内置 SQLite。

```bash
npm install
npm --prefix frontend ci
npm run build        # 前端只构建一次
npm run seed:local   # 初始化本地 SQLite 数据库（也可直接跑 dev:local，会自动初始化）
npm run dev:local
```

访问 `http://127.0.0.1:8888`，前后端与 API 全部走同一个端口，适合通过端口转发（例如 SSH `-L 8888:127.0.0.1:8888`）直接使用。

### 本地预览账号

- 管理员：`admin@example.com` / `local-admin-123`（可用环境变量 `LOCAL_ADMIN_PASSWORD` 覆盖）
- 学生：共 13 个演示账号（10 启用 / 3 停用），密码均为 `student-123456`；启用账号如 `zhangwei`、`lina`、`wangqiang`、`chenchen` 等，停用演示为 `liuyang`、`xutao`、`gaoli`

种子数据包含过去两周的日报，打开月度看板即可看到完整热力图效果。

### 本地预览的数据文件

- 数据库：`instance/local-preview.sqlite3`（可用 `LOCAL_SQLITE_DB` 覆盖路径）
- 每日邮件预览：`instance/local-preview.sqlite3.mail/<日期>.html`——本地模式没有 Resend，"发送"会落盘为 HTML 文件，管理后台的发送记录与手动补发流程照常可走

### 本地发送真实邮件（QQ 邮箱 SMTP）

发送渠道按以下优先级自动选择：`RESEND_API_KEY`（Resend）> `SMTP_*`（SMTP 直发）> 本地落盘预览。

用 QQ 邮箱（含 Foxmail 账号）发真实邮件的配置步骤：

1. 登录 QQ 邮箱网页版 → 设置 → 账户 → 找到「POP3/IMAP/SMTP 服务」→ 开启「IMAP/SMTP 服务」→ 按提示生成**授权码**（16 位字母，不是 QQ 密码）
2. 在项目根目录创建 `.env`：

```dotenv
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=你的QQ号@qq.com
SMTP_PASS=上面生成的授权码
SMTP_FROM=日报系统 <你的QQ号@qq.com>
```

3. `npm run dev:local` 重启服务
4. 管理后台把每个启用学生的邮箱改成真实邮箱 → 「日报邮件补发」→ 收件箱查收

Foxmail 客户端绑定的是同一邮箱账号，不影响以上配置；授权码才是 SMTP 登录凭据。

### 工作方式

- 未配置 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 时，服务端 `getDb()` 自动切换到 SQLite 适配层（`server/src/local/`），业务代码零改动
- 配置了 Supabase 环境变量后，一切走原来的 Supabase 路径，本地适配层自动退出，Netlify 生产部署不受影响
- 管理员登录在本地模式走 `POST /api/v1/admin/session`（生产为 Supabase Auth）
- 本地模式仅供功能预览与联调，不应承载真实生产数据

## 数据库初始化

在 Supabase SQL Editor 中按文件名顺序执行：

```text
supabase/migrations/202607230001_initial_schema.sql
supabase/migrations/202607230002_monthly_board_function.sql
supabase/migrations/202607230003_notification_run_lock.sql
supabase/migrations/202607230004_student_email.sql
```

初始化首个管理员：

```bash
npm run bootstrap:admin
```

完成后应从环境中移除 `BOOTSTRAP_ADMIN_PASSWORD`。

## 测试

```bash
npm run typecheck
npm run test:server
npm run build
```

服务端测试覆盖：

- OpenAPI 与路由一致性；
- 请求参数校验；
- 密码和 Session 安全；
- 上海时区业务日期；
- 数据库 RLS 和索引；
- 月度看板单次集合查询；
- 看板缓存与写入后失效；
- 每日邮件并发保护。

## Netlify 部署

`netlify.toml` 已配置：

- Node.js 22；
- 构建命令：`npm run build`；
- 发布目录：`frontend/build`；
- Functions 目录：`netlify/functions`；
- `/api/*` 到统一 API Function 的重写；
- SPA 路由回退到 `/index.html`。

部署前需要在 Netlify 配置以下变量：

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
STUDENT_SESSION_COOKIE
RESEND_API_KEY
RESEND_FROM_EMAIL
REACT_APP_API_BASE_URL
REACT_APP_SUPABASE_URL
REACT_APP_SUPABASE_ANON_KEY
```

生产部署：

```bash
npx netlify deploy --build --prod
```

部署后至少验证：

- `/` 学生登录页返回 200；
- `/admin/login` 管理员登录页返回 200；
- 未登录访问 `/api/v1/student/session` 返回 401；
- 学生登录、填写日报和月度看板正常；
- Netlify Functions 中存在 `api` 和 `scheduled-daily-report`；
- Resend 中能看到 UTF-8 编码正常的测试邮件。

## 常用页面

- 学生登录：`/`
- 学生看板：`/dashboard`
- 修改密码：`/change-password`
- 学生历史：`/people/:studentId/reports`
- 管理员登录：`/admin/login`
- 管理员控制台：`/admin/users`

## 文档

- [需求分析文档](docs/需求分析文档.md)
- [系统架构设计](docs/系统架构设计.md)
- [API 接口文档](docs/API接口文档.md)
- [OpenAPI 定义](docs/openapi.yaml)
- [部署与初始化指南](docs/部署与初始化指南.md)
