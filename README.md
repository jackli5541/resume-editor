# 轻简历编辑器

一个结构化简历编辑、模板库与后端导出项目。用户先选择已发布模板，再进入实时 A4 编辑器；后端支持 Chromium PDF 和可继续编辑的 Word（DOCX）导出。PostgreSQL 保存模板版本及简历草稿，模板源文件和导出文件使用独立存储目录。

## 环境要求

- Node.js 20 或更高版本
- Python 3（Word 导出）
- Playwright Chromium，或服务器上可用的 Chrome/Edge（PDF 导出）
- PostgreSQL 16（正式运行；未配置时可使用内置模板进行本地体验）

## 本地启动

```powershell
cd E:\Project\resume-editor-mvp
npm install
npm run install:browser
npm start
```

访问 <http://127.0.0.1:4173>。编辑数据自动保存在浏览器 `localStorage`；创建模板草稿时也会写入 PostgreSQL。生成文件默认暂存在 `var/exports`，30 分钟后由服务清理。

Windows 上若已安装 Edge，可以跳过浏览器下载；服务会优先使用 `EXPORT_CHROMIUM_PATH`，其次使用 Playwright Chromium，再回退到系统 Edge/Chrome。

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
docker compose up -d postgres
docker compose run --rm template-ingest
docker compose up -d app
```

首次执行 `template-ingest` 会迁移数据库，从 ResumeCollection 下载前 10 个中文 DOCX，执行 OOXML 安全分析、生成第一页预览并写入模板库。访问 <http://127.0.0.1:4173>。停止服务使用 `docker compose down`；数据库、模板和导出卷默认保留。

容器固定 Playwright 版本，并安装 LibreOffice、Poppler 与 Noto CJK 字体。`EXPORT_CHROMIUM_NO_SANDBOX=true` 只用于已经隔离的容器环境，不建议在普通宿主机关闭 Chromium 沙箱。生产环境必须替换 Compose 示例密码，并通过密钥系统注入 `DATABASE_URL`。

## 模板入库与发布

模板版本具有三个状态：`ready` 可选择和导出，`needs_mapping` 已入库但仍需字段映射，`blocked` 未通过宏或外部关系安全检查。外部 DOCX 首次导入统一不会自动发布；这样可以保留原始版式预览，同时避免把静态文本框模板错误地当作动态模板。

当前内置 `clean-single@1` 为 `ready`，支持 PDF 与可编辑 DOCX。外部模板完成 `slot_map` 适配、导出回归和许可证确认后，才应更新为 `ready`。来源仓库许可证未能确认时会记录为 `unverified`，不得直接用于公开商业模板库。

宿主机直接执行入库时：

```powershell
npm run db:migrate
npm run templates:ingest
```

## 配置

复制 `.env.example` 中的变量到部署环境。Node 本身不会自动读取 `.env` 文件，生产环境应由进程管理器、容器平台或密钥系统注入变量。

- `HOST` / `PORT`：监听地址与端口
- `DATABASE_URL`：PostgreSQL 连接串
- `TEMPLATE_STORAGE_DIR`：模板源文件、预览和 manifest 目录
- `EXPORT_DIR`：临时 PDF/DOCX 目录
- `MAX_EXPORT_REQUEST_BYTES`：导出请求体上限
- `EXPORT_IMAGE_HOSTS`：允许后端加载的 HTTPS 头像域名，逗号分隔
- `EXPORT_CHROMIUM_PATH`：固定 Chromium/Edge 可执行文件
- `EXPORT_CHROMIUM_NO_SANDBOX`：是否为隔离容器关闭浏览器沙箱
- `PYTHON_BIN` / `SOFFICE_BIN` / `PDFTOPPM_BIN`：Word 生成和模板预览工具路径

## 主要能力

- 基本信息、求职意向、教育、工作、项目、技能和自我评价编辑
- 模块显隐、移动、拖拽排序和经历条目管理
- 富文本白名单清洗；头像完全可选，无效或不受信任头像会被忽略而不会阻断导出
- 字体、字号、行距、页边距、模块间距和主题色配置
- 本地自动保存、JSON 备份与导入
- 模板优先工作流、版本化模板状态与真实预览
- 前端提交、格式选择、轮询、失败提示和自动下载
- 后端单并发队列、256-bit 任务令牌、过期清理
- 专用打印路由、字体与图片等待、固定 Chromium A4 PDF
- 后端生成可编辑 A4 DOCX，头像始终可选
- 外部 DOCX 安全扫描、SHA-256、manifest 和许可证隔离
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

## 当前部署边界

当前导出任务仍位于单个 Node 进程内，适合单实例正式 MVP。上线前还需要接入用户会话和 `ownerId`，把示例数据库密码替换为密钥。多实例部署应把任务迁移到 Redis/消息队列，把 PDF/DOCX 与模板资产迁移到对象存储，并让独立 worker 消费固定版本的简历快照。
