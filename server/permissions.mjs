// 管理端角色与权限模型。
// 角色：super_admin(超级管理员) / operator(运营) / auditor(只读审计)。
// 非管理员 role 为 null；is_admin 仍作为「是否可进入管理端」的准入开关。

export const ADMIN_ROLES = Object.freeze(["super_admin", "operator", "auditor"]);

const ROLE_PERMISSIONS = Object.freeze({
  operator: Object.freeze([
    "overview.read",
    "users.read",
    "users.write",
    "users.delete",
    "resumes.read",
    "resumes.delete",
    "recycle.read",
    "recycle.restore",
    "recycle.purge",
    "ai_config.read",
    "ai_config.write",
    "ai_logs.read",
    "audit.read",
    "sessions.manage",
    "announcements.read",
    "announcements.write",
    "feedback.read",
    "feedback.write",
    "templates.read",
    "templates.write",
    "config.read",
    "config.write",
    "system.read",
    "system.write"
  ]),
  auditor: Object.freeze([
    "overview.read",
    "users.read",
    "resumes.read",
    "recycle.read",
    "ai_config.read",
    "ai_logs.read",
    "audit.read",
    "announcements.read",
    "feedback.read",
    "templates.read",
    "config.read",
    "system.read"
  ])
});

// 归一化角色：非管理员 -> null；超级管理员需显式为 super_admin，历史管理员缺省按「运营」处理。
export function effectiveRole(user) {
  if (!user?.isAdmin) return null;
  const role = user?.role;
  if (role === "super_admin") return "super_admin";
  if (role === "operator" || role === "auditor") return role;
  return "operator";
}

export function isSuperAdmin(user) {
  return effectiveRole(user) === "super_admin";
}

export function listPermissions(user) {
  const role = effectiveRole(user);
  if (!role) return [];
  if (role === "super_admin") return ["*"];
  return [...(ROLE_PERMISSIONS[role] || [])];
}

export function can(user, permission) {
  if (!user?.isAdmin) return false;
  const role = effectiveRole(user);
  if (role === "super_admin") return true;
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}
