// 轻量 CSV 导出：把对象数组按 headers 顺序输出为 CSV（带 BOM，适配 Excel）。
export function toCsv(headers, rows) {
  const escapeCell = (value) => {
    const str = value == null ? "" : String(value);
    if (/[",\n\r]/.test(str)) return `"${str.replaceAll('"', '""')}"`;
    return str;
  };
  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCell(row[header])).join(","));
  }
  return lines.join("\r\n");
}

export function sendCsv(response, filename, headers, rows) {
  const body = `\uFEFF${toCsv(headers, rows)}`;
  response.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(body);
}
