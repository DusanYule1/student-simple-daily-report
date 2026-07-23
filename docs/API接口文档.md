# 学生简易日报系统 API 接口文档

> 版本：V1.1  
> 日期：2026-07-23  
> Base URL：`https://<site-domain>/api/v1`  
> 机器可读规范：[openapi.yaml](./openapi.yaml)

## 1. 约定

### 1.1 内容类型

- 请求与响应：`application/json; charset=utf-8`
- 日期：ISO 8601 `YYYY-MM-DD`
- 月份：`YYYY-MM`
- 时间：UTC ISO 8601，例如 `2026-07-23T08:30:00Z`
- ID：客户端统一按字符串处理

### 1.2 鉴权类型

| 标识 | 方式 | 适用接口 |
| --- | --- | --- |
| 公开 | 无 | 学生登录 |
| 学生 | `student_session` HttpOnly Cookie | 学生 Session、看板、日报、个人工作详情 |
| 管理员 | `Authorization: Bearer <Supabase access token>` | `/admin/*` |

学生 Cookie 由服务端写入，JavaScript 不读取。Web 请求默认同域；未来移动端 Bearer Token 不在 V1 首期开放。

### 1.3 成功响应

```json
{
  "data": {},
  "meta": {
    "request_id": "req_01K..."
  }
}
```

分页响应：

```json
{
  "data": [],
  "meta": {
    "request_id": "req_01K...",
    "pagination": {
      "page": 1,
      "page_size": 20,
      "total": 46,
      "total_pages": 3
    }
  }
}
```

