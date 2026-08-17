# 安全设计（登录、权限隔离与防攻击基线）

本文描述「轻简历编辑器」上线所需的安全边界。目标是在保持 MVP 简单的前提下，满足基本安全要求，并为后续接入大模型简历优化预留扩展点。

## 1. 认证：邮箱 / 手机号 + 密码，或手机号验证码登录（免密）

- 唯一登录标识为 `email` 或 `phone`（二者均唯一、均可为空，但注册时至少提供一个）；登录输入一个字段，后端按是否含 `@` 自动识别是邮箱还是手机号。
- 邮箱做小写规范化；手机号归一化为 `+` 加数字（`^\+?[0-9]{6,15}$`）。
- 密码使用 Node 内置 `crypto.scrypt`（N=16384、r=8、p=1、64 字节派生）加盐哈希，存储格式为 `scrypt$N$r$p$salt$hash`，永不落明文。
- 比较使用 `timingSafeEqual` 恒时比较；账号不存在时也对固定哑哈希执行一次比较，弱化账号枚举时序侧信道。
- 登录/注册统一返回「账号或密码不正确」，不区分「账号不存在」与「密码错误」。
- 密码 8–200 位，须同时包含字母与数字，并拦截常见弱口令（黑名单，见 `server/password-policy.mjs`）；昵称剥离控制字符与 `<>`。
- 手机号验证码登录（免密）：`send-code` 发码 + `login/code` 校验，新号自动注册（无密码，`users.password_hash` 可空）。验证码只存哈希、恒时比较、5 分钟过期、最多 5 次、用后即焚。
- 公开注册可由 `DISABLE_REGISTRATION=true` 关闭（邀请制上线）；测试账号由 `SEED_TEST_USERS` + 种子脚本创建，生产须关闭并改密。

## 2. 会话

- 登录成功后签发 256-bit 随机会话令牌，Cookie 名 `session`，属性 `HttpOnly; SameSite=Lax; Path=/; Max-Age`（HTTPS 后追加 `Secure`）。
- 服务端只存令牌的 SHA-256 摘要（`sessions.token_hash`），数据库泄漏不直接暴露有效令牌。
- 会话默认 30 天（`SESSION_TTL_DAYS`），退出登录立即删除会话记录并使 Cookie 失效。
- 单实例内存降级：未配置 `DATABASE_URL` 时使用内存 Map，仅限本地体验；正式上线必须用 PostgreSQL。

## 3. 授权：ownerId 权限隔离

- `resumes.owner_id` 外键到 `users.id`（`ON DELETE CASCADE`）。
- 所有草稿接口（创建、列表、读取、`PATCH`、`DELETE`）以及导出/高保真预览创建，均在 SQL 层按 `owner_id = 当前用户` 过滤：
  - 读取他人草稿、修改、删除他人草稿一律返回 `404`（不泄露存在性）。
  - 列表只返回自己的草稿。
- 模板库 `GET /api/templates` 保持公开；编辑、保存、导出必须登录。
- 导出/预览任务沿用 256-bit 能力令牌（`token`）轮询与下载，令牌不可枚举；任务创建本身已要求登录并校验归属。
- 历史匿名草稿（`owner_id IS NULL`）在上线后不会被任何已登录接口读取，视为遗留数据。

## 4. 用户设置

- 设置存于 `users.settings`（jsonb），`PATCH /api/me` 只接受白名单键：`theme`、`locale`、`ai`、`displayName`。
- `ai` 子对象预留：`enabled`、`targetRole`（意向岗位）、`tone`（语气）、`provider`，为后续简历优化提供用户级偏好，不存敏感凭据。

## 5. 管理端与管理员角色

