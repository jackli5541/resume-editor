import { execFile } from "node:child_process";
import { copyFile, mkdtemp, mkdir, readdir, rename, rm, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const fillScript = join(projectRoot, "scripts", "fill-docx-template.py");

export async function moveAcrossDevices(sourcePath, targetPath) {
  try {
    await rename(sourcePath, targetPath);
  } catch (error) {
    if (error?.code !== "EXDEV") throw error;
    await copyFile(sourcePath, targetPath);
    await unlink(sourcePath);
  }
}

export async function convertWithLibreOffice(inputPath, outputDir, format = "pdf", timeoutMs = 60_000) {
  const soffice = process.env.SOFFICE_BIN || "soffice";
  const profileDir = await mkdtemp(join(tmpdir(), "resume-soffice-profile-"));
  try {
    await execFileAsync(soffice, [
      `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
      "--headless", "--nologo", "--nodefault", "--nolockcheck", "--nofirststartwizard",
      "--convert-to", format, "--outdir", outputDir, inputPath
    ], { timeout: timeoutMs, windowsHide: true, maxBuffer: 5 * 1024 * 1024 });
    const converted = join(outputDir, `${basename(inputPath, extname(inputPath))}.${format}`);
    await stat(converted);
    return converted;
  } finally {
    await rm(profileDir, { recursive: true, force: true });
  }
}

function resolveSourcePath(sourcePath) {
  if (!sourcePath || isAbsolute(sourcePath)) return sourcePath;
  const storageDir = process.env.TEMPLATE_STORAGE_DIR || join(projectRoot, "var", "templates");
  return join(storageDir, sourcePath);
}

export async function fillTemplateDocx({ sourcePath, outputPath, resume }) {
  sourcePath = resolveSourcePath(sourcePath);
  const python = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
  await mkdir(dirname(outputPath), { recursive: true });
  await new Promise((resolve, reject) => {
    const child = execFile(python, ["-X", "utf8", fillScript, sourcePath, outputPath], {
      timeout: 60_000,
      windowsHide: true,
      maxBuffer: 5 * 1024 * 1024
    }, (error) => error ? reject(error) : resolve());
    child.stdin.end(JSON.stringify({ resume }));
  });
  return outputPath;
}

export async function renderNativeDocument({ sourcePath, outputPath, resume, format }) {
  const workDir = await mkdtemp(join(tmpdir(), "resume-render-"));
  try {
    const docxPath = join(workDir, "resume.docx");
    await fillTemplateDocx({ sourcePath, outputPath: docxPath, resume });
    if (format === "docx") {
      await mkdir(dirname(outputPath), { recursive: true });
      await moveAcrossDevices(docxPath, outputPath);
      return { pageCount: null };
    }
    const pdfPath = await convertWithLibreOffice(docxPath, workDir);
    await mkdir(dirname(outputPath), { recursive: true });
    await moveAcrossDevices(pdfPath, outputPath);
    return { pageCount: null };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function renderPreviewPages({ sourcePath, outputDir, resume }) {
  const workDir = await mkdtemp(join(tmpdir(), "resume-preview-"));
  try {
    const docxPath = join(workDir, "resume.docx");
    await fillTemplateDocx({ sourcePath, outputPath: docxPath, resume });
    const pdfPath = await convertWithLibreOffice(docxPath, workDir);
    await mkdir(outputDir, { recursive: true });
    const pdftoppm = process.env.PDFTOPPM_BIN || "pdftoppm";
    await execFileAsync(pdftoppm, ["-png", "-r", "120", pdfPath, join(outputDir, "page")], {
      timeout: 60_000, windowsHide: true, maxBuffer: 5 * 1024 * 1024
    });
    const pngPages = (await readdir(outputDir)).filter((name) => /^page-\d+\.png$/.test(name)).sort();
    const python = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
    await execFileAsync(python, ["-X", "utf8", join(projectRoot, "scripts", "convert-preview-pages.py"), ...pngPages.map((name) => join(outputDir, name))], {
      timeout: 60_000, windowsHide: true, maxBuffer: 5 * 1024 * 1024
    });
    const pages = pngPages.map((name) => name.replace(/\.png$/, ".webp"));
    return { pageCount: pages.length, pages };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
