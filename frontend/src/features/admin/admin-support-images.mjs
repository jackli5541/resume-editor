import { h, onBeforeUnmount, onMounted, ref } from "vue";

export const AdminSupportImages = {
  name: "AdminSupportImages",
  setup() {
    const images = ref([]), canWrite = ref(false);
    const setImages = (nextImages, options = {}) => { images.value = Array.isArray(nextImages) ? nextImages : []; canWrite.value = Boolean(options.canWrite); };
    onMounted(() => { window.__resumeVueAdminSupportImages = { setImages }; });
    onBeforeUnmount(() => { if (window.__resumeVueAdminSupportImages?.setImages === setImages) delete window.__resumeVueAdminSupportImages; });
    return () => images.value.length ? images.value.map((image, index) => h("article", { class: "admin-support-image", "data-support-id": image.id, "data-sort-order": image.sortOrder }, [
      h("img", { src: image.url, alt: image.label || "", loading: "lazy" }),
      h("input", { type: "text", value: image.label || "", maxlength: 30, "aria-label": "赞赏码名称", disabled: !canWrite.value }),
      h("label", { class: "admin-check-row admin-support-image__enabled" }, [h("input", { type: "checkbox", checked: Boolean(image.enabled), disabled: !canWrite.value }), h("span", "启用")]),
      h("div", { class: "admin-support-image__actions" }, [
        h("button", { type: "button", "data-support-action": "up", disabled: !canWrite.value || index === 0 }, "上移"),
        h("button", { type: "button", "data-support-action": "down", disabled: !canWrite.value || index === images.value.length - 1 }, "下移"),
        h("button", { type: "button", "data-support-action": "delete", disabled: !canWrite.value }, "删除")
      ])
    ])) : h("p", { class: "admin-empty" }, "尚未上传赞赏码，用户端不会展示赞赏入口。");
  }
};
