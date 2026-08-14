import { PAGE_HEIGHT, normalizeResume, pageCountForHeight } from "./core.mjs";
import { applyResumeSettings, paginateResumeLayout, renderResumeMarkup } from "./resume-renderer.mjs";

async function waitForImages(root) {
  const images = [...root.querySelectorAll("img")];
  await Promise.all(images.map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    });
  }));
}

async function renderExport() {
  const payloadNode = document.querySelector("#resumeExportData");
  const payload = JSON.parse(payloadNode.textContent);
  const resume = normalizeResume(payload.resume);
  const paper = document.querySelector("#resumePaper");
  const flow = document.querySelector("#resumeFlow");

  applyResumeSettings(paper, resume.settings);
  flow.innerHTML = renderResumeMarkup(resume);
  flow.style.fontSize = `${resume.settings.fontSize}px`;

  await document.fonts.ready;
  await waitForImages(flow);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const pageCount = pageCountForHeight(paginateResumeLayout(flow, PAGE_HEIGHT));
  paper.style.height = `${pageCount * PAGE_HEIGHT}px`;
  document.documentElement.dataset.exportPages = String(pageCount);
  document.documentElement.dataset.exportReady = "true";
}

renderExport().catch((error) => {
  document.documentElement.dataset.exportError = error?.message || "打印页渲染失败";
});
