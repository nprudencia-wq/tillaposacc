// Staff log in with a username; auth needs an email, so we derive a private placeholder address.
export const USERNAME_DOMAIN = "staff.tilla.local";

export function normalizeUsername(u: string) {
  return u.trim().toLowerCase();
}

export function isValidUsername(u: string) {
  return /^[a-z0-9._-]{3,30}$/.test(normalizeUsername(u));
}

/** Older accounts signed up with a real email; anything with "@" is used as-is. */
export function loginEmail(input: string) {
  const v = input.trim().toLowerCase();
  return v.includes("@") ? v : `${v}@${USERNAME_DOMAIN}`;
}

export const PERMISSIONS = {
  give_discount: "Give discounts",
  refund: "Refunds & check payments",
  manage_stock: "Manage products & stock",
  post_expense: "Post expenses",
  view_reports: "View reports",
  override_price: "Change prices at the till",
} as const;
export type Permission = keyof typeof PERMISSIONS;

export const ROLE_DEFAULTS: Record<Permission, string[]> = {
  give_discount: ["admin", "owner", "manager", "supervisor", "cashier"],
  refund: ["admin", "owner", "manager", "supervisor"],
  manage_stock: ["admin", "owner", "manager", "stock_controller"],
  post_expense: ["admin", "owner", "manager", "accountant"],
  view_reports: ["admin", "owner", "manager", "accountant"],
  override_price: ["admin", "owner", "manager", "supervisor"],
};

/** Personal override wins; otherwise the role decides. Mirrors public.has_permission. */
export function effectivePermission(roles: string[], perm: Permission, overrides: Partial<Record<Permission, boolean>>) {
  return overrides[perm] ?? roles.some((r) => ROLE_DEFAULTS[perm].includes(r));
}

/** Till PINs are 4–6 digits. Mirrors public.set_staff_pin. */
export function isValidPin(p: string) {
  return /^[0-9]{4,6}$/.test(p ?? "");
}
