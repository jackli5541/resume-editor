<p align="center">
  <img src="public/logo.png" alt="轻简历 Logo" width="72" />
</p>

<h1 align="center">轻简历 · 在线简历编辑器</h1>

<p align="center">
  面向大学生的<strong>免费</strong>在线简历编辑器 —— AI 一句话生成 · 模板即选即用 · 一键导出 PDF / Word
</p>

<p align="center">
  <strong>导出完全免费，不收费、不加水印。</strong>
</p>

---

## 简介

「轻简历」是一个面向大学生的在线简历编辑器。粘贴一段经历描述，AI 就能把它整理成结构化简历；选个模板、微调一下，就能免费导出高清 PDF 或可编辑的 Word。

结构、排版和重点整理都替你做好，你只需要专注内容本身。

## 💡 为什么做这个项目

市面上的简历工具，导出要收费，下载模板还得自己逐项修改；让 AI 直接生成 Word 文档，排版又常常不尽如人意。于是我们做了「轻简历」——希望帮同学们轻松做出一份**清晰、美观、一眼见重点**的简历，而且**导出完全免费**。

## ✨ 功能亮点

- 🤖 **AI 一句话生成**：粘贴经历描述（或直接导入 Word 简历），AI 自动整理成结构化简历；没提到的信息绝不编造，不确定处高亮提示，随时可改。
- 🎨 **模板库**：多套简历模板即选即用，无需自己动手改元素。
- 📄 **免费导出**：一键导出 PDF 或 Word，不收费、不加水印。
- 💾 **云端草稿**：注册后草稿保存在云端，换设备也能继续编辑；也支持本地自动保存与 JSON 备份。
- ✍️ **灵活排版**：模块显隐与排序、字体、字号、行距、页边距、主题色都可以调。
- 🛡 **安全可控**：头像可选、内容白名单清洗、登录与接口限流，个人信息由你掌控。

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
| `/` | 首页：AI 快速生成入口、功能简介与最近草稿 |
| `/ai` | AI 生成页：粘贴描述或导入 Word → 结构化预览 → 保存草稿 |
| `/templates` | 模板库 |
| `/drafts` | 我的草稿 |
| `/admin` | 管理端（仅管理员可见） |

## 🧰 技术栈

- 前端：原生 ES Module（无框架依赖），HTML / CSS / JS
- 后端：Node.js（无框架）、PostgreSQL、Redis + BullMQ
- 导出：Chromium / Playwright（PDF）、Python + LibreOffice（可编辑 DOCX）
- AI：DeepSeek（可选，需自行配置 Key）

## 🔧 本地开发

环境要求：Node.js 20+、Python 3、LibreOffice 与 Poppler（文档 Worker）、Redis、PostgreSQL 16。

```powershell
npm install
npm start           # 启动 Web 服务
npm test            # 运行测试
npm run verify:export
```

配置项见 [.env.example](.env.example)。生产环境请通过密钥系统注入数据库、Redis 与 S3 凭据，并替换示例密码。

## 📂 项目结构

```text
resume-editor/
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

## ☕ 赞赏支持

「轻简历」完全免费，导出也不收费。独立开发不易，AI 调用也有成本——如果它帮你做出了一份满意的简历、或省下了一笔模板订阅费，欢迎扫码请作者喝杯咖啡 ☕。

你的每一份心意，都会用来维持服务器与 AI 运行成本，让这个免费工具能一直开下去。

<p align="center">
  <img src="public/support-qrcode.png" alt="赞赏码" width="200" />
</p>

<p align="center"><sub>扫码赞赏 · 感谢支持</sub></p>

不管是否赞赏，都欢迎你点个 **Star ⭐**、提 **Issue**，或把项目分享给需要的同学。
