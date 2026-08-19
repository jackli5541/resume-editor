import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startServer } from "../server.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const slugs = [
  "clean-single",
  ...Array.from({ length: 10 }, (_, index) => `resume-collection-cn-${String(index + 1).padStart(3, "0")}`)
];

const app = await startServer({ port: 0, database: null, useRedis: false, disableFidelityPreview: true });
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 900, height: 1240 }, deviceScaleFactor: 1 });
  await page.goto(app.origin, { waitUntil: "networkidle" });

  for (const slug of slugs) {
    await page.evaluate(async (templateSlug) => {
      const [{ createInitialResume, resumeForTemplate }, { getTemplateSchema }, renderer] = await Promise.all([
        import("/core.mjs"),
        import("/template-schemas.mjs"),
        import("/resume-renderer.mjs")
      ]);
      const editorSchema = getTemplateSchema(templateSlug);
      const source = createInitialResume();
      source.profile = {
        ...source.profile,
        name: "林知夏",
        job: "产品经理",
        mobile: "138 0000 0000",
        email: "lin@example.com",
        city: "上海",
        birthday: "1996-08",
        gender: "女",
        education: "本科",
        age: "29"
      };
      source.title = `${editorSchema.name}简历`;
      const resume = resumeForTemplate(source, { slug: templateSlug, version: 1, name: editorSchema.name, editorSchema });
      resume.template = { slug: templateSlug, version: 1, name: editorSchema.name, editorSchema };

      document.body.innerHTML = '<main id="cover"><div class="resume-paper"><div class="resume-flow"></div></div></main>';
      const paper = document.querySelector(".resume-paper");
      const flow = document.querySelector(".resume-flow");
      document.documentElement.dataset.theme = "light";
      document.body.style.margin = "0";
      document.body.style.background = "#e8edf2";
      paper.style.width = "820px";
      paper.style.height = "1160px";
      paper.style.minHeight = "1160px";
      paper.style.boxShadow = "none";
      renderer.applyResumeSettings(paper, { ...resume.settings, fontSize: 12, lineHeight: 1.45, sectionGap: 11, pagePadding: 32 });
      renderer.applyResumeTemplate(paper, resume.template);
      flow.innerHTML = renderer.renderResumeMarkup(resume);
    }, slug);
    await page.locator(".resume-paper").screenshot({
      path: join(projectRoot, "var", "templates", slug, "v1", "preview.png")
    });
    console.log(`Generated full-page cover: ${slug}`);
  }
} finally {
  await browser.close();
  await new Promise((resolve) => app.server.close(resolve));
}
