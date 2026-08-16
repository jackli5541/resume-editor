// 密码强度策略（上线基线）：
// - 长度 8–200
// - 必须同时包含字母与数字
// - 拦截常见弱口令（黑名单，匹配时忽略大小写）
//
// 注意：开发/测试种子口令（admin123 / user1234）为本地专用默认值，不在黑名单内，
// 以便 start.bat 与种子脚本可用；生产环境必须通过 SEED_* 关闭并改用强口令。

const WEAK_PASSWORDS = new Set([
  "password", "password1", "password12", "password123", "password1234", "password12345",
  "passw0rd", "passw0rd1", "passw0rd12", "passw0rd123",
  "qwerty123", "qwerty1234", "qwerty12345", "qwerty123456", "qwertyuiop1",
  "abc123", "abc1234", "abc12345", "abc123456", "abcd1234", "abc123456789",
  "a123456", "a1234567", "a12345678", "a123456789",
  "123456a", "1234567a", "12345678a", "123456789a",
  "111111a", "1111111a", "11111111a", "000000a", "0000000a", "00000000a",
  "iloveyou1", "iloveyou123", "iloveyou1234",
  "letmein1", "letmein12", "letmein123",
  "welcome1", "welcome12", "welcome123",
  "monkey123", "dragon123", "sunshine1", "sunshine123",
  "princess1", "princess123", "football1", "football123",
  "baseball1", "baseball123", "superman1", "superman123", "batman123",
  "test123", "test1234", "test12345", "demo123", "demo1234", "demo12345",
  "changeme1", "changeme12", "changeme123", "default1", "default123",
  "zhangsan123", "lisi123", "wangwu123", "zhaoliu123",
  "woaini123", "woshishui1", "nimade123"
]);

export function passwordPolicyError(password) {
  if (typeof password !== "string" || password.length < 8 || password.length > 200) {
    return "密码长度需为 8–200 个字符";
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  if (!hasLetter || !hasDigit) {
    return "密码需同时包含字母和数字";
  }
  if (WEAK_PASSWORDS.has(password.toLowerCase())) {
    return "该密码过于常见，请更换一个更安全的密码";
  }
  return null;
}
