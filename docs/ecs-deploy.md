# 阿里云 ECS 部署指南（中国香港 · Ubuntu 22.04 + Docker + Caddy）

> 目标：把「轻简历」跑在你的香港服务器 `8.217.134.179` 上，用 HTTPS 域名访问。
> 香港地域**无需备案**，域名实名认证后即可绑定。每做完一步再进下一步，卡住就把报错贴给我。

---

## 第 0 步：准备域名（先做，DNS 要等几分钟生效）

推荐：阿里云买便宜域名（10~30 元/年）

1. 打开 <https://wanwang.aliyun.com>（阿里云万网）。
2. 搜索一个便宜后缀，如 `.top` / `.xyz` / `.icu` / `.fun`，挑一个购买。
3. 按提示完成**实名认证**（身份证，通常几分钟~几小时）。
4. 买好后：阿里云控制台 →「域名」→ 找到你的域名 →「解析」→「添加记录」：
   - 记录类型：**A**
   - 主机记录：**@**
   - 记录值：**`8.217.134.179`**
   - 确定
5. 记下这个域名，第 6 步要用。

> 免费替代：duckdns.org 的子域名（需 Google/GitHub 账号，国内可能打不开，能用但不如买域名省心）。

---

## 第 1 步：安全组放行端口（在你刚建的香港实例上）

1. 控制台左侧「网络与安全」→「安全组」。
2. 找到香港实例 `i-j6c7z4uq821k1dqd4kk1` 的安全组 →「配置规则」→「入方向」→「手动添加」。
3. 添加 3 条规则（授权对象都填 `0.0.0.0/0`）：

   | 端口 | 用途 |
   | --- | --- |
   | 22 | SSH 登录 |
   | 80 | HTTP（申请证书用） |
   | 443 | HTTPS 访问 |

4. 保存。只有这 3 个端口对外，数据库(55432)/Redis(6379)/应用(4173) 不要放行。

---

## 第 2 步：连接服务器

1. 控制台 → 实例 → 找到香港实例 → 右侧「远程连接」。
2. 选「Workbench 远程连接」→「立即登录」（浏览器直接出现终端）。
3. 用户名 `root`，密码是你创建实例时设的。

---

## 第 3 步：安装 Docker

```bash
apt-get update && apt-get install -y curl
curl -fsSL https://get.docker.com | sh
```

验证：

```bash
docker --version
docker compose version
```

两个都能打印版本号即成功。

---

## 第 4 步：上传项目代码

**先在你 Windows 电脑上：**

1. 打开 `E:\Project\resume-editor-mvp`。
2. **删掉 `node_modules` 文件夹**（很大，服务器会重新装）。
3. 整个文件夹压缩成 `resume-editor-mvp.zip`。

**传到服务器（二选一）：**

- 方式 A（推荐）：电脑装 WinSCP（免费 <https://winscp.net>），主机 `8.217.134.179`、用户 `root`、密码，把 zip 拖到 `/root/`。
- 方式 B：阿里云 Workbench 远程连接窗口的「上传文件」按钮上传。

**回终端解压：**

```bash
cd /root
apt install -y unzip
unzip resume-editor-mvp.zip -d resume-editor
cd resume-editor
```

> zip 会连同 `.env`（含口令）一起上传，无需手动建。

---

## 第 5 步：改 Caddy 域名

```bash
nano infra/caddy/Caddyfile
```

把 `<域名> {` 改成你的域名，例如 `resume.top {`。`Ctrl+O` → 回车 → `Ctrl+X` 保存。

---

## 第 6 步：启动网站

```bash
mkdir -p var/exports var/previews var/templates
chown -R 10001:10001 var
docker compose up -d postgres redis
docker compose run --rm template-ingest
docker compose up -d app document-worker
```

> 第一次下载镜像、编译依赖，可能 10~20 分钟。用 `docker compose ps` 看状态。

---

## 第 7 步：安装 Caddy（自动 HTTPS）

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
sudo cp /root/resume-editor/infra/caddy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy 会自动向 Let's Encrypt 申请并续期证书（前提：域名已解析到 `8.217.134.179`，80/443 已放行）。

---

## 第 8 步：验证

浏览器打开 `https://你的域名`：

- 能看到简历编辑器首页 = 成功 ✅
- 用邮箱 `18058198084@163.com` 注册 → 自动成为管理员，能看到「管理端」。

---

## 第 9 步（可选）：填 DeepSeek API Key

管理员登录 → 管理端 → AI 配置 → 粘贴 `sk-` 开头的 Key → 保存。

- Key 会被 `.env` 里的主密钥 AES-256-GCM 加密后入库，明文不进配置。
- 没有 Key 就先跳过，AI 功能暂不可用，其余功能正常。

---

## 常见问题

- **Caddy 拿不到证书**：检查域名是否解析到 `8.217.134.179`、安全组是否放行 80/443。
- **内存不够**：4G 跑这套偏紧；若 OOM，把 `compose.yaml` 里 postgres 的 `mem_limit: 1g` 改成 `512m`。
- **改了代码要更新**：重新上传后 `docker compose up -d --build`。
- **杭州旧实例**：确认香港实例能用后，去杭州实例列表把 `i-bp14tmdajxz9uayijv4p` 释放，避免继续扣费。
