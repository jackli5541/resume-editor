<p align="center">
  <img src="public/logo.png" alt="轻简历 Logo" width="72" />
</p>

<h1 align="center">轻简历 · 在线简历编辑器</h1>

<p align="center">
  面向大学生的<strong>免费</strong>在线简历编辑器 —— AI 生成 / 翻译简历 · 高保真模板 · 一键导出 PDF / Word
</p>

<p align="center">
  <strong>导出完全免费，不收费、不加水印。</strong>
</p>

---

## 简介

「轻简历」是一个面向大学生的在线简历编辑器。粘贴一段经历描述，AI 就能把它整理成结构化简历；也可上传 Word 简历，翻译成目标语言并套入模板。选个模板、微调一下，就能免费导出高清 PDF 或可编辑的 Word。

结构、排版和重点整理都替你做好，你只需要专注内容本身。

## 💡 为什么做这个项目

市面上的简历工具，导出要收费，下载模板还得自己逐项修改；让 AI 直接生成 Word 文档，排版又常常不尽如人意。于是我们做了「轻简历」——希望帮同学们轻松做出一份**清晰、美观、一眼见重点**的简历，而且**导出完全免费**。

## 🧠 为什么不是一次性 AI 简历生成器

很多工具把 AI 放在简历制作的第一步：输入一段经历，得到一份初稿，之后的大量修改仍要自己完成。轻简历把 AI 放进了完整、持续的编辑流程。

- **从生成到持续协作**：首次可由经历描述或 Word 简历生成内容；之后既能针对某个模块、某条项目经历精修，也能发起跨模块的大范围调整。
- **围绕岗位目标主动推进**：输入目标岗位与 JD 后，求职目标 Agent 会诊断当前简历与岗位要求的匹配度，给出证据矩阵、修改计划与风险提示；确认计划后再安全地执行对应改动，并保留任务与版本记录。
- **先提案，再应用**：AI 的修改以结构化提案呈现，可逐项检查、确认后再写入当前简历，避免一键重写覆盖原有内容。
- **翻译不是只翻文字**：上传 DOCX 后选择目标语言与模板，AI 会把翻译结果映射到对应字段，保存为草稿后直接进入在线编辑。
- **编辑、预览、导出保持一致**：模板、开源中文字体与排版设置在在线编辑、PDF 和 Word 导出中共用，减少“屏幕上好看、导出后变样”的问题。
- **任务不因离开页面丢失**：AI 生成、翻译和导出通过后台任务处理；刷新或暂时离开后可继续查看进度并恢复结果。

> 不只是 AI 生成一份简历，而是从首次生成、逐段精修、整份重构、翻译换版，到 PDF / Word 导出，AI 始终在同一份可编辑简历中协作。

## ✨ 功能亮点

- 🤖 **AI 生成简历**：粘贴经历描述（支持语音输入）或直接导入 Word 简历，AI 自动整理成结构化简历；没提到的信息绝不编造，不确定处高亮提示，随时可改。
- 🎯 **求职目标 Agent**：粘贴目标岗位描述，获得匹配度诊断、缺口证据、可执行优化计划与风险提示；由用户确认后，AI 按计划调整简历内容。
- 🌐 **AI 翻译简历**：上传 DOCX 后选择目标语言与模板，AI 翻译并映射到对应字段，自动保存为草稿进入在线编辑；生成与翻译任务支持进度查看和刷新后恢复。
- ✨ **AI 简历优化**：在编辑器里与 AI 对话，生成结构化修改提案（逐条 diff 预览），确认后一键应用到当前简历。
- 🎨 **高保真模板库**：多套模板即选即用，推荐模板重点展示；模板预览、在线编辑和导出尽量保持一致，并支持标签筛选。
- 🔤 **开源中文字体**：内置思源黑体、思源宋体、霞鹜文楷、朱雀仿宋等字体，预览与导出使用同一字体配置。
- 📄 **免费导出**：一键导出高清 PDF 或可编辑 Word，不收费、不加水印；后台任务可持续处理导出请求。
- 💾 **云端草稿**：注册后草稿保存在云端，换设备也能继续编辑；也支持本地自动保存与 JSON 备份。
- ✍️ **灵活排版**：模块显隐与排序、字体、字号、行距、页边距、主题色都可以调。
- 🌗 **外观主题**：浅色 / 深色模式一键切换，默认跟随系统偏好，选择本地保存。
- 🔔 **账号与通知**：注册时即时校验邮箱/手机号格式与密码强度、密码二次确认；站内信未读红点提醒、首页公告横幅与意见反馈（支持图片附件）。
- 🧭 **管理端配置**：管理员可配置 AI 功能开关、模板预览质量、字体及站点能力，并管理模板、用户、公告、反馈与审计记录。
- 🛡 **安全可控**：头像可选、内容白名单清洗、登录/反馈接口限流，个人信息由你掌控。