### 1.4 错误响应

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数不正确",
    "details": [
      {
        "field": "month",
        "reason": "必须使用 YYYY-MM 格式"
      }
    ],
    "request_id": "req_01K..."
  }
}
```

### 1.5 通用错误

| HTTP | `code` | 含义 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 参数或正文校验失败 |
| 401 | `AUTH_REQUIRED` | 缺少或使用了无效身份凭据 |
| 401 | `AUTH_INVALID_CREDENTIALS` | 学生用户名或密码错误 |
| 403 | `FORBIDDEN` | 已登录但没有该操作权限 |
| 404 | `RESOURCE_NOT_FOUND` | 资源不存在或不可见 |
| 409 | `USERNAME_CONFLICT` | 学生用户名已存在 |
| 409 | `STATE_CONFLICT` | 资源当前状态不允许操作 |
| 413 | `PAYLOAD_TOO_LARGE` | 请求体超过安全上限 |
| 429 | `RATE_LIMITED` | 请求过于频繁 |
| 500 | `INTERNAL_ERROR` | 服务内部错误 |
| 503 | `DEPENDENCY_UNAVAILABLE` | 数据库或身份服务暂不可用 |

### 1.6 安全请求要求

- 写请求必须携带正确 `Content-Type`；
- Web 写请求必须来自允许的 `Origin`；
- 管理员 Token 不得放入 URL；
- 登录和临时密码接口不得被自动重试；
- 可重试的 GET 遇到 503 时采用指数退避；
- `X-Request-Id` 可由客户端传入合法值，否则服务端生成。

## 2. 数据模型

### 2.1 `StudentSummary`

```json
{
  "id": "b61f9a45-4d8d-4c42-a18e-c21c70b8706d",
  "name": "张三"
}
```

普通学生接口不返回其他学生的用户名、密码信息或账号状态。

### 2.2 `StudentProfile`

```json
{
  "id": "b61f9a45-4d8d-4c42-a18e-c21c70b8706d",
  "name": "张三",
  "username": "zhangsan",
  "status": "active",
  "must_change_password": false,
  "last_login_at": "2026-07-23T08:30:00Z",
  "created_at": "2026-06-01T00:00:00Z",
  "updated_at": "2026-07-23T08:30:00Z"
}
```

### 2.3 `DailyReport`

```json
{
  "id": "55e42cf5-20dc-442f-8609-f3a58e31320b",
  "student": {
    "id": "b61f9a45-4d8d-4c42-a18e-c21c70b8706d",
    "name": "张三"
  },
  "report_date": "2026-07-23",
  "self_evaluation": "satisfied",
  "today_summary": "完成登录模块重构。",
  "tomorrow_plan": "完成月度看板接口。",
  "other_notes": "需要确认旧密码哈希格式。",
  "created_at": "2026-07-23T09:00:00Z",
  "updated_at": "2026-07-23T10:10:00Z"
}
```

`self_evaluation` 取值：

| 值 | 中文 | 看板颜色 |
| --- | --- | --- |
| `satisfied` | 满意 | 绿色 |
| `average` | 一般 | 黄色 |
| `dissatisfied` | 不满意 | 红色 |
| `other` | 其他 | 灰色 |

未提交不是状态，不产生 `DailyReport`。

### 2.4 `MonthlyBoard`

```json
{
  "month": "2026-07",
  "timezone": "Asia/Shanghai",
  "business_day_cutoff": "03:00",
  "students": [
    {
      "student": {
        "id": "b61f9a45-4d8d-4c42-a18e-c21c70b8706d",
        "name": "张三"
      },
      "summary": {
        "submitted": 3,
        "satisfied": 2,
        "average": 1,
        "dissatisfied": 0,
        "other": 0,
        "missing_elapsed_days": 2
      },
      "activities": [
        {
          "date": "2026-07-01",
          "report_id": "55e42cf5-20dc-442f-8609-f3a58e31320b",
          "self_evaluation": "satisfied"
        },
        {
          "date": "2026-07-02",
          "report_id": null,
          "self_evaluation": null
        }
      ]
    }
  ]
}
```

接口只返回当月真实日期，不返回月历补位格。客户端根据月份生成 5/6 周布局。未来日期可以出现在 `activities` 中但不计入 `missing_elapsed_days`。

## 3. 学生身份接口

### 3.1 学生登录

`POST /student/session`

鉴权：公开  
限流：按 IP 和规范化用户名

请求：

```json
{
  "username": "zhangsan",
  "password": "student-password"
}
```

字段：

| 字段 | 必填 | 规则 |
| --- | --- | --- |
| `username` | 是 | 去除首尾空格后非空 |
| `password` | 是 | 非空；服务端不记录 |

成功：`200 OK`

```http
Set-Cookie: student_session=<opaque>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000
```

```json
{
  "data": {
    "authenticated": true,
    "student": {
      "id": "b61f9a45-4d8d-4c42-a18e-c21c70b8706d",
      "name": "张三",
      "username": "zhangsan",
      "must_change_password": false
    },
    "session": {
      "expires_at": "2026-08-22T08:30:00Z"
    }
  },
  "meta": {
    "request_id": "req_01K..."
  }
}
```

错误：

- `401 AUTH_INVALID_CREDENTIALS`
- `429 RATE_LIMITED`

为避免枚举账号，用户名不存在、密码错误和外部可见的停用状态均可返回统一错误。

### 3.2 获取学生 Session

`GET /student/session`

鉴权：学生

成功：`200 OK`

```json
{
  "data": {
    "authenticated": true,
    "student": {
      "id": "b61f9a45-4d8d-4c42-a18e-c21c70b8706d",
      "name": "张三",
      "username": "zhangsan",
      "must_change_password": false
    },
    "session": {
      "expires_at": "2026-08-22T08:30:00Z"
    }
  },
  "meta": {
    "request_id": "req_01K..."
  }
}
```

无有效 Session：`401 AUTH_REQUIRED`。

Session 自登录成功起固定有效 30 天，不因访问而滑动续期。`must_change_password=true` 时，学生只能调用 Session、退出和修改密码接口，其他业务接口返回 `403 PASSWORD_CHANGE_REQUIRED`。

### 3.3 学生退出

`DELETE /student/session`

鉴权：学生

服务端撤销当前 Session，并清除 Cookie。

成功：`204 No Content`

若 Cookie 已失效，接口仍可幂等返回 204。

### 3.4 修改本人密码

`PUT /student/password`

鉴权：学生

请求：

```json
{
  "current_password": "old-password",
  "new_password": "new-password"
}
```

成功：`204 No Content`

行为：

- 验证当前密码；
- 写入新哈希；
- 清除 `must_change_password`；
- 撤销该学生其他 Session；
- 撤销修改前的所有 Session，并签发新的 30 天 Session Cookie。

错误：

- `400 VALIDATION_ERROR`
- `401 AUTH_INVALID_CREDENTIALS`

## 4. 学生和看板接口

### 4.1 获取可见学生

`GET /students`

鉴权：学生或管理员

查询参数：

| 参数 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `q` | 否 | 空 | 按姓名搜索 |
| `page` | 否 | `1` | 页码 |
| `page_size` | 否 | `100` | 1—200 |

成功：`200 OK`

```json
{
  "data": [
    {
      "id": "b61f9a45-4d8d-4c42-a18e-c21c70b8706d",
      "name": "张三"
    }
  ],
  "meta": {
    "request_id": "req_01K...",
    "pagination": {
      "page": 1,
      "page_size": 100,
      "total": 1,
      "total_pages": 1
    }
  }
}
```

### 4.2 获取月度看板

`GET /board/monthly?month=2026-07`

鉴权：学生或管理员

查询参数：

| 参数 | 必填 | 规则 |
| --- | --- | --- |
| `month` | 是 | `YYYY-MM`，建议限制在允许的历史范围 |
| `q` | 否 | 学生姓名搜索 |

成功：`200 OK`，响应为 `MonthlyBoard`。

说明：

- 一次返回当月所有可见学生的轻量状态；
- 不包含日报正文；
- 月外补位格由客户端生成；
- 未提交日期返回 `report_id: null` 和 `self_evaluation: null`；
- 未来日期不计入缺交数。
- 服务端使用一次“启用学生 LEFT JOIN 当月日报”的聚合查询，禁止按学生循环查询。
- 查询采用 `report_date >= month_start AND report_date < next_month_start`。
- 数据库只返回真实日报状态；月历补位格和白色未提交格由客户端生成。
- 必须使用 `(student_id, report_date)` 唯一索引和 `(report_date, student_id)` 查询索引。
- 按 500 名学生计算，单月最多约 15,500 条日报；目标为数据库查询数恒定且接口在正常网络下 2 秒内完成。

错误：

- `400 VALIDATION_ERROR`
- 停用学生无论调用者是学生还是管理员，都不出现在月度看板。

### 4.3 获取单日日报详情

`GET /students/{student_id}/reports/{report_date}`

鉴权：学生或管理员

已登录学生可查看任一启用学生在新系统中保存的全部历史日报和完整正文。停用学生返回 `404 RESOURCE_NOT_FOUND`，不通过此接口暴露历史信息。

路径参数：

- `student_id`：不透明 ID；
- `report_date`：`YYYY-MM-DD`。

成功：`200 OK`，返回 `DailyReport`。

无日报：`404 RESOURCE_NOT_FOUND`。

### 4.4 获取单人时间段工作详情

`GET /students/{student_id}/reports`

鉴权：学生或管理员

查询参数：

| 参数 | 必填 | 默认 | 规则 |
| --- | --- | --- | --- |
| `start_date` | 是 | — | `YYYY-MM-DD` |
| `end_date` | 是 | — | `YYYY-MM-DD`，不得早于开始日期 |
| `sort` | 否 | `date_desc` | `date_asc` / `date_desc` |
| `page` | 否 | `1` | 正整数 |
| `page_size` | 否 | `31` | 1—100 |
| `include_missing` | 否 | `false` | 是否返回未提交日期占位 |

单次时间范围最大 366 天。

成功：

```json
{
  "data": {
    "student": {
      "id": "b61f9a45-4d8d-4c42-a18e-c21c70b8706d",
      "name": "张三"
    },
    "range": {
      "start_date": "2026-07-01",
      "end_date": "2026-07-31"
    },
    "summary": {
      "submitted": 3,
      "satisfied": 2,
      "average": 1,
      "dissatisfied": 0,
      "other": 0
    },
    "reports": [
      {
        "id": "55e42cf5-20dc-442f-8609-f3a58e31320b",
        "report_date": "2026-07-23",
        "self_evaluation": "satisfied",
        "today_summary": "完成登录模块重构。",
        "tomorrow_plan": "完成月度看板接口。",
        "other_notes": "需要确认旧密码哈希格式。",
        "created_at": "2026-07-23T09:00:00Z",
        "updated_at": "2026-07-23T10:10:00Z"
      }
    ]
  },
  "meta": {
    "request_id": "req_01K...",
    "pagination": {
      "page": 1,
      "page_size": 31,
      "total": 3,
      "total_pages": 1
    }
  }
}
```

`include_missing=true` 时，未提交日期项为：

```json
{
  "id": null,
  "report_date": "2026-07-22",
  "self_evaluation": null,
  "today_summary": null,
  "tomorrow_plan": null,
  "other_notes": null,
  "created_at": null,
  "updated_at": null
}
```

## 5. 本人日报接口

### 5.1 获取今日日报

`GET /reports/today`

鉴权：学生

“今天”由服务端按 `Asia/Shanghai` 和 03:00 切分计算。

成功：

- 已提交：`200 OK`，`data.report` 为 `DailyReport`；
- 未提交：`200 OK`，`data.report` 为 `null`，并返回业务日期和建议预填。

```json
{
  "data": {
    "business_date": "2026-07-23",
    "report": null,
    "prefill": {
      "today_summary": "上一份日报的明日计划",
      "tomorrow_plan": "",
      "other_notes": ""
    }
  },
  "meta": {
    "request_id": "req_01K..."
  }
}
```

### 5.2 新增或更新今日日报

`PUT /reports/today`

鉴权：学生

请求：

```json
{
  "self_evaluation": "satisfied",
  "today_summary": "完成登录模块重构。",
  "tomorrow_plan": "完成月度看板接口。",
  "other_notes": "需要确认旧密码哈希格式。"
}
```

规则：

- `self_evaluation` 必填；
- 三个正文允许空字符串或 `null`；
- 不设置产品字数限制，但受统一请求体安全上限约束；
- 服务端按当前业务日期 Upsert；
- 客户端不能通过该接口替他人提交。

成功：

- 首次创建：`201 Created`；
- 更新已有日报：`200 OK`；
- 均返回完整 `DailyReport`。

### 5.3 获取或修改本人指定日期日报

`GET /reports/{report_date}`  
`PUT /reports/{report_date}`

鉴权：学生

用途：支持补填或编辑历史日报。若产品不允许补填，可在服务端限制只接受当前业务日期，并返回 `403 FORBIDDEN`。

`PUT` 请求体与“今日日报”一致，操作按本人 + 日期幂等。

## 6. 管理员身份接口

管理员登录本身由 Supabase Auth Client 完成，不通过本 API 接收管理员密码。

### 6.1 获取管理员资料

`GET /admin/me`

鉴权：管理员 Bearer Token

成功：

```json
{
  "data": {
    "id": "a0327d18-b93d-4db2-a5e4-f45706c0df95",
    "name": "系统管理员",
    "email": "admin@example.com",
    "status": "active"
  },
  "meta": {
    "request_id": "req_01K..."
  }
}
```

Token 有效但不在有效管理员表：`403 FORBIDDEN`。

## 7. 管理员学生管理接口

### 7.1 查询学生列表

`GET /admin/students`

鉴权：管理员

查询参数：

| 参数 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `q` | 否 | 空 | 姓名或用户名 |
| `status` | 否 | 全部 | `active` / `disabled` |
| `page` | 否 | `1` | 页码 |
| `page_size` | 否 | `20` | 1—100 |
| `sort` | 否 | `created_desc` | `name_asc` / `created_asc` / `created_desc` |

成功：返回分页 `StudentProfile[]`。

### 7.2 创建学生

`POST /admin/students`

鉴权：管理员  
可选请求头：`Idempotency-Key`

请求：

```json
{
  "name": "李四",
  "username": "lisi",
  "email": "lisi@example.com",
  "temporary_password": "temporary-password",
  "status": "active"
}
```

成功：`201 Created`，返回 `StudentProfile`。

所有管理员创建的学生均由服务端强制设置 `must_change_password=true`，客户端不能关闭。

错误：

- `409 USERNAME_CONFLICT`
- `400 VALIDATION_ERROR`

密码和哈希不出现在响应或审计摘要中。

### 7.3 获取学生管理详情

`GET /admin/students/{student_id}`

鉴权：管理员

成功：返回 `StudentProfile`，可增加非敏感统计：

```json
{
  "data": {
    "student": {
      "id": "b61f9a45-4d8d-4c42-a18e-c21c70b8706d",
      "name": "张三",
      "username": "zhangsan",
      "status": "active",
      "must_change_password": false,
      "last_login_at": "2026-07-23T08:30:00Z",
      "created_at": "2026-06-01T00:00:00Z",
      "updated_at": "2026-07-23T08:30:00Z"
    },
    "statistics": {
      "report_count": 42,
      "active_session_count": 1
    }
  },
  "meta": {
    "request_id": "req_01K..."
  }
}
```

### 7.4 编辑或启停学生

`PATCH /admin/students/{student_id}`

鉴权：管理员

请求至少提供一个字段：

```json
{
  "name": "张三",
  "username": "zhangsan-new",
  "status": "disabled"
}
```

规则：

- 修改用户名时检查唯一性；
- `status` 改为 `disabled` 时立即撤销全部学生 Session；
- 停用不删除日报；
- 成功后写入审计日志。

成功：`200 OK`，返回更新后的 `StudentProfile`。

### 7.5 重置学生密码

`POST /admin/students/{student_id}/temporary-password`

鉴权：管理员

管理员可以随时调用此接口重置学生密码。

请求：

```json
{
  "temporary_password": "new-temporary-password"
}
```

成功：`204 No Content`

服务端始终设置 `must_change_password=true` 并撤销全部现有 Session。必须写入审计日志，但审计内容不得包含密码或哈希。

### 7.6 撤销学生 Session

`DELETE /admin/students/{student_id}/sessions`

鉴权：管理员

成功：

```json
{
  "data": {
    "revoked_count": 2
  },
  "meta": {
    "request_id": "req_01K..."
  }
}
```

### 7.7 永久删除学生

首期不提供永久删除 API。管理员使用 `status=disabled`。后续若实现，应单独设计历史日报保留、匿名化和二次确认契约。

## 8. 管理员审计接口

### 8.1 查询审计日志

`GET /admin/audit-logs`

鉴权：管理员

查询参数：

| 参数 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `actor_id` | 否 | — | 操作管理员 |
| `target_student_id` | 否 | — | 目标学生 |
| `action` | 否 | — | 动作类型 |
| `start_time` | 否 | — | ISO 时间 |
| `end_time` | 否 | — | ISO 时间 |
| `page` | 否 | `1` | 页码 |
| `page_size` | 否 | `20` | 1—100 |

响应项：

```json
{
  "id": "9d169b72-bc10-4cd1-b0d6-ea84fdd00963",
  "actor": {
    "id": "a0327d18-b93d-4db2-a5e4-f45706c0df95",
    "name": "系统管理员"
  },
  "target_student": {
    "id": "b61f9a45-4d8d-4c42-a18e-c21c70b8706d",
    "name": "张三"
  },
  "action": "student.disabled",
  "change_summary": {
    "status": {
      "from": "active",
      "to": "disabled"
    }
  },
  "created_at": "2026-07-23T11:00:00Z"
}
```

建议动作枚举：

- `student.created`
- `student.updated`
- `student.enabled`
- `student.disabled`
- `student.temporary_password_set`
- `student.sessions_revoked`

## 9. 每日邮件管理接口

每日邮件由 Netlify Scheduled Function 自动执行，沿用当前项目的 SMTP 配置。系统实时读取所有启用学生的邮箱，并使用 BCC 群发，避免学生之间看到其他人的邮箱：

- `SMTP_SERVER`
- `SMTP_PORT`
- `EMAIL_ADDRESS`
- `EMAIL_PASSWORD`

默认沿用当前配置：`SMTP_SERVER=smtp.exmail.qq.com`、`SMTP_PORT=465`，使用 SMTP SSL。

### 9.1 学生邮箱与全局群发

- 管理员创建学生时必须填写唯一邮箱；
- 已存在但缺少邮箱的学生必须由管理员补齐；
- 每次发送时实时查询所有 `status=active` 的学生邮箱；
- 邮件使用 BCC 群发，停用学生不接收；
- 任一启用学生缺少邮箱时，本次任务失败并记录缺失名单。

以下独立收件人接口属于早期兼容设计，新管理界面不再使用。

### 9.2 查询旧版邮件收件人

`GET /admin/notification-recipients`

鉴权：管理员

返回启用和停用的收件人列表，支持分页。

### 9.2 新增邮件收件人

`POST /admin/notification-recipients`

请求：

```json
{
  "email": "teacher@example.com",
  "display_name": "指导老师",
  "enabled": true
}
```

邮箱必须唯一。成功返回 `201 Created`。

### 9.3 编辑邮件收件人

`PATCH /admin/notification-recipients/{recipient_id}`

可修改 `email`、`display_name` 和 `enabled`。成功返回更新后的收件人。

### 9.4 查询邮件运行记录

`GET /admin/notification-runs?start_date=&end_date=&status=&page=&page_size=`

鉴权：管理员

返回目标日期、运行状态、尝试次数、收件人数、开始时间、完成时间和脱敏错误摘要。

运行状态：

- `pending`
- `running`
- `succeeded`
- `failed`

### 9.5 手动补发指定日期

`POST /admin/notification-runs/{report_date}/retry`

鉴权：管理员

请求：

```json
{
  "reason": "自动任务失败后人工补发"
}
```

成功返回 `202 Accepted` 和新的运行记录。并发补发同一日期时返回 `409 STATE_CONFLICT`。补发操作写入管理员审计日志。

### 9.6 自动发送规则

- Scheduled Function 每日执行一次；
- 目标日期按 `Asia/Shanghai` 和 03:00 业务日计算；
- 邮件包含四种自评数量、未提交人数及所有已提交日报正文；
- 停用学生不计入当前目标日期应提交人数，也不显示在邮件中；
- 自动任务失败写入 `notification_runs`，不得静默忽略；
- 邮件失败不影响在线 API。

## 10. 缓存与条件请求

- 学生 Session、日报详情和管理接口：`Cache-Control: no-store`；
- 月度看板默认 `private, max-age=30`，提交日报后客户端主动失效；
- 公开 CDN 不缓存带 Cookie 或 Authorization 的 API 响应；
- 可后续为月度看板增加 ETag，但首期不是必需。

## 11. 移动端兼容规则

- 业务字段不包含 CSS 类名、颜色代码或桌面坐标；
- ID、日期和枚举保持稳定；
- API Client 应支持 Cookie 和未来 Bearer 两种学生鉴权适配器；
- V1 不向移动端签发长期 Token；
- 若未来启用移动端 Token，应增加：
  - 短期 Access Token；
  - 可撤销 Refresh Token；
  - 设备会话列表；
  - Token 轮换和重放检测；
  - 独立安全评审。

## 12. 新系统接口边界

- 仅提供 `/api/v1`；
- 不提供旧 Flask `/api/*` 兼容映射；
- 不接受旧 Session、旧密码哈希或旧数据格式；
- 新系统中的历史查询从新系统启用日期开始累计。

## 13. 前端调用示例

### 12.1 学生登录

```js
const response = await fetch('/api/v1/student/session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'same-origin',
  body: JSON.stringify({ username, password }),
});
```

### 12.2 获取月度看板

```js
const response = await fetch('/api/v1/board/monthly?month=2026-07', {
  credentials: 'same-origin',
});
```

### 12.3 管理员请求

```js
const response = await fetch('/api/v1/admin/students?page=1&page_size=20', {
  headers: {
    Authorization: `Bearer ${supabaseAccessToken}`,
  },
});
```

## 14. API 验收清单

- 所有接口返回 `request_id`；
- 学生 Session Cookie 不能被 JavaScript 读取；
- 学生无法写入他人日报；
- 学生无法访问 `/admin/*`；
- 管理员 Token 有效但未启用时返回 403；
- 月度看板不返回日报正文；
- 月度看板不把未来日期计入未提交；
- 单人时间段接口支持 366 天范围与分页；
- 日报 Upsert 满足学生 + 日期唯一；
- 停用学生立即撤销 Session；
- 停用学生不出现在任何月份看板或人员详情接口；
- 任一学生可以读取任一启用学生的全部历史日报正文；
- Session 固定 30 天且不滑动续期；
- 管理员重置密码后强制学生改密；
- 每日邮件自动发送、失败留痕并支持管理员补发；
- 密码和 Token 不出现在响应、日志和审计中；
- OpenAPI 校验通过，前端类型可由规范生成。
