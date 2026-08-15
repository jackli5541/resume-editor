# 轻简历编辑器

一个结构化简历编辑与双格式导出项目。编辑器、HTML/PDF 和可编辑 DOCX 共用 Resume JSON v2；PDF 与即时预览使用模板专属 HTML/CSS，Word 使用 schema 驱动的 DOCX 布局生成器。

## 环境要求

- Node.js 20 或更高版本
- Python 3、lxml、LibreOffice 与 Poppler（仅文档 Worker）
- Redis 7（生产任务队列）
- PostgreSQL 16（正式运行；未配置时可使用内置模板进行本地体验）

## 本地启动

一键启动（推荐）：`start.bat` 会先通过 Docker 启动 PostgreSQL、Redis 和文档 Worker（内置 LibreOffice 与 Poppler），再在宿主机运行 Web 服务。首次运行会构建 `document-worker` 镜像，耗时较长。

```powershell
cd E:\Project\resume-editor-mvp
start.bat
```

访问 <http://127.0.0.1:4173>。编辑数据自动保存在浏览器 `localStorage`；创建模板草稿时也会写入 PostgreSQL。生成文件默认暂存在 `var/exports`，30 分钟后由服务清理。

轻量开发模式：`start_dev.bat` 只启动 PostgreSQL，Web 服务运行在宿主机，关闭 Redis、文档 Worker 与高保真预览，适合只使用内置 `clean-single` 模板和前端联调的场景。

```powershell
cd E:\Project\resume-editor-mvp
start_dev.bat
```

手动方式（不使用启动脚本）：先 `npm install` 再 `npm start`，未配置 Redis 时使用进程内兼容队列。高保真母版转换需要 Redis、LibreOffice 与 Poppler——本地既可在宿主机安装后运行 `npm run start:worker`，也可用 `docker compose up -d document-worker` 复用 Docker 镜像。

## 测试与导出验证

```powershell
npm test
npm run verify:export
```

`npm test` 包含纯函数、数据校验、模板状态、草稿创建、PDF/Word 任务、令牌鉴权和真实 DOCX 包验证。`npm run verify:export` 会调用正在运行的后端生成 PDF。服务不在默认端口时：

```powershell
$env:EXPORT_ORIGIN='http://127.0.0.1:4187'
npm run verify:export
```

## Docker Compose 开发与部署

```powershell
docker compose up -d postgres redis
docker compose run --rm template-ingest
docker compose up -d app document-worker
```

PostgreSQL 默认映射到宿主机 `55432`，避免与本机已有的 `5432` 实例冲突；可通过 `POSTGRES_PORT` 修改。

首次执行 `template-ingest` 会迁移数据库，从 ResumeCollection 下载前 10 个中文 DOCX，执行 OOXML 安全分析、生成第一页预览并写入模板库。访问 <http://127.0.0.1:4173>。停止服务使用 `docker compose down`；模板、导出与预览目录 bind-mount 到宿主机 `./var`，数据库与 Redis 数据卷默认保留。

Web 镜像仅包含 Node，内存限制为 384 MB。文档 Worker 单并发运行 LibreOffice、Poppler 与 Python，限制为 1 GB；Redis 限制为 192 MB。生产环境必须替换示例密码，并通过密钥系统注入数据库、Redis 与 S3 凭据。

## 模板入库与发布

schema-v2 模板在具备完整 `editorSchema`、`layoutSchema` 和双格式渲染器后即可发布。外部 DOCX 参考母版仍按 [母版规范](docs/native-template-authoring.md) 执行安全检查和视觉 QA，但不会把未标注的原稿个人内容带入正式 Word 导出。

内置 `clean-single@1` 保持可用。ResumeCollection 001-010 在完成真实内容控件标注与视觉 QA 前会降为 `needs_mapping` 或 `needs_qa`，不再用通用 HTML/CSS 适配结果冒充原稿。

宿主机直接执行入库时：

```powershell
npm run db:migrate
npm run templates:ingest
npm run templates:publish
```

`templates:publish` 会检查安全关系、原生槽位与 `manifest.qa.approved`；任一条件未满足都不会升级为 `ready`。

## 配置

复制 `.env.example` 中的变量到部署环境。Node 本身不会自动读取 `.env` 文件，生产环境应由进程管理器、容器平台或密钥系统注入变量。

