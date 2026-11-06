export type SubState = "active" | "grace" | "locked";

/** Exempt stores never accrue a till subscription charge. */
export function tillSubscriptionCharge(price: number, tills: number, months: number, exempt: boolean) {
  return exempt ? 0 : price * tills * months;
}

export function storeSubscriptionState(paidUntil: string, graceDays: number, today: string, exempt: boolean): SubState {
  return exempt ? "active" : subState(paidUntil, graceDays, today);
}

/** Mirrors the database's subscription_state(): paid_until inclusive, then grace days, then locked. */
export function subState(paidUntil: string, graceDays: number, today: string): SubState {
  if (today <= paidUntil) return "active";
  const end = new Date(paidUntil + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() + graceDays);
  return today <= end.toISOString().slice(0, 10) ? "grace" : "locked";
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);
}

export const todayStr = () => new Date().toISOString().slice(0, 10);
