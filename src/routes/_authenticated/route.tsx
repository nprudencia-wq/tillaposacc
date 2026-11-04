import { createFileRoute, Outlet, redirect, Link, useNavigate, Navigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, ShoppingCart, Boxes, Receipt, LogOut, Truck, BarChart3, Users, Wallet, Clock, CreditCard, Contact, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStaff } from "@/hooks/use-staff";
import { roleLabels } from "@/lib/pos";
import { OfflineBar } from "@/components/OfflineBar";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Offline: trust the saved session so the till keeps working without internet.
    if (!navigator.onLine) {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw redirect({ to: "/auth" });
      return;
    }
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: AppLayout,
});

const nav = [
  { to: "/pos", label: "Till", icon: ShoppingCart },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/stock", label: "Stock control", icon: ClipboardList },
  { to: "/sales", label: "Sales", icon: Receipt },
  { to: "/customers", label: "Customers", icon: Contact },
  { to: "/suppliers", label: "Suppliers", icon: Truck },
  { to: "/shifts", label: "Shifts", icon: Clock },
  { to: "/expenses", label: "Expenses", icon: Wallet },
  { to: "/payment-types", label: "Payment types", icon: CreditCard },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/staff", label: "Staff", icon: Users },
] as const;

function AppLayout() {
  const { data: me } = useStaff();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
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
        <header className="flex items-center justify-between gap-3 bg-sidebar px-4 py-2 text-sidebar-foreground print:hidden">
          <div className="font-display text-lg font-bold">Tilla<span className="text-sidebar-primary">POS</span></div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm sm:inline">{me.name}</span>
            <button onClick={signOut} className="flex items-center gap-2 rounded-lg bg-sidebar-accent px-3 py-2 text-sm font-semibold hover:opacity-90">
              <LogOut className="h-4 w-4" />Sign out
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1"><OfflineBar /><Outlet /></main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 items-center gap-1 bg-sidebar px-3 py-2 text-sidebar-foreground md:w-56 md:flex-col md:items-stretch md:px-3 md:py-5 print:hidden">
        <div className="hidden px-3 pb-6 font-display text-xl font-bold md:block">Tilla<span className="text-sidebar-primary">POS</span></div>
        <nav className="flex flex-1 gap-1 overflow-x-auto md:flex-col">
          {nav.map((n) => (
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
        </nav>
        <div className="md:border-t md:border-sidebar-border md:pt-4">
          {me && (
            <div className="hidden px-3 pb-3 md:block">
              <div className="truncate text-sm font-semibold">{me.name}</div>
              <div className="text-xs opacity-60">{me.roles.map((r) => roleLabels[r] ?? r).join(", ")}</div>
            </div>
          )}
          <button onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm opacity-80 hover:bg-sidebar-accent hover:opacity-100">
            <LogOut className="h-5 w-5" /><span className="hidden md:inline">Sign out</span>
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1"><OfflineBar /><Outlet /></main>
    </div>
  );
}