## 🚀 快速开始

**Windows 一键启动（推荐）：**

```powershell
git clone https://github.com/jackli5541/resume-editor.git
cd resume-editor
start.bat
```

首次运行会通过 Docker 启动 PostgreSQL、Redis 与文档 Worker，稍等片刻后访问 <http://127.0.0.1:4173>。

**轻量开发模式**（仅 PostgreSQL，适合只用内置模板联调）：

```powershell
start_dev.bat
```

### 页面导览

| 路由 | 说明 |
| --- | --- |
| `/` | 首页：AI 简历工具入口、功能简介与最近草稿 |
| `/ai` | AI 生成简历：粘贴描述（支持语音输入）或导入 Word → 结构化预览 → 保存草稿 |
| `/ai/translate` | AI 翻译简历：上传 DOCX → 选择语言与模板 → 翻译后保存草稿 |
| `/templates` | 模板库 |
| `/drafts` | 我的草稿 |
| `/support` | 意见反馈与赞赏支持 |
| `/admin` | 管理端（仅管理员可见） |

## 🧰 技术栈

- 前端：Vue 3 渐进式迁移 + 原生 ES Module，HTML / CSS / JS；现有页面与 DOM 协议保持兼容
- 后端：Node.js（无框架）、PostgreSQL、Redis + BullMQ
- 导出：Chromium / Playwright（PDF）、Python + LibreOffice（可编辑 DOCX）
- AI：兼容 DeepSeek 等 OpenAI 风格模型服务（可选，需自行配置 Key）

## 🔧 本地开发

环境要求：Node.js 20+、Python 3、LibreOffice 与 Poppler（文档 Worker）、Redis、PostgreSQL 16。

```powershell
npm install
npm start           # 启动 Web 服务
npm run dev:web     # 前端构建调试（Vite）
npm run build:web   # 构建 Vue 3 前端模块到 public/assets/vue/
npm test            # 运行测试
npm run verify:export
```

配置项见 [.env.example](.env.example)。生产环境必须设置强口令（`POSTGRES_PASSWORD` / `REDIS_PASSWORD`），并通过密钥系统注入 S3 凭据；部署步骤见下文「生产部署」。

## 📂 项目结构

```text
resume-editor/
├─ frontend/         Vue 3 渐进式前端模块与 Vite 构建配置
├─ public/           前端页面与渲染（原生模块）
├─ server/           Node 服务端：AI、认证、管理端、导出
├─ scripts/          模板入库、导出验证、运维脚本
├─ infra/postgres/   数据库 schema
├─ tests/            单元与 API 集成测试
├─ docs/             架构与安全文档
└─ server.mjs        HTTP 入口
```

## 📖 文档

- [导出架构](docs/export-architecture.md)
- [安全设计](docs/security.md)
- [AI 生成设计](docs/ai-generation-design.md)
- [原生模板规范](docs/native-template-authoring.md)
- [系统架构](docs/architecture.md)

## 🚀 生产部署（阿里云 ECS）

1. 复制 `.env.example` 为 `.env`：`POSTGRES_PASSWORD`、`REDIS_PASSWORD` 用强随机口令；`TRUST_PROXY=true`、`COOKIE_SECURE=true`；`ADMIN_EMAILS` 设为自己的邮箱；`SEED_TEST_USERS=false`。
2. 准备目录并授权非 root 容器写入：`mkdir -p var/{exports,previews,templates} && sudo chown -R 10001:10001 var`。
3. `docker compose up -d postgres redis && docker compose run --rm template-ingest && docker compose up -d app document-worker`。
4. 在宿主安装 nginx 或 Caddy，参考 `infra/nginx/nginx.conf` 或 `infra/caddy/Caddyfile` 终止 TLS；安全组只放行 22 / 80 / 443。
5. 应用与文档 Worker 均以非 root 用户（uid 10001）运行；`/health` 由反代隐藏。

## ☕ 赞赏支持

「轻简历」完全免费，导出也不收费。独立开发不易，AI 调用也有成本——如果它帮你做出了一份满意的简历、或省下了一笔模板订阅费，欢迎扫码请作者喝杯咖啡 ☕。

你的每一份心意，都会用来维持服务器与 AI 运行成本，让这个免费工具能一直开下去。

<p align="center">
  <img src="public/support-qrcode.png" alt="赞赏码" width="200" />
</p>

<p align="center"><sub>扫码赞赏 · 感谢支持</sub></p>

不管是否赞赏，都欢迎你点个 **Star ⭐**、提 **Issue**，或把项目分享给需要的同学。
