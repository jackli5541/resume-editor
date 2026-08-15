import test from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { createInitialResume } from "../public/core.mjs";
import { TEMPLATE_SCHEMAS } from "../public/template-schemas.mjs";
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
