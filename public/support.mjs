// 赞赏入口：右侧悬浮按钮，点击展开赞赏码卡片。
// 独立模块，避免与编辑器主体逻辑（app.mjs）相互耦合。
const supportFloat = document.querySelector("#supportFloat");
const supportCard = document.querySelector("#supportCard");
const supportTrigger = document.querySelector('[data-action="toggle-support"]');

if (supportFloat && supportCard && supportTrigger) {
  function toggleSupport() {
    const willOpen = supportCard.hidden;
    supportCard.hidden = !willOpen;
    supportTrigger.setAttribute("aria-expanded", String(!willOpen));
  }

  function closeSupport() {
    supportCard.hidden = true;
    supportTrigger.setAttribute("aria-expanded", "false");
  }

  // 登录页、管理页不展示赞赏入口；页面切换时同步可见性并收起卡片。
  function syncSupportEntry() {
    const loginPage = document.querySelector("#loginPage");
    const adminPage = document.querySelector("#adminPage");
    const blocked = !loginPage.hidden || !adminPage.hidden;
    supportFloat.hidden = blocked;
    closeSupport();
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest('[data-action="toggle-support"]')) {
      toggleSupport();
      return;
    }
    if (event.target.closest('[data-action="close-support"]')) {
      closeSupport();
      return;
    }
    if (!supportCard.hidden && !event.target.closest(".support-float")) closeSupport();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !supportCard.hidden) closeSupport();
  });

  // 监听各页面可见性变化（SPA 切换通过 hidden 属性切换页面）。
  const pageObserver = new MutationObserver(syncSupportEntry);
  ["#homePage", "#templateLibrary", "#draftPage", "#aiPage", "#adminPage", "#loginPage", "#app"].forEach((selector) => {
    const node = document.querySelector(selector);
    if (node) pageObserver.observe(node, { attributes: true, attributeFilter: ["hidden"] });
  });
}
