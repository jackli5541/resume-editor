// 一次性/临时邮箱域名拦截：提高批量注册成本，抑制同人多账号。
// 可通过 BLOCKED_EMAIL_DOMAINS 追加自定义域名（逗号分隔，小写）。
const DEFAULT_BLOCKED_DOMAINS = [
  "10minutemail.com",
  "dispostable.com",
  "emailondeck.com",
  "getnada.com",
  "grr.la",
  "guerrillamail.com",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "mintemail.com",
  "moakt.com",
  "mytrashmail.com",
  "sharklasers.com",
  "spamgourmet.com",
  "temp-mail.org",
  "tempail.com",
  "tempmail.com",
  "throwawaymail.com",
  "trashmail.com",
  "yopmail.com"
];

let cachedRaw;
let cachedSet;

function blockedDomains() {
  const raw = String(process.env.BLOCKED_EMAIL_DOMAINS || "");
  if (cachedRaw === raw && cachedSet) return cachedSet;
  cachedRaw = raw;
  cachedSet = new Set([
    ...DEFAULT_BLOCKED_DOMAINS,
    ...raw.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean)
  ]);
  return cachedSet;
}

export function isDisposableEmail(email) {
  const domain = String(email || "").split("@").pop()?.toLowerCase();
  if (!domain) return false;
  return blockedDomains().has(domain);
}
