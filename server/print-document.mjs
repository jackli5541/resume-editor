function inlineJson(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function renderPrintDocument(job) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=820" />
    <title>简历导出 ${job.id}</title>
    <link rel="stylesheet" href="/styles.css" />
    <link rel="stylesheet" href="/print.css" />
  </head>
  <body class="export-document">
    <article class="resume-paper" id="resumePaper">
      <div class="resume-flow" id="resumeFlow"></div>
    </article>
    <script id="resumeExportData" type="application/json">${inlineJson({ resume: job.resume })}</script>
    <script type="module" src="/print.mjs"></script>
  </body>
</html>`;
}