- `users.is_admin` 标记管理员（准入开关）；`users.role` 细分权限（`super_admin` / `operator` / `auditor`，见 `server/permissions.mjs`）。`users.disabled` 标记禁用账户。
- 超级管理员由 `ADMIN_EMAILS` 的第一个邮箱唯一指定：注册或登录时命中自动获得 `is_admin=true` 与 `role=super_admin`；其余管理员（运营/审计）由超级管理员在管理端手动授予，无法通过环境变量批量授予。
- 所有 `/api/admin/*` 接口要求 `is_admin=true`（普通用户 `403`、未登录 `401`），并按角色检查权限：超级管理员拥有全部权限；运营可管理用户/草稿/回收站/AI 配置/审计；审计为只读。设置角色与操作管理员仅限超级管理员。
- 管理员能力：超级管理员可设置/取消管理员、设置角色、禁用/启用账户（禁用立即失效其全部会话）、软删除用户（连带软删除其草稿）、踢下线（撤销其全部会话）；运营（普通管理员）只能管理普通用户（禁用/删除/踢下线），不能设置管理员或角色，也不能操作任何管理员。列出/查看/软删除全站草稿；回收站恢复/彻底删除用户与草稿。
- 操作审计：所有管理端写操作写入 `admin_audit_log`（操作人/动作/对象/前后快照/IP/UA），可在管理端「审计日志」查看。
- 软删除：用户与草稿删除后进入回收站，可恢复或彻底删除；软删除用户释放邮箱/手机号唯一占用，允许重新注册。
- 自我保护：管理员不能修改自己的管理员状态/角色，也不能删除自己的账户，避免误操作把自己锁在门外。

## 6. 网络攻击防护

| 威胁 | 防护 |
| --- | --- |
| 暴力破解 / 撞库 | 登录按「IP + 标识（邮箱/手机号）」限流（5 次/15 分钟），按 IP 限流（30 次/15 分钟）；注册按 IP 限流（10 次/小时） |
| 机器人批量注册/登录 | 阿里云验证码（Captcha 2.0）人机验证：服务端用 RAM `ALIYUN_CAPTCHA_ACCESS_KEY_ID` / `ALIYUN_CAPTCHA_ACCESS_KEY_SECRET` 签名校验，前端用 `ALIYUN_CAPTCHA_SCENE_ID`（场景）+ `ALIYUN_CAPTCHA_PREFIX`（身份标）初始化；未配置时自动关闭 |
| 资源耗尽 | 导出 30 次/小时、高保真预览 60 次/小时（按用户，未登录按 IP） |
| CSRF | 状态变更请求校验 `Sec-Fetch-Site` 与 `Origin`，跨站直接 403；配合 `SameSite=Lax` Cookie |
| XSS | 富文本白名单清洗、模板渲染 `escapeHtml`、`Content-Security-Policy`（`script-src 'self'`） |
| 点击劫持 | `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` |
| MIME 嗅探 | `X-Content-Type-Options: nosniff` |
| SQL 注入 | 全部参数化查询（`pg` 占位符），无字符串拼接 SQL |
| 时序侧信道 | 会话令牌与密码比较使用 `timingSafeEqual` |
| 请求体炸弹 | `MAX_EXPORT_REQUEST_BYTES`（默认 4 MB）+ 流式长度校验；头像在浏览器端压缩后上传 |
| 路径穿越 | 静态资源与模板资产均做 `normalize` + 前缀校验 |

## 6.1 同人多账号检测（L1 + L2）

- 目标：把「同一人注册多个账号」的疑似关联标记出来，供管理员人工复核；**只标记、不自动封禁**。
- L1 服务端软指纹：由 `IP + User-Agent + Accept-Language + Accept-Encoding` 计算 SHA-256 签名（`server/device-fingerprint.mjs`）。
- L2 客户端设备指纹：前端 `public/fingerprint.mjs` 采集 canvas/WebGL/字体/屏幕/语言，生成 deviceId（缓存于 localStorage），注册/登录时经 `X-Device-Id` 头回传。
- 三种关联键分别落库 `user_device_fingerprints`（`client` / `soft` / `ip`），置信度从高到低；同一键关联 ≥2 个不同账号即进入「疑似多账号」列表。
- 管理端只读面板 `/api/admin/suspected-duplicates`（权限 `users.read`），按置信度、账号数、最近出现排序；`client`（高置信度）形成新关联时写入 `alert_log` 告警（`suspected_duplicate_accounts`）。
- `soft` 与 `ip` 分组只进只读列表、不触发告警，避免共享网络/NAT/同浏览器环境下的噪声刷屏。
- 可用 `DISABLE_DEVICE_FINGERPRINT=true` 整体关闭（如接第三方风控后）。指纹哈希不可逆，落库不存浏览器原始指纹明细。

## 7. 上线检查清单

