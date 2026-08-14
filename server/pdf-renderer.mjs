import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const PREVIEW_WIDTH = 820;
const PREVIEW_HEIGHT = 1160;
const CSS_PX_PER_INCH = 96;
const MM_PER_INCH = 25.4;
const A4_SCALE = Math.min(
  (210 / MM_PER_INCH * CSS_PX_PER_INCH) / PREVIEW_WIDTH,
  (297 / MM_PER_INCH * CSS_PX_PER_INCH) / PREVIEW_HEIGHT
);

function loadPlaywright() {
  try {
    return require("playwright");
  } catch (primaryError) {
    const configuredPath = process.env.PLAYWRIGHT_MODULE_PATH;
    if (configuredPath) return require(resolve(configuredPath));
    const error = new Error("未找到 Playwright。请先运行 npm install，并执行 npx playwright install chromium。");
    error.cause = primaryError;
    throw error;
  }
}

function resolveChromiumExecutable(chromium) {
  const candidates = [
    process.env.EXPORT_CHROMIUM_PATH,
    chromium.executablePath(),
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

export async function renderPdf({ url, outputPath, timeoutMs = 45_000 }) {
  const { chromium } = loadPlaywright();
  const executablePath = resolveChromiumExecutable(chromium);
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: process.env.EXPORT_CHROMIUM_NO_SANDBOX === "true"
      ? ["--no-sandbox", "--disable-setuid-sandbox"]
      : []
  });

  try {
    const page = await browser.newPage({
      viewport: { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT },
      deviceScaleFactor: 1
    });
    await page.emulateMedia({ media: "print" });
    await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });
    await page.waitForFunction(
      () => document.documentElement.dataset.exportReady === "true"
        || Boolean(document.documentElement.dataset.exportError),
      { timeout: timeoutMs }
    );

    const exportState = await page.evaluate(() => ({
      ready: document.documentElement.dataset.exportReady,
      error: document.documentElement.dataset.exportError,
      pages: Number(document.documentElement.dataset.exportPages || 0)
    }));
    if (exportState.error) throw new Error(exportState.error);
    if (exportState.ready !== "true" || exportState.pages < 1) throw new Error("打印页未完成布局");

    await page.pdf({
      path: outputPath,
      format: "A4",
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      printBackground: true,
      preferCSSPageSize: false,
      scale: A4_SCALE,
      tagged: true
    });
    return { pageCount: exportState.pages, scale: A4_SCALE };
  } finally {
    await browser.close();
  }
}

export { A4_SCALE };
