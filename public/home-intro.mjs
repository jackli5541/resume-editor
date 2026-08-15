// 首页介绍动画：标题打字机、AI 生成演示循环、滚动揭示。
// 仅依赖 DOM API 与定时器，符合页面 CSP（script-src 'self'）。

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- 标题轮播打字机 ----------
const heroRotator = document.querySelector("#heroRotator");
const heroPhrases = [
  "一句话生成简历",
  "无需整理个人信息",
  "AI 自动结构化填充",
  "不编造、可微调",
  "导出即用"
];

function runHeroRotator() {
  if (!heroRotator) return;
  let phraseIndex = 0;
  let charIndex = 0;
  let deleting = false;

  function tick() {
    const phrase = heroPhrases[phraseIndex % heroPhrases.length];
    charIndex += deleting ? -1 : 1;
    heroRotator.textContent = phrase.slice(0, charIndex);

    let delay = deleting ? 42 : 68;
    if (!deleting && charIndex === phrase.length) {
      delay = 1600;
      deleting = true;
    } else if (deleting && charIndex === 0) {
      deleting = false;
      phraseIndex = (phraseIndex + 1) % heroPhrases.length;
      delay = 360;
    }
    setTimeout(tick, delay);
  }

  tick();
}

// ---------- AI 生成演示循环 ----------
const demoRoot = document.querySelector(".ai-demo");
const demoTextEl = document.querySelector("[data-ai-demo-text]");
const demoStatusEl = document.querySelector("[data-ai-demo-status]");

const demoPrompt = "5 年 Java 后端，负责订单系统重构，接口 QPS 从 800 提到 1200，带过 3 人小组…";

async function typeText(el, text, speed) {
  for (let i = 0; i <= text.length; i += 1) {
    el.textContent = text.slice(0, i);
    await sleep(speed);
  }
}

async function runDemoLoop() {
  if (!demoRoot || !demoTextEl) return;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    demoRoot.classList.remove("is-filled");
    if (demoStatusEl) demoStatusEl.textContent = "AI 正在整理…";
    demoTextEl.textContent = "";
    await typeText(demoTextEl, demoPrompt, 38);
    await sleep(520);
    demoRoot.classList.add("is-filled");
    if (demoStatusEl) demoStatusEl.textContent = "已自动整理为结构化简历 ✓";
    await sleep(2800);
  }
}

// ---------- 滚动揭示 ----------
const revealTargets = document.querySelectorAll(".reveal");

function revealAll() {
  revealTargets.forEach((el) => el.classList.add("is-visible"));
}

function observeReveals() {
  if (!("IntersectionObserver" in window)) {
    revealAll();
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12 }
  );
  revealTargets.forEach((el) => observer.observe(el));
}

// ---------- 平台初衷便签：显示 15s → 淡出隐藏 30s → 循环 ----------
const aboutNote = document.querySelector(".home-about");
const ABOUT_SHOW_MS = 15000;
const ABOUT_HIDE_MS = 30000;

function runAboutNoteCycle() {
  if (!aboutNote) return;
  const show = () => {
    aboutNote.classList.remove("is-faded");
    setTimeout(hide, ABOUT_SHOW_MS);
  };
  const hide = () => {
    aboutNote.classList.add("is-faded");
    setTimeout(show, ABOUT_HIDE_MS);
  };
  aboutNote.classList.remove("is-faded");
  setTimeout(hide, ABOUT_SHOW_MS);
}

// ---------- 启动 ----------
if (reducedMotion) {
  if (heroRotator) heroRotator.textContent = heroPhrases[0];
  revealAll();
  if (demoRoot) {
    demoRoot.classList.add("is-filled");
    if (demoTextEl) demoTextEl.textContent = demoPrompt;
    if (demoStatusEl) demoStatusEl.textContent = "已自动整理为结构化简历 ✓";
  }
} else {
  runHeroRotator();
  runDemoLoop();
  observeReveals();
  runAboutNoteCycle();
}
