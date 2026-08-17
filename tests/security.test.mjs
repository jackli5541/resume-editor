import test from "node:test";
import assert from "node:assert/strict";
import { HTML_CSP, applySecurityHeaders } from "../server/security.mjs";

test("browser CSP blocks inline event handlers and dangerous plugin content", () => {
  assert.match(HTML_CSP, /(?:^|; )object-src 'none'(?:;|$)/);
  assert.match(HTML_CSP, /(?:^|; )script-src-attr 'none'(?:;|$)/);
  const scriptPolicy = HTML_CSP.match(/(?:^|; )(script-src [^;]+)/)?.[1] || "";
  assert.doesNotMatch(scriptPolicy, /'unsafe-inline'/, "script policy must not allow unsafe-inline");
});

test("browser security headers disable unnecessary capabilities", () => {
  const headers = new Map();
  const response = { setHeader: (name, value) => headers.set(name, value) };

  applySecurityHeaders(response, { html: true, secure: true });

  assert.equal(headers.get("Content-Security-Policy"), HTML_CSP);
  assert.equal(headers.get("Cross-Origin-Resource-Policy"), "same-origin");
  assert.equal(headers.get("X-DNS-Prefetch-Control"), "off");
  assert.match(headers.get("Permissions-Policy"), /camera=\(\)/);
  assert.match(headers.get("Strict-Transport-Security"), /includeSubDomains/);
});
