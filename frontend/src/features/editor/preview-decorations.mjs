import { h, onBeforeUnmount, onMounted, ref } from "vue";

export const PageMarkers = {
  name: "PageMarkers",
  setup() {
    const pages = ref(1), height = ref(1122);
    const setPages = (nextPages, nextHeight) => { pages.value = Math.max(1, Number(nextPages) || 1); height.value = Number(nextHeight) || 1122; };
    onMounted(() => { window.__resumeVuePageMarkers = { setPages }; });
    onBeforeUnmount(() => { if (window.__resumeVuePageMarkers?.setPages === setPages) delete window.__resumeVuePageMarkers; });
    return () => Array.from({ length: pages.value - 1 }, (_, index) => h("div", { class: "page-marker", style: { top: `${(index + 1) * height.value - 1}px` } }, [h("span", `第 ${index + 1} 页`), h("i"), h("span", `第 ${index + 2} 页`)]));
  }
};

export const FidelityPreview = {
  name: "FidelityPreview",
  setup() {
    const pages = ref([]);
    const setPages = (nextPages) => { pages.value = Array.isArray(nextPages) ? nextPages : []; };
    onMounted(() => { window.__resumeVueFidelityPreview = { setPages }; });
    onBeforeUnmount(() => { if (window.__resumeVueFidelityPreview?.setPages === setPages) delete window.__resumeVueFidelityPreview; });
    return () => pages.value.map((page, index) => h("img", { src: page.url || page, alt: page.alt || `成品预览第 ${index + 1} 页`, loading: index ? "lazy" : "eager" }));
  }
};
