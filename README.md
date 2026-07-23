# 学生简易日报系统

一个面向学生团队的日报系统。学生使用轻量账号和 30 天服务端 Session；管理员使用 Supabase Auth。前端及 API 部署到 Netlify，数据保存到 Supabase PostgreSQL。

## 当前功能

- 学生登录、首次登录强制修改临时密码；
- 填写“今日总结、明日计划、其他说明”，正文不限制字数；
- 自我评价：满意、一般、不满意、其他；
- GitHub 贡献图风格月度看板，支持前后月份切换；
- 学生互看所有启用学生的历史日报；
- 单个学生指定时间段工作明细；
- 管理员创建、编辑、启停学生及重置临时密码；
- 管理员维护每日邮件收件人、查看发送记录并手动补发；
- 每日 SMTP 汇总邮件；
- 管理员敏感操作审计。

详细设计参见：

- [需求分析文档](docs/需求分析文档.md)
- [系统架构设计](docs/系统架构设计.md)
- [API 接口文档](docs/API接口文档.md)
- [OpenAPI 定义](docs/openapi.yaml)
- [部署与初始化指南](docs/部署与初始化指南.md)

## 技术架构

```text
React SPA (Netlify)
        │
        ├── /api/v1/* → Netlify Functions
        │                    │
        │                    ├── Supabase PostgreSQL
        │                    └── SMTP
        │
        └── Supabase Auth（仅管理员）
```

旧 Flask、SQLite 和 Docker 文件仅作为原项目历史代码保留，新系统不读取或兼容旧数据。

## 目录

```text
frontend/              React 前端
server/src/            API 业务、鉴权和邮件服务
server/test/           后端单元测试
netlify/functions/     Netlify API 与定时函数入口
supabase/migrations/   数据库迁移
scripts/               初始化脚本
docs/                  需求、架构、API 和部署文档
```

## 本地安装与验证

要求：

- Node.js 20 或更高版本；
- npm；
- pnpm（根目录服务端依赖）。

```bash
pnpm install
npm --prefix frontend ci
pnpm run typecheck
pnpm run test:server
npm --prefix frontend run build
```

本地联调推荐安装 Netlify CLI 后执行：

```bash
npx netlify dev
```

开始前将根目录 `.env.example` 复制为 `.env`，将 `frontend/.env.example` 复制为 `frontend/.env.local`，并填入真实配置。任何 Service Role Key、SMTP 密码或管理员密码均不得提交到 Git。

## 数据库和首个管理员

按文件名顺序执行 `supabase/migrations/` 中的迁移。配置初始化环境变量后运行：

```bash
pnpm run bootstrap:admin
```

脚本会创建或复用指定邮箱对应的 Supabase Auth 用户，并写入启用状态的 `admin_profiles`。完成后应从环境中删除 `BOOTSTRAP_ADMIN_PASSWORD`。

## 生产部署

Netlify 构建配置已写入 `netlify.toml`：

- 构建命令：`npm run build`
- 发布目录：`frontend/build`
- Functions：`netlify/functions`
- SPA 路由回退：`/index.html`
- API 路由：`/api/*`

必须在 Netlify 配置服务端 Supabase、前端 Supabase 和 SMTP 环境变量。完整步骤、密钥边界和验收清单参见[部署与初始化指南](docs/部署与初始化指南.md)。

## 常用页面

- 学生登录：`/`
- 学生看板：`/dashboard`
- 管理员登录：`/admin/login`
- 管理员控制台：`/admin/users`
