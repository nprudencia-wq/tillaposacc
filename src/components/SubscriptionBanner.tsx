import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useSettings } from "@/hooks/use-staff";
import { daysBetween, subState, todayStr } from "@/lib/subscription";

export function useSubscription() {
  const { data: st } = useSettings();
  if (!st) return null;
  const s = st as unknown as { paid_until: string; grace_days: number };
  const today = todayStr();
  const state = subState(s.paid_until, Number(s.grace_days), today);
  const left = daysBetween(today, s.paid_until);
  const graceLeft = left + Number(s.grace_days);
  return { state, paidUntil: s.paid_until, daysLeft: left, graceLeft };
}

export function SubscriptionBanner() {
  const sub = useSubscription();
  if (!sub) return null;
  if (sub.state === "active" && sub.daysLeft > 3) return null;
  const msg = sub.state === "locked"
    ? "Subscription expired — the till is locked until it's renewed."
    : sub.state === "grace"
      ? `Subscription overdue — ${sub.graceLeft} day${sub.graceLeft === 1 ? "" : "s"} left before the till locks.`
      : `Subscription renews in ${sub.daysLeft} day${sub.daysLeft === 1 ? "" : "s"}.`;
  return (
    <div className={`flex flex-wrap items-center gap-2 px-4 py-2 text-sm print:hidden ${sub.state === "locked" ? "bg-destructive text-destructive-foreground" : "bg-accent text-accent-foreground"}`}>
      <AlertTriangle className="h-4 w-4" /><span>{msg}</span>
      <Link to="/billing" className="font-semibold underline">Pay now</Link>
    </div>
  );
}
