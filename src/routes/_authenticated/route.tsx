import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, ShoppingCart, Boxes, Receipt, LogOut, Truck, BarChart3, Users, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStaff } from "@/hooks/use-staff";
import { roleLabels } from "@/lib/pos";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: AppLayout,
});

const nav = [
  { to: "/pos", label: "Till", icon: ShoppingCart },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/sales", label: "Sales", icon: Receipt },
  { to: "/suppliers", label: "Suppliers", icon: Truck },
  { to: "/expenses", label: "Expenses", icon: Wallet },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/staff", label: "Staff", icon: Users },
] as const;

function AppLayout() {
  const { data: me } = useStaff();
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
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
      <main className="min-w-0 flex-1"><Outlet /></main>
    </div>
  );
}
