import { h, onBeforeUnmount, onMounted, ref } from "vue";

const GROUP_LABELS = { ai: "AI 用户功能", engagement: "反馈与赞赏", access: "账号与访问", document: "文档与预览", system: "系统运行" };
const GROUP_ORDER = ["ai", "engagement", "access", "document", "system"];
const AUTH_SECRET_FIELDS = [
  ["aliyun_captcha_access_key_id", "AccessKey ID（RAM）", "人机验证（阿里云验证码）", "text"], ["aliyun_captcha_access_key_secret", "AccessKey Secret（RAM）", "人机验证（阿里云验证码）", "password"], ["aliyun_captcha_scene_id", "场景 ID（SceneId）", "人机验证（阿里云验证码）", "text"], ["aliyun_captcha_prefix", "身份标（prefix）", "人机验证（阿里云验证码）", "text"],
  ["smtp_host", "SMTP 主机", "邮箱验证码（SMTP）", "text"], ["smtp_port", "SMTP 端口", "邮箱验证码（SMTP）", "text"], ["smtp_secure", "SMTP 加密（true/false）", "邮箱验证码（SMTP）", "text"], ["smtp_user", "SMTP 账号", "邮箱验证码（SMTP）", "text"], ["smtp_pass", "SMTP 密码/授权码", "邮箱验证码（SMTP）", "password"], ["smtp_from", "发件人地址", "邮箱验证码（SMTP）", "text"],
  ["aliyun_sms_access_key_id", "AccessKey ID", "手机验证码（阿里云短信）", "text"], ["aliyun_sms_access_key_secret", "AccessKey Secret", "手机验证码（阿里云短信）", "password"], ["aliyun_sms_sign_name", "短信签名", "手机验证码（阿里云短信）", "text"], ["aliyun_sms_template_code", "模板 Code", "手机验证码（阿里云短信）", "text"]
];

function bridge(name, method, setter) {
  const value = window[name] || {};
  value[method] = setter;
  window[name] = value;
  return () => { if (window[name]?.[method] === setter) delete window[name][method]; if (window[name] && !Object.keys(window[name]).length) delete window[name]; };
}

export const AdminAuthStatus = {
  name: "AdminAuthStatus",
  setup() {
    const status = ref(null); let remove;
    onMounted(() => { remove = bridge("__resumeVueAdminAuth", "setStatus", (value) => { status.value = value || null; }); });
    onBeforeUnmount(() => remove?.());
    const badge = (configured, text = "未配置（开发模式）") => h("span", { class: configured ? "auth-status-badge is-on" : "auth-status-badge is-off" }, configured ? "已配置" : text);
    return () => {
      const value = status.value;
      if (!value) return null;
      return [h("span", { class: "admin-auth-status__label" }, "认证渠道状态"),
        h("span", { class: "admin-auth-status__item" }, ["人机验证（阿里云验证码）：", value.captchaEnabled ? "开启" : "关闭", " · 密钥 ", badge(value.captchaConfigured, "未配置密钥")]),
        h("span", { class: "admin-auth-status__item" }, ["邮箱验证码登录：", value.emailCodeLoginEnabled ? "开启" : "关闭", " · 通道 ", badge(value.emailConfigured)]),
        h("span", { class: "admin-auth-status__item" }, ["手机验证码登录：", value.phoneCodeLoginEnabled ? "开启" : "关闭", " · 通道 ", badge(value.phoneConfigured)]),
        h("small", "开关在「运行配置」中设置；密钥在「认证配置」中填写（加密落库，优先于环境变量）。")];
    };
  }
};

export const AdminConfigFields = {
  name: "AdminConfigFields",
  setup() {
    const schema = ref({}), values = ref({}), canWrite = ref(false); let remove;
    onMounted(() => { remove = bridge("__resumeVueAdminConfig", "setFields", (nextSchema, nextValues, options = {}) => { schema.value = nextSchema || {}; values.value = nextValues || {}; canWrite.value = Boolean(options.canWrite); }); });
    onBeforeUnmount(() => remove?.());
    return () => {
      const groups = {};
      Object.entries(schema.value).forEach(([key, meta]) => { (groups[meta.group || "system"] ||= []).push([key, meta]); });
      return GROUP_ORDER.filter((group) => groups[group]?.length).map((group) => h("section", { class: "admin-config-group" }, [
        h("h3", GROUP_LABELS[group] || group),
        h("div", { class: "admin-config-group__fields" }, groups[group].map(([key, meta]) => {
          if (meta.type === "enum") return h("label", { class: "admin-field" }, [h("span", { class: "admin-field__label" }, meta.label || key), h("select", { "data-config-key": key, disabled: !canWrite.value, value: values.value[key] }, (meta.options || []).map((option) => h("option", { value: option.value, selected: values.value[key] === option.value }, option.label))), h("small", meta.description || "")]);
          return h("label", { class: "admin-check-row" }, [h("input", { type: "checkbox", "data-config-key": key, checked: Boolean(values.value[key]), disabled: !canWrite.value }), h("span", [h("strong", meta.label || key), h("small", meta.description || "")])]);
        }))
      ]));
    };
  }
};

export const AdminAuthSecretFields = {
  name: "AdminAuthSecretFields",
  setup() {
    const secrets = ref({}), canWrite = ref(false); let remove;
    onMounted(() => { remove = bridge("__resumeVueAdminAuth", "setSecrets", (nextSecrets, options = {}) => { secrets.value = nextSecrets || {}; canWrite.value = Boolean(options.canWrite); }); });
    onBeforeUnmount(() => remove?.());
    return () => {
      const groups = {};
      AUTH_SECRET_FIELDS.forEach((field) => { (groups[field[2]] ||= []).push(field); });
      return Object.entries(groups).map(([group, fields]) => h("div", { class: "admin-secret-group" }, [h("span", { class: "admin-secret-group__label" }, group), ...fields.map(([key, label, , type]) => {
        const record = secrets.value[key] || {};
        return h("div", { class: "admin-field" }, [h("span", { class: "admin-field__label" }, label), h("div", { class: "admin-key-row" }, [h("input", { type, "data-secret-key": key, placeholder: record.set ? (record.hint || "已配置") : "未配置", autocomplete: "new-password", disabled: !canWrite.value }), record.set && canWrite.value ? h("button", { type: "button", class: "danger-link", "data-action": "admin-clear-secret", "data-secret-key": key }, "清除") : null])]);
      })]));
    };
  }
};
