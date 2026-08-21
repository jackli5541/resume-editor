import { h, onBeforeUnmount, onMounted, ref } from "vue";
import { requestJson } from "../../../../public/api-client.mjs";

function timeLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export const MessagesDialog = {
  name: "MessagesDialog",
  setup() {
    const visible = ref(false), messages = ref([]), status = ref(""), callbacks = ref({});
    async function load() {
      status.value = "正在加载…";
      try { const payload = await requestJson("/api/me/messages", { cache: "no-store" }); messages.value = payload.messages || []; status.value = ""; }
      catch (error) { status.value = error?.message || "加载失败"; }
    }
    function open(nextCallbacks = {}) { callbacks.value = nextCallbacks; visible.value = true; load(); }
    function close() { visible.value = false; }
    async function markRead(id) {
      try { await requestJson(`/api/me/messages/${encodeURIComponent(id)}/read`, { method: "POST" }); await load(); await callbacks.value.onUnreadChange?.(); }
      catch { /* 保持既有静默失败行为 */ }
    }
    onMounted(() => { window.__resumeVueMessages = { open, close, load }; });
    onBeforeUnmount(() => { if (window.__resumeVueMessages?.open === open) delete window.__resumeVueMessages; });
    return () => h("div", { class: "auth-overlay", id: "messagesOverlay", hidden: !visible.value, onClick: (event) => { if (event.target === event.currentTarget) close(); } }, [
      h("div", { class: "auth-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "messagesTitle" }, [
        h("div", { class: "auth-dialog__head" }, [h("div", [h("span", { class: "eyebrow" }, "INBOX"), h("h2", { id: "messagesTitle" }, "站内信")]), h("button", { class: "auth-dialog__close", type: "button", "data-action": "close-messages", "aria-label": "关闭", onClick: close }, "×")]),
        h("div", { id: "messagesList", class: "messages-list" }, messages.value.length ? messages.value.map((message) => h("article", { class: ["message-item", { "is-unread": !message.readAt }], key: message.id }, [
          h("div", { class: "message-item__head" }, [h("strong", message.title), h("small", timeLabel(message.createdAt))]), h("p", message.content),
          !message.readAt ? h("button", { type: "button", "data-action": "message-mark-read", "data-message-id": message.id, onClick: () => markRead(message.id) }, "标记已读") : null
        ])) : !status.value ? h("p", { class: "admin-empty" }, "暂无站内信。") : null),
        h("p", { id: "messagesStatus", class: "library-status", role: "status" }, status.value)
      ])
    ]);
  }
};
