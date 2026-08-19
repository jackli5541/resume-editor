import test from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { createInitialResume, resumeForTemplate } from "../public/core.mjs";
import { renderResumeMarkup } from "../public/resume-renderer.mjs";
import { TEMPLATE_SCHEMAS } from "../public/template-schemas.mjs";
import { TemplateRepository } from "../server/template-repository.mjs";
import { buildEditorSchema } from "../scripts/template-editor-mappings.mjs";

const EXPECTED_NATIVE_SECTIONS = {
  "resume-collection-cn-001": ["summary", "education", "experience", "skills"],
  "resume-collection-cn-002": ["education", "summary", "experience", "campus", "certificates"],
  "resume-collection-cn-003": ["education", "courses", "skills", "awards", "experience", "summary"],
  "resume-collection-cn-004": ["experience", "education", "certificates", "summary"],
  "resume-collection-cn-005": ["objective", "education", "experience", "awards", "summary", "interests"],
  "resume-collection-cn-006": ["summary", "objective", "education", "experience", "campus", "certificates", "interests"],
  "resume-collection-cn-007": ["summary", "experience", "education", "courses", "awards", "skills", "languages"],
  "resume-collection-cn-008": ["summary", "experience", "objective", "education", "courses", "awards", "competencies", "certificates"],
  "resume-collection-cn-009": ["summary", "education", "experience", "campus", "awards"],
  "resume-collection-cn-010": ["summary", "education", "experience", "awards"]
};

test("DOCX 模板从各自槽位生成独立 editorSchema v3", async () => {
  const signatures = new Set();
  for (const [slug, expectedSections] of Object.entries(EXPECTED_NATIVE_SECTIONS)) {
    const manifest = JSON.parse(await readFile(join("var", "templates", slug, "v1", "manifest.json"), "utf8"));
    const schema = manifest.manifest.editorSchema;
    assert.equal(schema.schemaVersion, 3);
    assert.deepEqual(schema.sections.map((section) => section.id), expectedSections);
    assert.deepEqual(schema, buildEditorSchema(slug, manifest.manifest.nativeSlots));
    assert.ok(schema.profileFields.includes("name"));
    assert.ok(schema.profileFields.includes("photo"));
    assert.ok(schema.sections.every((section) => section.fields.length > 0));
    signatures.add(JSON.stringify({ profile: schema.profileFields, sections: schema.sections.map((section) => [section.id, section.fields]) }));
  }
  assert.ok(signatures.size >= 8);
  const profileSignatures = new Set();
  for (const slug of Object.keys(EXPECTED_NATIVE_SECTIONS)) {
    const manifest = JSON.parse(await readFile(join("var", "templates", slug, "v1", "manifest.json"), "utf8"));
    profileSignatures.add(JSON.stringify(manifest.manifest.editorSchema.profileFields));
  }
  assert.ok(profileSignatures.size >= 7);
});

test("11 个模板声明独立字段与布局能力", () => {
  const schemas = Object.values(TEMPLATE_SCHEMAS);
  assert.equal(schemas.length, 11);
  assert.equal(new Set(schemas.map((item) => JSON.stringify({
    profileFields: item.profileFields,
    sections: item.sections.map((section) => [section.id, section.zone]),
    layout: item.layoutSchema.layout
  }))).size, 11);
  for (const schema of schemas) {
    assert.equal(schema.schemaVersion, 2);
    assert.ok(schema.profileFields.includes("name"));
    assert.ok(schema.sections.length >= 5);
    assert.deepEqual(new Set(schema.sections.map((section) => section.id)), new Set([
      "objective", "education", "experience", "projects", "skills", "summary",
      "campus", "certificates", "awards", "languages", "interests"
    ]));
    if (schema.slug === "clean-single") {
      assert.equal(schema.styleControls.fontFamily, true);
      assert.ok(schema.styleControls.fontSize.min <= 12);
      assert.ok(schema.styleControls.fontSize.max >= 18);
    } else {
      assert.equal(schema.styleControls.fontFamily, false);
      assert.equal(schema.styleControls.fontSize, false);
    }
  }
});

test("cn-001 至 cn-010 均发布为 HTML 高保真适配", async () => {
  const repository = new TemplateRepository({ database: null, storageDir: join("var", "templates") });
  const templates = await repository.list();
  for (const slug of Object.keys(EXPECTED_NATIVE_SECTIONS)) {
    const adapted = templates.find((template) => template.slug === slug);
    assert.equal(adapted.engine, "html-native", slug);
    assert.equal(adapted.selectable, true, slug);
    assert.equal(adapted.defaultResume, null, slug);
    assert.equal(adapted.editorSchema.schemaVersion, 2, slug);
    assert.match(adapted.previewUrl, /preview\.png\?preview=structured-v2$/, slug);
  }
  const first = templates.find((template) => template.slug === "resume-collection-cn-001");
  assert.deepEqual(first.editorSchema.sections.slice(0, 4).map((section) => section.id), ["summary", "education", "experience", "skills"]);
});

