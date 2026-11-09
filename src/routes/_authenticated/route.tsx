import { BackBar } from "@/components/BackBar";
import { createFileRoute, Outlet, redirect, Link, useNavigate, Navigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, ShoppingCart, Boxes, Receipt, LogOut, BarChart3, Users, Wallet, Clock, CreditCard, Contact, ClipboardList, Store, BookOpen, Pencil, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStaff } from "@/hooks/use-staff";
import { hasDeviceLogin, clearDeviceSession } from "@/lib/offline-session";
import { roleLabels } from "@/lib/pos";
import type { Permission } from "@/lib/username";
import { OfflineBar } from "@/components/OfflineBar";
import { ConnectionDot } from "@/components/ConnectionDot";
import { ClockButton } from "@/components/Clock";
import { SubscriptionBanner } from "@/components/SubscriptionBanner";
import { InstallButton } from "@/components/InstallButton";
import { useShopUpdates } from "@/hooks/use-shop-updates";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Falls back to the saved device sign-in when the internet is down, even with Wi-Fi connected.
    if (!(await hasDeviceLogin())) throw redirect({ to: "/auth" });
  },
  component: AppLayout,
});

const navGroups = [
  { title: "Dashboard", icon: LayoutDashboard, items: [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/manage", label: "Quick edit" },
  ] },
  { title: "Inventory", icon: Boxes, items: [
    { to: "/inventory", label: "Inventory" },
    { to: "/stock", label: "Stock control" },
    { to: "/suppliers", label: "Suppliers" },
    { to: "/goods-received", label: "Goods received" },
  ] },
  { title: "Sales", icon: Receipt, items: [
    { to: "/sales", label: "Sales" },
    { to: "/documents", label: "Sales documents" },
    { to: "/customers", label: "Customers" },
  ] },
  { title: "Shifts", icon: Clock, items: [
    { to: "/shifts", label: "Shifts" },
    { to: "/settlement", label: "Daily settlement" },
    { to: "/settlement-history", label: "Settlement history" },
    { to: "/multi-till", label: "Multi-till" },
    { to: "/staff", label: "Staff" },
  ] },
  { title: "Reports", icon: BarChart3, items: [
    { to: "/reports", label: "Reports" },
    { to: "/expenses", label: "Expenses" },
    { to: "/accounting", label: "Accounting" },
  ] },
  { title: "Settings", icon: Settings, items: [
    { to: "/store", label: "Store profile" },
    { to: "/payment-types", label: "Payment types" },
    { to: "/currencies", label: "Currency settings" },
    { to: "/billing", label: "Billing" },
    { to: "/trials", label: "Trial leads" },
  ] },
] as const;
const inGroup = (path: string, to: string) => path === to || path.startsWith(to + "/");

const MODULE_PERM: Record<string, Permission> = {"/dashboard": "module_dashboard", "/manage": "module_inventory", "/inventory": "module_inventory", "/stock": "module_stock", "/suppliers": "module_suppliers", "/goods-received": "module_suppliers", "/sales": "module_sales", "/documents": "module_documents", "/customers": "module_customers", "/staff": "module_staff", "/shifts": "module_shifts", "/settlement": "module_shifts", "/settlement-history": "module_shifts", "/multi-till": "module_shifts", "/expenses": "module_expenses", "/accounting": "module_accounting", "/reports": "view_reports", "/payment-types": "module_settings", "/currencies": "module_settings", "/store": "module_settings", "/billing": "module_settings"};
function moduleFor(path: string) { const k = Object.keys(MODULE_PERM).find((p) => path === p || path.startsWith(p + "/")); return k ? MODULE_PERM[k] : undefined; }

