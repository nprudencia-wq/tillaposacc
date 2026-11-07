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
  module_dashboard: "Dashboard",
  module_inventory: "Inventory",
  module_stock: "Stock control",
  module_suppliers: "Suppliers",
  module_sales: "Sales",
  module_documents: "Sales documents",
  module_customers: "Customers",
  module_staff: "Staff",
  module_shifts: "Shifts",
  module_expenses: "Expenses",
  module_accounting: "Accounting",
  module_settings: "Settings (payment types, currency, store, billing)",
  report_pl: "Profit & loss",
  report_expenses: "Expenses",
  report_daily: "Daily sales",
  report_product: "By product",
  report_category: "By category",
  report_cashier: "By cashier",
  report_payment: "By payment method",
  report_stock: "Stock on hand",
  report_low: "Low stock",
  report_movers: "Fast & slow movers",
  report_cashier_items: "Products sold by cashier",
  report_movement: "Stock movement",
} as const;
export type Permission = keyof typeof PERMISSIONS;
export const isReportPermission = (p: Permission) => p.startsWith("report_");
export const isModulePermission = (p: Permission) => p.startsWith("module_") || p === "view_reports";
/** Permission key for a single report on the Reports page. */
export const reportPermission = (id: string) => `report_${id.replace(/-/g, "_")}` as Permission;
const REPORT_ROLES = ["admin", "owner", "manager", "accountant"];

const SENIOR = ["admin", "owner", "manager"];
export const ROLE_DEFAULTS: Record<Permission, string[]> = {
  module_dashboard: [...SENIOR, "supervisor", "accountant", "stock_controller"],
  module_inventory: [...SENIOR, "stock_controller"],
  module_stock: [...SENIOR, "stock_controller"],
  module_suppliers: [...SENIOR, "stock_controller", "accountant"],
  module_sales: [...SENIOR, "supervisor", "accountant"],
  module_documents: [...SENIOR, "supervisor", "accountant"],
  module_customers: [...SENIOR, "supervisor", "accountant"],
  module_staff: SENIOR,
  module_shifts: [...SENIOR, "supervisor"],
  module_expenses: [...SENIOR, "accountant"],
  module_accounting: [...SENIOR, "accountant"],
  module_settings: SENIOR,
  give_discount: ["admin", "owner", "manager", "supervisor"],
  refund: ["admin", "owner", "manager", "supervisor"],
  manage_stock: ["admin", "owner", "manager", "stock_controller"],
  post_expense: ["admin", "owner", "manager", "accountant"],
  view_reports: ["admin", "owner", "manager", "accountant"],
  override_price: ["admin", "owner", "manager", "supervisor"],
  report_pl: REPORT_ROLES, report_expenses: REPORT_ROLES, report_daily: REPORT_ROLES, report_product: REPORT_ROLES,
  report_category: REPORT_ROLES, report_cashier: REPORT_ROLES, report_payment: REPORT_ROLES, report_stock: REPORT_ROLES,
  report_low: REPORT_ROLES, report_movers: REPORT_ROLES, report_cashier_items: REPORT_ROLES, report_movement: REPORT_ROLES,
};

/** Someone may open Reports with full access or with at least one single report allowed. */
export function canOpenReports(perms: Partial<Record<Permission, boolean>>) {
  return !!perms.view_reports || (Object.keys(perms) as Permission[]).some((p) => isReportPermission(p) && perms[p]);
}
/** Full report access shows every report; otherwise only individually allowed ones. */
export function canSeeReport(perms: Partial<Record<Permission, boolean>>, id: string, overrides: Partial<Record<Permission, boolean>> = {}) {
  const key = reportPermission(id);
  if (overrides[key] === false) return false;
  return !!perms.view_reports || !!perms[key];
}

/** Personal override wins; otherwise the role decides. Mirrors public.has_permission. */
export function effectivePermission(roles: string[], perm: Permission, overrides: Partial<Record<Permission, boolean>>) {
  return overrides[perm] ?? roles.some((r) => ROLE_DEFAULTS[perm].includes(r));
}

/** Till PINs are exactly 4 digits. Mirrors public.set_staff_pin. */
export function isValidPin(p: string) {
  return /^[0-9]{4}$/.test(p ?? "");
}