1. 通过密钥系统注入 `DATABASE_URL`、`REDIS_URL`、`S3_*`，替换示例密码（`compose.yaml` 中的 `resume:resume`）。
2. 在应用前挂反向代理终止 TLS（nginx/Caddy），设置：
   - `TRUST_PROXY=true`（让限流拿到真实客户端 IP）
   - `COOKIE_SECURE=true`（会话 Cookie 加 `Secure`）
   - 由代理返回 HSTS 头
3. 设置 `ADMIN_EMAILS` / `ADMIN_PHONES` 指定管理员，按需 `DISABLE_REGISTRATION=true` 做邀请制；生产务必关闭 `SEED_TEST_USERS` 并修改测试账号默认密码。
4. 多实例部署时，把限流器与会话迁移到 Redis（当前为单实例内存实现），草稿读写仍需以 `owner_id` 为准。
5. 定期备份 PostgreSQL；`sessions` 与 `users` 属于敏感数据，注意访问控制。

## 8. 接入大模型简历优化的安全要求（后续）

- **密钥只在服务端**：大模型 API Key 通过密钥系统注入后端，绝不下发到浏览器或写入前端 `settings`。
- **授权不变**：AI 优化接口复用同一会话鉴权与 `ownerId`，只能处理本人草稿；输入/输出都走后端校验。
- **提示注入**：把用户简历视为不可信数据，用结构化字段而非自由拼接指令；系统提示词与用户内容明确隔离，避免简历文本越权改写指令。
- **PII 与审计**：简历含姓名、电话、邮箱等个人信息，外发到第三方模型前明确告知并遵守数据合规；建议记录调用日志（用户、目标模型、时长、是否命中限制）并做调用配额限流。
- **输出回写**：模型输出在写回草稿前经过与现有 `validation.mjs` 同级的规范化/长度限制，防止注入超长字段或富文本脚本。

## 9. 邮箱/手机号验证码登录（免密、新号自动注册）

已实现。与密码登录共用 `identifier` 模型（按是否含 `@` 自动识别邮箱/手机号），新号首次验证码登录时自动注册（无密码，`users.password_hash` 可空），登录方式不影响草稿 `ownerId` 隔离、管理端与前端路由结构。

1. **建表**：`verification_codes`（`identifier` / `code_hash` / `purpose` / `expires_at` / `attempts` / `consumed`），见 `infra/postgres/init/016_verification_codes.sql`。
2. **接口**：
   - `POST /api/auth/send-code`：`{ identifier }`（邮箱或手机号）→ 生成 6 位随机码，**只存哈希**，明文经邮件/短信通道发送；按「identifier 1 次/分钟 + IP 10 次/小时」双重限流，防轰炸。
   - `POST /api/auth/login/code`：`{ identifier, code }` → 校验哈希（`timingSafeEqual`）、5 分钟过期、最多 5 次尝试、用后即焚；成功后签发会话；新号自动注册。
3. **发送通道**：`server/mailer.mjs`（SMTP）与 `server/sms.mjs`（阿里云短信）抽象。各自环境变量齐备即启用真实发信；未配置时降级为「验证码打到服务端日志」，供本地跑通全流程。
   - 邮箱：`SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`（个人推荐，QQ/163 邮箱均提供 SMTP 授权码）。
   - 手机：`ALIYUN_SMS_ACCESS_KEY_ID` / `ALIYUN_SMS_ACCESS_KEY_SECRET` / `ALIYUN_SMS_SIGN_NAME` / `ALIYUN_SMS_TEMPLATE_CODE`（模板需含 `${code}` 变量）。
   - 这些密钥亦可在管理端「系统与安全 → 认证配置」中填写（`server/app-secrets.mjs`，AES-256-GCM 加密落库，`infra/postgres/init/017_app_secrets.sql`），且**优先于环境变量**；阿里云验证码的 AccessKey / 场景 ID 同样支持管理端配置。
4. **开关**：`phone_code_login_enabled` / `email_code_login_enabled` 为管理端可热改的 Feature Flag（见 `server/config.mjs`），关闭后对应验证码登录/发码接口返回 403。
5. **安全要点**：验证码只存哈希、恒时比较、用后即焚；发送与校验双重限流；免密账号 `password_hash` 为空，对其使用密码登录一律返回「账号或密码不正确」，不泄露账号是否仅支持验证码登录。
