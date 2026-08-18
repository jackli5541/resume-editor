const supportFloat = document.querySelector("#supportFloat");
const supportCard = document.querySelector("#supportCard");
const supportTrigger = document.querySelector('[data-action="toggle-support"]');
const feedbackTrigger = supportFloat?.querySelector('[data-action="open-feedback"]');
const supportQrcode = document.querySelector("#supportQrcode");
const supportTabs = document.querySelector("#supportTabs");
let features = { feedbackEnabled: true, supportEnabled: false, supportImages: [] };
let refreshPromise = null;

if (supportFloat && supportCard && supportTrigger) {
  const closeSupport = () => { supportCard.hidden = true; supportTrigger.setAttribute("aria-expanded", "false"); };
  function selectImage(index) {
    const image = features.supportImages[index];
    if (!image) return;
    supportQrcode.src = image.url;
    supportQrcode.alt = `${image.label}赞赏二维码`;
    supportTabs.querySelectorAll("button").forEach((button, i) => {
      button.setAttribute("aria-selected", String(i === index));
      button.classList.toggle("is-active", i === index);
    });
  }
  function renderImages() {
    supportTabs.innerHTML = features.supportImages.length > 1
      ? features.supportImages.map((image, index) => `<button type="button" role="tab" data-support-index="${index}" aria-selected="${index === 0}">${escapeText(image.label)}</button>`).join("") : "";
    selectImage(0);
  }
  function syncSupportEntry() {
    const blocked = !document.querySelector("#loginPage").hidden || !document.querySelector("#adminPage").hidden;
    supportTrigger.hidden = !features.supportEnabled;
    if (feedbackTrigger) feedbackTrigger.hidden = !features.feedbackEnabled;
    document.querySelectorAll('[data-action="open-feedback"]').forEach((button) => { button.hidden = !features.feedbackEnabled; });
    supportFloat.hidden = blocked || (!features.feedbackEnabled && !features.supportEnabled);
    if (blocked || !features.supportEnabled) closeSupport();
  }
  function refreshFeatures() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = fetch("/api/public/features", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => { features = payload; renderImages(); syncSupportEntry(); })
      .catch(() => syncSupportEntry())
      .finally(() => { refreshPromise = null; });
    return refreshPromise;
  }
  refreshFeatures();
  document.addEventListener("public-features-changed", refreshFeatures);
  document.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-support-index]");
    if (tab) { selectImage(Number(tab.dataset.supportIndex)); return; }
    if (event.target.closest('[data-action="toggle-support"]')) {
      if (!features.supportEnabled) return;
      const willOpen = supportCard.hidden;
      supportCard.hidden = !willOpen;
      supportTrigger.setAttribute("aria-expanded", String(willOpen));
      return;
    }
    if (event.target.closest('[data-action="close-support"]') || (!supportCard.hidden && !event.target.closest(".support-float"))) closeSupport();
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeSupport(); });
  const pageObserver = new MutationObserver(() => { syncSupportEntry(); refreshFeatures(); });
  ["#homePage", "#templateLibrary", "#draftPage", "#aiPage", "#adminPage", "#loginPage", "#app"].forEach((selector) => {
    const node = document.querySelector(selector); if (node) pageObserver.observe(node, { attributes: true, attributeFilter: ["hidden"] });
  });
  const accountObserver = new MutationObserver(syncSupportEntry);
  accountObserver.observe(document.body, { childList: true, subtree: true });
}

function escapeText(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
