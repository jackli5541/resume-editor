// 邮件发送：生产用 SMTP（nodemailer）。
// 配置来源：构造时传入的 getConfig 异步回调（管理端配置 > 环境变量），
// 或未传时直接读环境变量；未配置时降级为「开发模式」——把内容打到服务端日志。

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function configFromEnv() {
  return {
    host: process.env.SMTP_HOST || "",
    port: process.env.SMTP_PORT || "465",
    secure: process.env.SMTP_SECURE !== "false",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || ""
  };
}

export class MailerService {
  constructor({ getConfig } = {}) {
    this.getConfig = getConfig;
  }

  async send(to, subject, text) {
    const cfg = this.getConfig ? await this.getConfig() : configFromEnv();
    const enabled = Boolean(cfg.host && cfg.user && cfg.pass && cfg.from);

    if (!enabled) {
      console.log(`[Mail dev] ${subject} -> ${to}\n${text}`);
      return { dev: true };
    }

    let nodemailer;
    try {
      nodemailer = require("nodemailer");
    } catch {
      throw new Error("未找到 nodemailer，请运行 npm install 后再试");
    }

    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: Number(cfg.port) || 465,
      secure: cfg.secure !== false,
      auth: { user: cfg.user, pass: cfg.pass }
    });
    await transporter.sendMail({ from: cfg.from, to, subject, text });
    return { ok: true };
  }
}