test("全部模板均显示并转义姓名", () => {
  const documentRef = {
    createElement() {
      let html = "";
      return {
        content: { querySelectorAll: () => [] },
        get innerHTML() { return html; },
        set innerHTML(value) { html = String(value); }
      };
    }
  };
  for (const [slug, editorSchema] of Object.entries(TEMPLATE_SCHEMAS)) {
    const resume = createInitialResume();
    resume.profile.name = "林知夏<script>";
    resume.template = { slug, editorSchema };
    const markup = renderResumeMarkup(resume, documentRef);
    assert.match(markup, /林知夏&lt;script&gt;/, slug);
    assert.doesNotMatch(markup, /林知夏<script>/, slug);
  }
});

test("商务圆角可渲染基线中的结构化可选模块", () => {
  const documentRef = {
    createElement() {
      let html = "";
      return {
        content: { querySelectorAll: () => [] },
        get innerHTML() { return html; },
        set innerHTML(value) { html = String(value); }
      };
    }
  };
  const source = createInitialResume();
  const editorSchema = TEMPLATE_SCHEMAS["resume-collection-cn-001"];
  source.template = { slug: editorSchema.slug, editorSchema };
  const objective = source.sections.find((section) => section.id === "objective");
  objective.visible = true;
  objective.data.job = "产品经理";
  const languages = source.sections.find((section) => section.id === "languages");
  languages.visible = true;
  languages.items = [{ name: "英语", level: "熟练" }];
  const interests = source.sections.find((section) => section.id === "interests");
  interests.visible = true;
  interests.items = ["摄影"];
  const markup = renderResumeMarkup(source, documentRef);
  assert.match(markup, /产品经理/);
  assert.match(markup, /英语/);
  assert.match(markup, /摄影/);
});

test("全部模板都能渲染极简轻的 11 个模块", () => {
  const documentRef = {
    createElement() {
      let html = "";
      return {
        content: { querySelectorAll: () => [] },
        get innerHTML() { return html; },
        set innerHTML(value) { html = String(value); }
      };
    }
  };
  const source = createInitialResume();
  source.sections.forEach((section) => { section.visible = true; });
  for (const [slug, editorSchema] of Object.entries(TEMPLATE_SCHEMAS)) {
    const resume = resumeForTemplate(source, { slug, editorSchema });
    resume.template = { slug, editorSchema };
    const markup = renderResumeMarkup(resume, documentRef);
    for (const section of editorSchema.sections) {
      assert.match(markup, new RegExp(`preview-${section.id}`), `${slug}: ${section.id}`);
    }
  }
});

test("全部模板的可见模块均支持按版式分区拖动排序", async () => {
  for (const [slug, editorSchema] of Object.entries(TEMPLATE_SCHEMAS)) {
    assert.equal(editorSchema.sections.length, 11, `${slug}: 模块数量`);
    for (const section of editorSchema.sections) {
      assert.notEqual(section.sortable, false, `${slug}: ${section.id} sortable`);
      assert.notEqual(section.capabilities?.sort, false, `${slug}: ${section.id} capabilities.sort`);
      assert.match(section.zone || "main", /^(main|sidebar|left|right)$/, `${slug}: ${section.id} zone`);
    }
  }

  const script = await readFile(join("public", "app.mjs"), "utf8");
  assert.match(script, /decoratePreviewModuleDragging\(\)/);
  assert.match(script, /source\.dataset\.zone\s*!==\s*target\.dataset\.zone/);
  assert.match(script, /recordResumeChange\(before, "调整模块顺序"\)/);
});

test("新数据库迁移直接登记全部已适配模板为 ready", async () => {
  const migration = await readFile(join("infra", "postgres", "init", "026_seed_adapted_templates.sql"), "utf8");
  for (let index = 1; index <= 10; index += 1) {
    const slug = `resume-collection-cn-${String(index).padStart(3, "0")}`;
    assert.match(migration, new RegExp(slug), slug);
  }
  assert.match(migration, /'ready'/);
  assert.match(migration, /'html-native'/);
  assert.match(migration, /ON CONFLICT \(template_slug, version\) DO UPDATE SET[\s\S]*status = 'ready'/);
  assert.doesNotMatch(migration, /needs_mapping|needs_qa/);
});