- `HOST` / `PORT`：监听地址与端口
- `DATABASE_URL`：PostgreSQL 连接串
- `TEMPLATE_STORAGE_DIR`：模板源文件、预览和 manifest 目录
- `EXPORT_DIR`：临时 PDF/DOCX 目录
- `PREVIEW_DIR`：分页成品预览目录
- `REDIS_URL`：生产 BullMQ 连接地址
- `S3_BUCKET` / `S3_ENDPOINT` / `S3_REGION`：可选 S3 兼容对象存储
- `MAX_EXPORT_REQUEST_BYTES`：导出请求体上限
- `EXPORT_IMAGE_HOSTS`：允许后端加载的 HTTPS 头像域名，逗号分隔
- `PYTHON_BIN` / `SOFFICE_BIN` / `PDFTOPPM_BIN`：Worker 文档工具路径
- `SESSION_TTL_DAYS`：会话有效期（天，默认 30）
- `DISABLE_REGISTRATION`：设为 `true` 关闭公开注册
- `TRUST_PROXY`：反向代理后设为 `true`，从 `X-Forwarded-For` 取真实客户端 IP
- `COOKIE_SECURE`：HTTPS 反向代理后设为 `true`，会话 Cookie 加 `Secure`
- `ADMIN_EMAILS`：管理员邮箱（逗号分隔），注册或登录命中即授予管理员
- `ADMIN_PHONES`：管理员手机号（可选，逗号分隔）
- `SEED_TEST_USERS`：设为 `true` 时启动自动创建测试账号（仅开发/测试，生产务必关闭）
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`：管理员测试账号（默认 `admin@example.com` / `admin123`）
- `SEED_USER_EMAIL` / `SEED_USER_PASSWORD`：普通用户测试账号（默认 `user@example.com` / `user1234`）
- `AI_CONFIG_ENC_KEY`：AI 能力主密钥（32 字节 hex/base64），用于 AES-256-GCM 加密落库的 DeepSeek API Key；缺失时 AI 生成功能降级为不可用
- `AI_USER_DAILY_LIMIT` / `AI_MAX_CONCURRENCY` / `AI_INPUT_MAX_CHARS` / `AI_OUTPUT_MAX_TOKENS` / `AI_TIMEOUT_MS`：AI 生成的日配额、并发、输入长度、输出 token 与超时（部分可由管理端在 DB 覆盖）

主密钥轮换（生产更换 `AI_CONFIG_ENC_KEY` 时）：

```powershell
$env:AI_CONFIG_ENC_KEY = "<旧主密钥>"
$env:AI_CONFIG_ENC_KEY_NEW = "<新主密钥>"
node scripts/rotate-ai-key.mjs
```

测试账号就绪后，用 `admin@example.com` / `admin123` 登录进入管理端，`user@example.com` / `user1234` 登录进入普通工作台。本地可用 `npm run seed` 手动创建，或在启动前设置 `SEED_TEST_USERS=true` 自动创建。

## 主要能力

- 基本信息、求职意向、教育、工作、项目、技能和自我评价编辑
- 模块显隐、移动、拖拽排序和经历条目管理
- 编辑器可选模块增补（极简轻可增补证书、奖项、语言、兴趣、校园经历）
- 富文本白名单清洗；头像完全可选，无效或不受信任头像会被忽略而不会阻断导出
- 字体、字号、行距、页边距、模块间距和主题色配置
- 本地自动保存、JSON 备份与导入
- 邮箱/手机号密码登录、HttpOnly 会话、ownerId 草稿隔离与用户设置（预留 AI 优化偏好）
- 统一登录入口与按角色跳转：管理员进入 `/admin`，普通用户进入首页
- 管理员角色（`ADMIN_EMAILS`/`ADMIN_PHONES` 指定）、管理端用户管理与草稿管理
- 管理员角色分级（RBAC：超级管理员/运营/审计）、管理员操作审计日志、软删除回收站与会话踢下线
- 管理端各列表结构化筛选（用户按角色/状态/日期、草稿按模板/日期、AI 日志按状态/日期、审计按动作/日期）与 CSV 报表导出
- 运营看板：趋势折线图（新增用户/新建草稿/导出/AI 成功）、AI 成本用量（按模型与按日聚合）
- 公告（首页 banner，管理端增删改/发布下线）与站内信广播、意见反馈工单（用户提交、管理端回复）
- 模板管理后台：模板列表与状态流转（发布/下架/打回）
- 运行时配置中心（Feature Flag：维护模式、开放注册开关，管理端热改无需重启）
- 系统运维面板（数据库/Redis/导出与预览队列/AI 状态与运行时长一览）
- 运维一键补救（重试失败任务、清理队列）与告警巡检（AI 失败/队列积压，记录告警 + 可选 webhook 通知）
- 多实例限流：配置 Redis 时登录/接口限流自动切换为 Redis 计数
- AI 快速生成（DeepSeek 接入，管理端配置模型与加密 API Key，强制登录 + 日配额 + 审计）
- Word 简历导入（`.docx` 在浏览器本地提取为纯文本，再进入 AI 结构化流程；支持拖拽与字数上限提示）
- 登录/接口限流、CSRF 同源校验、安全响应头与参数化查询
- 模板优先工作流、版本化模板状态与真实预览
- 前端提交、格式选择、轮询、失败提示和自动下载
- Redis/BullMQ 重试队列、256-bit 任务令牌和单 Worker 并发
- 模板专属 HTML/PDF 与 schema 驱动的可编辑 DOCX 导出
- 外部 DOCX 安全扫描、SHA-256、manifest 和许可证隔离

## 页面与 API 路由

- `/`：简历工作台首页，展示 AI 快速生成入口、极简轻卖点与最近草稿
- `/ai`：AI 快速生成页（需登录），粘贴描述或导入 Word 简历 → 结构化预览（uncertain 高亮）→ 保存草稿
- `/templates`：模板库，可直接刷新和分享入口地址
- `/drafts`：草稿管理页，继续编辑或删除草稿
- `/editor`：无远端草稿时的本地编辑器兼容入口
- `/resumes/:id/edit`：具体云端草稿编辑页，刷新后从 PostgreSQL 恢复
- `/login`：统一登录入口，登录后按角色跳转（管理员 → `/admin`，普通用户 → `/`）
- `/admin`：管理端（仅管理员可见），含用户/草稿/公告/反馈/模板/AI 配置/AI 调用/AI 成本/审计日志/回收站/配置/运维，按角色显示
- `POST /api/auth/register`：注册（邮箱或手机号 + 密码；可用 `DISABLE_REGISTRATION` 关闭）
- `POST /api/auth/login` / `POST /api/auth/logout`：登录（邮箱或手机号 + 密码）/ 退出
- `GET /api/auth/session`：读取当前会话用户
- `PATCH /api/me`：更新昵称与用户设置
- `GET /api/templates`：模板目录（公开）
- `POST /api/resumes`：按模板创建草稿（需登录）
- `POST /api/ai/generate`：AI 生成简历（需登录；仅支持极简轻，返回规范化 resume 与 uncertain 字段）
- `GET /api/ai/limits`：读取当前用户的 AI 输入上限与日配额（需登录；供前端做字数上限提示）
- `GET /api/resumes`：列出当前用户的最近草稿（需登录）
- `GET /api/resumes/:id`：读取草稿（仅限本人，否则 `404`）
- `PATCH /api/resumes/:id`：按版本号更新草稿，版本冲突返回 `409`（仅限本人）
- `DELETE /api/resumes/:id`：软删除草稿（进入回收站，可恢复；仅限本人）
- `POST /api/exports`：创建 PDF 或 DOCX 导出任务（需登录）
- `GET /api/admin/users`：列出用户（含草稿数、角色、禁用状态；需 `users.read`）
- `PATCH /api/admin/users/:id`：设置/取消管理员、设置角色、禁用/启用（需 `users.write`；设置角色仅超级管理员；不能操作自己）
- `DELETE /api/admin/users/:id`：软删除用户及其草稿（需 `users.delete`；不能删除自己）
- `POST /api/admin/users/:id/revoke-sessions`：踢下线（需 `sessions.manage`，使该用户全部会话立即失效）
- `GET /api/admin/resumes`：列出全站草稿（需 `resumes.read`）
- `GET /api/admin/resumes/:id` / `DELETE /api/admin/resumes/:id`：查看 / 软删除任意草稿（需 `resumes.read` / `resumes.delete`）
- `GET /api/admin/ai-config` / `PATCH /api/admin/ai-config`：读取 / 保存 AI 模型配置（需 `ai_config.read` / `ai_config.write`；API Key 加密落库、脱敏回显）
- `GET /api/admin/ai-logs`：AI 调用审计记录（需 `ai_logs.read`，只含元数据）
- `GET /api/admin/overview`：管理端概览统计（需 `overview.read`）
- `GET /api/admin/audit-logs`：管理员操作审计（需 `audit.read`）
- `GET /api/admin/recycle`：回收站（已删除用户与草稿；需 `recycle.read`）
- `POST /api/admin/recycle/users/:id/restore` / `DELETE /api/admin/recycle/users/:id`：恢复 / 彻底删除用户（需 `recycle.restore` / `recycle.purge`）
- `POST /api/admin/recycle/resumes/:id/restore` / `DELETE /api/admin/recycle/resumes/:id`：恢复 / 彻底删除草稿（需 `recycle.restore` / `recycle.purge`）
- `GET /api/admin/metrics`：运营趋势日序列与总计（需 `overview.read`；`?days=30`）
- `GET /api/admin/ai-costs`：AI 用量按模型与按日聚合（需 `ai_logs.read`；`?days=30`）
- `GET /api/announcements`：公开已发布公告（首页 banner）
- `GET/POST /api/admin/announcements`、`PATCH/DELETE /api/admin/announcements/:id`：公告管理（需 `announcements.read` / `announcements.write`）
- `POST /api/admin/messages/broadcast`：广播站内信（需 `announcements.write`）；`GET /api/me/messages`、`POST /api/me/messages/:id/read`：用户站内信
- `POST /api/feedback`：提交反馈（需登录）；`GET /api/admin/feedbacks`、`PATCH /api/admin/feedbacks/:id`：反馈工单（需 `feedback.read` / `feedback.write`）
- `GET /api/admin/templates`、`PATCH /api/admin/templates/:slug/versions/:version`：模板列表与状态流转（需 `templates.read` / `templates.write`）
- `GET /api/admin/config`、`PATCH /api/admin/config`：运行时配置中心（维护模式/开放注册，需 `config.read` / `config.write`）
- `GET /api/admin/system`：系统运维面板（数据库/Redis/队列/AI 状态，需 `system.read`）
- `POST /api/admin/system/retry-failed`：一键重试失败任务（需 `system.write`）
- `POST /api/admin/system/clean`：清理队列（`{ queue, type }`，需 `system.write`）
- `GET /api/admin/alerts` / `POST /api/admin/alerts/:id/ack`：告警记录与确认（需 `system.read` / `system.write`）
- 列表接口支持 `?format=csv` 导出（用户/草稿/AI 日志/审计日志，带 BOM 适配 Excel）

首页、模板库和编辑器提供固定顶部导航，编辑过程中可随时返回模板库。编辑器采用本地即时保存和后端串行自动保存。浏览器前进、后退和直接访问草稿 URL 均不会丢失页面状态；`remoteRevision` 与数据库版本号分离，避免本地排版修改次数干扰后端并发控制。
- 请求体、字段、模块和条目数量限制
- Docker 生产运行基线

## 项目结构

```text
resume-editor-mvp/
├─ public/
│  ├─ app.mjs                 编辑器状态与交互
│  ├─ core.mjs                数据模型和纯函数
│  ├─ resume-renderer.mjs     预览与打印共用模板
│  ├─ print.mjs / print.css   专用打印页逻辑和样式
│  └─ index.html / styles.css 编辑器页面
├─ server/
│  ├─ export-service.mjs      任务队列、令牌和生命周期
│  ├─ pdf-renderer.mjs        Playwright/Chromium PDF worker
│  ├─ docx-renderer.mjs       Python Word worker
│  ├─ database.mjs            PostgreSQL 连接
│  ├─ template-repository.mjs 模板与草稿仓储
│  ├─ print-document.mjs      安全打印文档
│  └─ validation.mjs          后端数据校验与规范化
├─ scripts/ingest-templates.mjs 模板抓取、扫描、预览和入库
├─ infra/postgres/init/       数据库 schema
├─ scripts/verify-export.mjs  真实 PDF 验证脚本
├─ tests/                     单元与 API 集成测试
├─ docs/export-architecture.md
├─ server.mjs                HTTP 与 API 入口
└─ Dockerfile
```

后端导出设计、接口契约、安全边界与横向扩容方案见 [docs/export-architecture.md](docs/export-architecture.md)。

登录、ownerId 权限隔离、用户设置与防攻击基线见 [docs/security.md](docs/security.md)。

## 当前部署边界

当前导出任务仍位于单个 Node 进程内，适合单实例正式 MVP。登录会话与限流器为单实例内存/PostgreSQL 实现。上线前需通过密钥系统替换示例数据库密码，并在反向代理后启用 TLS 与 `TRUST_PROXY`、`COOKIE_SECURE`。多实例部署应把任务迁移到 Redis/消息队列，把限流器与会话迁移到 Redis，把 PDF/DOCX 与模板资产迁移到对象存储，并让独立 worker 消费固定版本的简历快照。
