import { h, onBeforeUnmount, onMounted, ref } from "vue";
import { requestJson } from "../../../../public/api-client.mjs";

const tones = [
  ["professional", "专业严谨"], ["concise", "极简精炼"], ["confident", "自信有力"],
  ["quantified", "数据成果"], ["dynamic", "行动导向"], ["elegant", "文雅沉稳"]
];

export const SettingsDialog = {
  name: "SettingsDialog",
  setup() {
    const visible = ref(false), user = ref(null), callbacks = ref({});
    const settingsError = ref(""), passwordError = ref(""), savingSettings = ref(false), savingPassword = ref(false);
    const name = ref(""), aiEnabled = ref(false), aiRole = ref(""), aiTone = ref("professional");
    const currentPassword = ref(""), newPassword = ref(""), confirmNewPassword = ref("");

    function resetPassword() {
      currentPassword.value = ""; newPassword.value = ""; confirmNewPassword.value = ""; passwordError.value = "";
    }
    function open(nextUser, nextCallbacks = {}) {
      user.value = nextUser || null; callbacks.value = nextCallbacks;
      const settings = nextUser?.settings || {}, ai = settings.ai || {};
      name.value = nextUser?.displayName || ""; aiEnabled.value = Boolean(ai.enabled); aiRole.value = ai.targetRole || ""; aiTone.value = ai.tone || "professional";
      settingsError.value = ""; resetPassword(); visible.value = true;
    }
    function close() { visible.value = false; settingsError.value = ""; passwordError.value = ""; }
    async function saveSettings() {
      settingsError.value = ""; savingSettings.value = true;
      try {
        const payload = await requestJson("/api/me", { method: "PATCH", body: JSON.stringify({ displayName: name.value.trim(), settings: { ai: { enabled: aiEnabled.value, targetRole: aiRole.value.trim(), tone: aiTone.value } } }) });
        user.value = payload.user;
        callbacks.value.onUserChange?.(payload.user);
        close(); callbacks.value.onToast?.("设置已保存", "success");
      } catch (error) { settingsError.value = error?.message || "保存设置失败"; } finally { savingSettings.value = false; }
    }
    async function savePassword() {
      passwordError.value = "";
      if (newPassword.value !== confirmNewPassword.value) { passwordError.value = "两次输入的新密码不一致"; return; }
      savingPassword.value = true;
      try {
        const payload = await requestJson("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword: currentPassword.value, newPassword: newPassword.value, confirmPassword: confirmNewPassword.value }) });
        user.value = payload.user; callbacks.value.onUserChange?.(payload.user); resetPassword();
        callbacks.value.onToast?.("密码已更新，其他设备已退出登录", "success");
      } catch (error) { passwordError.value = error?.message || "修改密码失败"; } finally { savingPassword.value = false; }
    }
    onMounted(() => { window.__resumeVueSettings = { open, close }; });
    onBeforeUnmount(() => { if (window.__resumeVueSettings?.open === open) delete window.__resumeVueSettings; });
    return () => h("div", { class: "auth-overlay", id: "settingsOverlay", hidden: !visible.value, onClick: (event) => { if (event.target === event.currentTarget) close(); } }, [
      h("div", { class: "auth-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "settingsTitle" }, [
        h("div", { class: "auth-dialog__head" }, [h("div", [h("span", { class: "eyebrow" }, "SETTINGS"), h("h2", { id: "settingsTitle" }, "账户设置")]), h("button", { class: "auth-dialog__close", type: "button", "data-action": "close-settings", "aria-label": "关闭", onClick: close }, "×")]),
        h("form", { id: "settingsForm", noValidate: true, onSubmit: (event) => { event.preventDefault(); saveSettings(); } }, [
          h("label", { class: "form-field" }, [h("span", "昵称"), h("input", { type: "text", id: "settingsName", maxlength: 60, value: name.value, onInput: (event) => { name.value = event.target.value; } })]),
          h("p", { class: "auth-email", id: "settingsEmail" }, user.value?.email || user.value?.phone || ""),
          h("fieldset", { class: "settings-group" }, [h("legend", "AI 简历优化（即将上线）"), h("label", { class: "switch-field" }, [h("input", { type: "checkbox", id: "settingsAiEnabled", checked: aiEnabled.value, onChange: (event) => { aiEnabled.value = event.target.checked; } }), h("span", "开启 AI 优化建议")]), h("label", { class: "form-field" }, [h("span", "目标岗位"), h("input", { type: "text", id: "settingsAiRole", maxlength: 120, placeholder: "例如：高级产品经理", value: aiRole.value, onInput: (event) => { aiRole.value = event.target.value; } })]), h("label", { class: "form-field" }, [h("span", "表达风格"), h("select", { id: "settingsAiTone", value: aiTone.value, onChange: (event) => { aiTone.value = event.target.value; } }, tones.map(([value, label]) => h("option", { value }, label)))] )]),
          h("p", { class: "auth-error", id: "settingsError", role: "alert", hidden: !settingsError.value }, settingsError.value), h("button", { class: "primary-button auth-submit", type: "submit", disabled: savingSettings.value }, savingSettings.value ? "正在保存…" : "保存设置")
        ]),
        h("form", { id: "passwordForm", class: "settings-password-form", noValidate: true, onSubmit: (event) => { event.preventDefault(); savePassword(); } }, [h("fieldset", { class: "settings-group" }, [h("legend", { id: "passwordFormTitle" }, user.value?.hasPassword ? "修改密码" : "设置登录密码"), h("label", { class: "form-field", id: "currentPasswordField", hidden: !user.value?.hasPassword }, [h("span", "当前密码"), h("input", { type: "password", id: "currentPassword", autocomplete: "current-password", maxlength: 128, required: Boolean(user.value?.hasPassword), value: currentPassword.value, onInput: (event) => { currentPassword.value = event.target.value; } })]), h("label", { class: "form-field" }, [h("span", "新密码"), h("input", { type: "password", id: "newPassword", autocomplete: "new-password", minlength: 8, maxlength: 128, placeholder: "至少 8 位，包含字母和数字", required: true, value: newPassword.value, onInput: (event) => { newPassword.value = event.target.value; } })]), h("label", { class: "form-field" }, [h("span", "再次输入新密码"), h("input", { type: "password", id: "confirmNewPassword", autocomplete: "new-password", minlength: 8, maxlength: 128, required: true, value: confirmNewPassword.value, onInput: (event) => { confirmNewPassword.value = event.target.value; } })])]), h("p", { class: "auth-error", id: "passwordError", role: "alert", hidden: !passwordError.value }, passwordError.value), h("button", { class: "secondary-button auth-submit", type: "submit", disabled: savingPassword.value }, savingPassword.value ? "正在保存…" : "保存新密码")])
      ])
    ]);
  }
};