test("拖动手柄只由编辑器即时预览注入，不进入模板导出标记", () => {
  const documentRef = {
    createElement() {
      let html = "";
      return {
        content: { querySelectorAll: () => [] },
        get innerHTML() { return html; },
        set innerHTML(value) { html = String(value); }
      };
    }
  };
  const markup = renderResumeMarkup(createInitialResume(), documentRef);
  assert.doesNotMatch(markup, /preview-module-drag-handle|data-preview-drag-module/);
});

test("模板库封面按整页比例完整展示", async () => {
  const styles = await readFile(join("public", "styles.css"), "utf8");
  assert.match(styles, /\.template-preview\s*\{[^}]*aspect-ratio:\s*820\s*\/\s*1160/s);
  assert.match(styles, /\.template-preview img\s*\{[^}]*object-fit:\s*contain/s);
});

test("求职意向使用轻量信息行而非四列表格卡片", async () => {
  const styles = await readFile(join("public", "styles.css"), "utf8");
  assert.match(styles, /\.objective-grid\s*\{[^}]*display:\s*flex/s);
  assert.match(styles, /\.objective-grid\s*>\s*div\s*\{[^}]*background:\s*transparent/s);
  assert.doesNotMatch(styles, /\.objective-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4/s);
});

test("模板封面生成脚本固定输出完整 A4 比例页面", async () => {
  const script = await readFile(join("scripts", "regenerate-template-previews.mjs"), "utf8");
  assert.match(script, /paper\.style\.width\s*=\s*"820px"/);
  assert.match(script, /paper\.style\.height\s*=\s*"1160px"/);
  assert.match(script, /locator\("\.resume-paper"\)\.screenshot/);
});

const execFileAsync = promisify(execFile);
const python = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");

function fillTemplate(sourcePath, outputPath, resume) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, ["-X", "utf8", "scripts/fill-docx-template.py", sourcePath, outputPath], {
      stdio: ["pipe", "pipe", "pipe"], windowsHide: true
    });
    const errors = [];
    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(Buffer.concat(errors).toString("utf8"))));
    child.stdin.end(JSON.stringify({ resume }));
  });
}

test("DOCX 母版填充保留包结构并复制重复经历内容控件", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "resume-native-template-"));
  const sourcePath = join(directory, "source.docx");
  const outputPath = join(directory, "output.docx");
  context.after(() => rm(directory, { recursive: true, force: true }));
  const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
  <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
    <w:sdt><w:sdtPr><w:tag w:val="resume:profile.name"/></w:sdtPr><w:sdtContent><w:p><w:r><w:t>姓名</w:t></w:r></w:p></w:sdtContent></w:sdt>
    <w:sdt><w:sdtPr><w:tag w:val="resume:repeat:experience"/></w:sdtPr><w:sdtContent><w:p>
      <w:sdt><w:sdtPr><w:tag w:val="resume:item.organization"/></w:sdtPr><w:sdtContent><w:r><w:t>公司</w:t></w:r></w:sdtContent></w:sdt>
      <w:sdt><w:sdtPr><w:tag w:val="resume:item.role"/></w:sdtPr><w:sdtContent><w:r><w:t>职位</w:t></w:r></w:sdtContent></w:sdt>
    </w:p></w:sdtContent></w:sdt><w:sectPr/></w:body></w:document>`;
  const createFixture = [
    "import sys,zipfile",
    "path,xml=sys.argv[1],sys.argv[2]",
    "z=zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED)",
    "z.writestr('[Content_Types].xml','<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>')",
    "z.writestr('word/document.xml',xml)",
    "z.writestr('custom/preserved.bin',b'preserved')",
    "z.close()"
  ].join(";");
  await execFileAsync(python, ["-c", createFixture, sourcePath, documentXml]);

  const resume = createInitialResume();
  resume.profile.name = "高保真测试";
  const experience = resume.sections.find((section) => section.type === "experience");
  experience.items = [
    { organization: "甲公司", role: "产品经理" },
    { organization: "乙公司", role: "产品负责人" }
  ];
  await fillTemplate(sourcePath, outputPath, resume);

  const { stdout } = await execFileAsync(python, ["-X", "utf8", "-c",
    "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(z.read('word/document.xml').decode()); assert z.read('custom/preserved.bin') == b'preserved'",
    outputPath
  ]);
  assert.match(stdout, /高保真测试/);
  assert.match(stdout, /甲公司/);
  assert.match(stdout, /乙公司/);
  assert.equal((stdout.match(/resume:item\.organization/g) || []).length, 2);
  assert.equal((await readFile(outputPath)).subarray(0, 2).toString("ascii"), "PK");
});
