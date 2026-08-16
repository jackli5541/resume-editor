// 运行时配置中心：白名单 Feature Flag，可被管理端热改（含类型与默认值）。
// 敏感项（密钥/连接串）仍走环境变量/密钥系统，绝不进这里。
const CONFIG_SCHEMA = Object.freeze({
  maintenance_mode: Object.freeze({
    type: "boolean",
    defaultValue: false,
    label: "维护模式",
    description: "开启后，普通用户的写操作（创建/保存/导出等）将返回 503"
  }),
  registration_enabled: Object.freeze({
    type: "boolean",
    defaultValue: true,
    label: "开放注册",
    description: "关闭后，新用户将无法注册（环境变量 DISABLE_REGISTRATION 仍为硬开关）"
  }),
  phone_code_login_enabled: Object.freeze({
    type: "boolean",
    defaultValue: false,
    label: "手机验证码登录",
    description: "开启后，手机号验证码登录/注册可用（短信通道由 ALIYUN_SMS_* 环境变量配置；默认关闭）"
  }),
  email_code_login_enabled: Object.freeze({
    type: "boolean",
    defaultValue: false,
    label: "邮箱验证码登录",
    description: "开启后，邮箱验证码登录/注册可用（SMTP 通道由 SMTP_* 环境变量配置；默认关闭）"
  })
});

const CONFIG_KEYS = Object.keys(CONFIG_SCHEMA);

export class AppConfigService {
  constructor({ database } = {}) {
    this.database = database;
    this.memory = new Map();
    this.cache = { at: 0, values: null };
    this.ttlMs = 5000;
  }

  async all() {
    const now = Date.now();
    if (this.cache.values && now - this.cache.at < this.ttlMs) return this.cache.values;

    const values = {};
    for (const key of CONFIG_KEYS) values[key] = CONFIG_SCHEMA[key].defaultValue;

    if (this.database) {
      const result = await this.database.query(
        "SELECT key, value FROM app_config WHERE key = ANY($1)",
        [CONFIG_KEYS]
      );
      for (const row of result.rows) {
        const schema = CONFIG_SCHEMA[row.key];
        if (!schema) continue;
        values[row.key] = schema.type === "boolean" ? Boolean(row.value) : row.value;
      }
    } else {
      for (const key of CONFIG_KEYS) {
        if (this.memory.has(key)) values[key] = this.memory.get(key);
      }
    }

    this.cache = { at: now, values };
    return values;
  }

  async get(key) {
    if (!CONFIG_SCHEMA[key]) return undefined;
    const all = await this.all();
    return all[key];
  }

  async set(entries, { updatedBy = null } = {}) {
    const updates = {};
    for (const [key, raw] of Object.entries(entries || {})) {
      const schema = CONFIG_SCHEMA[key];
      if (!schema) continue;
      updates[key] = schema.type === "boolean" ? Boolean(raw) : raw;
    }

    if (this.database) {
      for (const [key, value] of Object.entries(updates)) {
        await this.database.query(
          `INSERT INTO app_config (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [key, JSON.stringify(value), updatedBy || null]
        );
      }
    } else {
      for (const [key, value] of Object.entries(updates)) this.memory.set(key, value);
    }

    this.cache = { at: 0, values: null };
    return this.all();
  }
}

export function configSchema() {
  return CONFIG_SCHEMA;
}
