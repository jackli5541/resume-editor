import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("../scripts/render-resume-docx.py", import.meta.url));

export async function renderDocx({ outputPath, resume, template }) {
  const python = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
  await new Promise((resolve, reject) => {
    const child = spawn(python, ["-X", "utf8", scriptPath, outputPath], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    const errors = [];
    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(Buffer.concat(errors).toString("utf8") || `DOCX worker exited with ${code}`));
    });
    child.stdin.end(JSON.stringify({ resume, template }));
  });
  return { pageCount: null };
}