function AppLayout() {
  const { data: me } = useStaff();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useShopUpdates(me?.storeId, me?.id);
  const { data: vendorStore } = useQuery({
    queryKey: ["vendor-store", me?.storeId],
    enabled: !!me?.storeId && !!me?.isOwner,
    queryFn: async () => (await supabase.from("stores").select("is_vendor_store").eq("id", me!.storeId).maybeSingle()).data?.is_vendor_store ?? false,
  });

  async function signOut() {
    await supabase.rpc("log_event", { p_action: "logout" }).then(() => {}, () => {});
    await qc.cancelQueries();
    qc.clear();
    clearDeviceSession();
    await supabase.auth.signOut({ scope: "local" });
    navigate({ to: "/auth", replace: true });
  }

  // Till-only staff (cashiers): no back office, just the till with a clear sign-out.
  // The till is a full-screen counter for everyone: no admin menu. Back-office staff get one button out.
  if ((me && !me.backOffice) || pathname === "/pos") {
    if (pathname !== "/pos") return <Navigate to="/pos" replace />;
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 bg-sidebar px-4 py-2 text-sidebar-foreground print:hidden">
          <div className="flex items-center gap-3">
            <div className="font-display text-lg font-bold">Tilla<span className="text-sidebar-primary">POS</span></div>
            <span className="rounded bg-sidebar-accent px-2 py-0.5 text-xs font-semibold uppercase tracking-wider">Till</span>
          </div>
          <div className="flex items-center gap-3">
            <ConnectionDot />
            {me && <span className="hidden text-sm sm:inline">{me.name} · {me.roles.map((r) => roleLabels[r] ?? r).join(", ")}</span>}
            {me?.backOffice && (
              <Link to="/dashboard" className="flex items-center gap-2 rounded-lg border border-sidebar-border px-3 py-2 text-sm font-semibold hover:bg-sidebar-accent">
                <LayoutDashboard className="h-4 w-4" />Back office
              </Link>
            )}
            <InstallButton />
            <ClockButton />
            <button onClick={signOut} className="flex items-center gap-2 rounded-lg bg-sidebar-accent px-3 py-2 text-sm font-semibold hover:opacity-90">
              <LogOut className="h-4 w-4" />Sign out
            </button>
          </div>
        </header>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col"><SubscriptionBanner /><OfflineBar /><div className="min-h-0 flex-1"><Outlet /></div></main>
      </div>
    );
  }

  const allowed = (path: string) => { if (path === "/trials") return !me || (me.isOwner && vendorStore !== false); const p = moduleFor(path); return !p || !me || (p === "view_reports" ? me.canViewReports : me.perms?.[p] !== false); };
  if (me && !allowed(pathname)) return <Navigate to="/pos" replace />;

  const visibleGroups = navGroups.map((g) => ({ ...g, items: g.items.filter((n) => allowed(n.to)) })).filter((g) => g.items.length);
  const currentGroup = visibleGroups.find((g) => g.items.some((n) => inGroup(pathname, n.to)));

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 items-center gap-1 bg-sidebar px-3 py-2 text-sidebar-foreground md:w-56 md:flex-col md:items-stretch md:px-3 md:py-5 print:hidden">
        <div className="hidden px-3 pb-6 font-display text-xl font-bold md:block">Tilla<span className="text-sidebar-primary">POS</span> <span className="text-xs font-normal opacity-60">· Back Office</span></div>
        <nav className="flex flex-1 gap-1 overflow-x-auto md:flex-col">
          <Link to="/pos" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium opacity-80 transition hover:bg-sidebar-accent hover:opacity-100 md:mb-2">
            <ShoppingCart className="h-5 w-5" /><span className="hidden sm:inline">Open till</span>
          </Link>
          {visibleGroups.map((g) => {
            const active = g.items.some((n) => inGroup(pathname, n.to));
            return (
              <Link key={g.title} to={g.items[0]!.to}
                className={"flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition hover:bg-sidebar-accent hover:opacity-100 " + (active ? "bg-sidebar-accent text-sidebar-primary opacity-100" : "opacity-80")}>
                <g.icon className="h-5 w-5" /><span className="hidden sm:inline">{g.title}</span>
              </Link>
            );
          })}
        </nav>
        <div className="md:border-t md:border-sidebar-border md:pt-4">
          {me && (
            <div className="hidden items-center gap-3 px-3 pb-3 md:flex">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sidebar-primary font-bold text-sidebar-primary-foreground">{me.name.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase()}</span>
              <div className="min-w-0"><div className="truncate text-sm font-semibold">{me.name}</div>
              <div className="text-xs opacity-60">{me.roles.map((r) => roleLabels[r] ?? r).join(", ")}</div></div>
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
      <main className="min-w-0 flex-1"><SubscriptionBanner /><OfflineBar /><BackBar />
        {currentGroup && currentGroup.items.length > 1 && (
          <div className="flex gap-1 overflow-x-auto border-b border-border px-4 pt-2 print:hidden">
            {currentGroup.items.map((n) => (
              <Link key={n.to} to={n.to}
                className={"whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition " + (inGroup(pathname, n.to) ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                {n.label}
              </Link>
            ))}
          </div>
        )}
        <Outlet /></main>
    </div>
  );
}
