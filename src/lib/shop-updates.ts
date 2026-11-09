// Shared records only: never subscribe to PIN hashes, credentials or number reservations.
export const SHOP_UPDATE_TABLES = [
  "products", "categories", "stock_movements", "branches", "branch_stock", "stock_transfers", "stocktakes", "stocktake_items", "price_history",
  "sales", "sale_items", "sale_payments", "refunds", "sales_documents", "invoice_payment_allocations",
  "customers", "customer_payments", "customer_adjustments",
  "suppliers", "grns", "grn_items", "grn_drafts", "supplier_payments", "supplier_returns",
  "cashier_shifts", "shift_cash_movements", "daily_settlements", "profiles", "user_roles", "user_permissions", "time_clock", "activity_log",
  "settings", "currency_confirmations", "rate_history", "payment_types", "stores", "store_memberships", "subscription_payments",
  "expenses", "gl_accounts", "journal_entries", "journal_lines", "zimra_config", "zimra_fiscal_days", "zimra_receipts",
] as const;

export function shopUpdateFilter(table: typeof SHOP_UPDATE_TABLES[number], storeId: string) {
  return `${table === "stores" ? "id" : "store_id"}=eq.${storeId}`;
}

// Image data is immutable per upload; refreshing it on every sale wastes bandwidth.
export function isSharedShopQuery(key: readonly unknown[]) {
  return !["product-image", "receipt-logo"].includes(String(key[0]));
}