import { createFileRoute, Outlet, redirect, Link, useNavigate, Navigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, ShoppingCart, Boxes, Receipt, LogOut, Truck, BarChart3, Users, Wallet, Clock, CreditCard, Contact, ClipboardList, Store, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStaff } from "@/hooks/use-staff";
import { deviceSession } from "@/lib/offline-session";
import { roleLabels } from "@/lib/pos";
import { OfflineBar } from "@/components/OfflineBar";
import { ConnectionDot } from "@/components/ConnectionDot";
import { ClockButton } from "@/components/Clock";
import { SubscriptionBanner } from "@/components/SubscriptionBanner";
import { InstallButton } from "@/components/InstallButton";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Offline: trust the saved session so the till keeps working without internet.
    if (!navigator.onLine) {
      if (!(await deviceSession())) throw redirect({ to: "/auth" });
      return;
    }
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: AppLayout,
});

const navGroups = [
  { title: "", items: [
    { to: "/pos", label: "Till", icon: ShoppingCart },
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  ] },
  { title: "Inventory & stock", items: [
    { to: "/inventory", label: "Inventory", icon: Boxes },
    { to: "/stock", label: "Stock control", icon: ClipboardList },
    { to: "/suppliers", label: "Suppliers", icon: Truck },
  ] },
  { title: "Sales", items: [
    { to: "/sales", label: "Sales", icon: Receipt },
    { to: "/documents", label: "Sales documents", icon: BookOpen },
    { to: "/customers", label: "Customers", icon: Contact },
    { to: "/shifts", label: "Shifts", icon: Clock },
  ] },
  { title: "Finance", items: [
    { to: "/expenses", label: "Expenses", icon: Wallet },
    { to: "/accounting", label: "Accounting", icon: BookOpen },
    { to: "/reports", label: "Reports", icon: BarChart3 },
  ] },
  { title: "Settings", items: [
    { to: "/payment-types", label: "Payment types", icon: CreditCard },
    { to: "/currencies", label: "Currency settings", icon: Wallet },
    { to: "/staff", label: "Staff", icon: Users },
    { to: "/store", label: "Store profile", icon: Store },
    { to: "/billing", label: "Billing", icon: CreditCard },
  ] },
] as const;

function AppLayout() {
  const { data: me } = useStaff();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await supabase.rpc("log_event", { p_action: "logout" }).then(() => {}, () => {});
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  // Till-only staff (cashiers): no back office, just the till with a clear sign-out.
  if (me && !me.backOffice) {
    if (pathname !== "/pos") return <Navigate to="/pos" replace />;
    return (
      <div className="flex min-h-screen flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 bg-sidebar px-4 py-2 text-sidebar-foreground print:hidden">
          <div className="font-display text-lg font-bold">Tilla<span className="text-sidebar-primary">POS</span></div>
          <div className="flex items-center gap-3">
            <ConnectionDot />
            <span className="hidden text-sm sm:inline">{me.name}</span>
            <InstallButton />
            <ClockButton />
            <button onClick={signOut} className="flex items-center gap-2 rounded-lg bg-sidebar-accent px-3 py-2 text-sm font-semibold hover:opacity-90">
              <LogOut className="h-4 w-4" />Sign out
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1"><SubscriptionBanner /><OfflineBar /><Outlet /></main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 items-center gap-1 bg-sidebar px-3 py-2 text-sidebar-foreground md:w-56 md:flex-col md:items-stretch md:px-3 md:py-5 print:hidden">
        <div className="hidden px-3 pb-6 font-display text-xl font-bold md:block">Tilla<span className="text-sidebar-primary">POS</span></div>
        <nav className="flex flex-1 gap-1 overflow-x-auto md:flex-col">
          {navGroups.map((g) => (
            <div key={g.title || "main"} className="flex gap-1 md:flex-col md:pb-3">
              {g.title && <div className="hidden px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider opacity-50 md:block">{g.title}</div>}
              {g.items.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium opacity-80 transition hover:bg-sidebar-accent hover:opacity-100"
              activeProps={{ className: "bg-sidebar-accent !opacity-100 text-sidebar-primary" }}
            >
              <n.icon className="h-5 w-5" />
              <span className="hidden sm:inline">{n.label}</span>
            </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="md:border-t md:border-sidebar-border md:pt-4">
          {me && (
            <div className="hidden px-3 pb-3 md:block">
              <div className="truncate text-sm font-semibold">{me.name}</div>
              <div className="text-xs opacity-60">{me.roles.map((r) => roleLabels[r] ?? r).join(", ")}</div>
            </div>
          )}
          <div className="px-1 pb-2 md:px-3"><InstallButton className="w-full justify-center" /></div>
          <div className="px-3 pb-2"><ConnectionDot /></div>
          <div className="hidden px-3 pb-2 md:block"><ClockButton /></div>
          <button onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm opacity-80 hover:bg-sidebar-accent hover:opacity-100">
            <LogOut className="h-5 w-5" /><span className="hidden md:inline">Sign out</span>
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1"><SubscriptionBanner /><OfflineBar /><Outlet /></main>
    </div>
  );
}
