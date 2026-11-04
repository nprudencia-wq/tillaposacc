import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useStaff } from "@/hooks/use-staff";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { money, roleLabels } from "@/lib/pos";
import type { Database } from "@/integrations/supabase/types";

type Role = Database["public"]["Enums"]["app_role"];

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({ meta: [{ title: "Staff — Tilla POS" }, { name: "description", content: "Staff accounts, roles and cashier performance." }] }),
  component: StaffPage,
});

function StaffPage() {
  const { data: me } = useStaff();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["staff-list"],
    queryFn: async () => {
      const since = new Date(); since.setDate(since.getDate() - 30);
      const [{ data: profiles }, { data: roles }, { data: sales }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, created_at").order("created_at"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("sales").select("cashier_id, total").gte("created_at", since.toISOString()),
      ]);
      const perf: Record<string, { n: number; t: number }> = {};
      (sales ?? []).forEach((s) => {
        const e = (perf[s.cashier_id] ??= { n: 0, t: 0 });
        e.n += 1; e.t += Number(s.total);
      });
      return (profiles ?? []).map((p) => ({
        ...p,
        role: (roles ?? []).find((r) => r.user_id === p.id)?.role as Role | undefined,
        sales: perf[p.id]?.n ?? 0,
        total: perf[p.id]?.t ?? 0,
      }));
    },
  });

  async function changeRole(id: string, role: Role) {
    const { error } = await supabase.rpc("set_user_role", { p_user: id, p_role: role });
    if (error) { toast.error(error.message); return; }
    toast.success("Role updated");
    qc.invalidateQueries({ queryKey: ["staff-list"] });
  }

  return (
    <div className="mx-auto max-w-5xl p-4 lg:p-8">
      <h1 className="text-3xl font-bold">Staff</h1>
      <p className="text-muted-foreground">New staff create their own account on the sign-in page, then you set their role here.</p>
      <div className="mt-6 overflow-x-auto rounded-xl border bg-card shadow-soft">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead className="text-right">Sales (30 days)</TableHead><TableHead className="text-right">Value</TableHead></TableRow></TableHeader>
          <TableBody>
            {(data ?? []).map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.full_name}{s.id === me?.id && <Badge variant="secondary" className="ml-2">You</Badge>}</TableCell>
                <TableCell>
                  {me?.isOwner && s.id !== me.id ? (
                    <Select value={s.role ?? ""} onValueChange={(v) => changeRole(s.id, v as Role)}>
                      <SelectTrigger className="w-52"><SelectValue placeholder="No role" /></SelectTrigger>
                      <SelectContent>{Object.entries(roleLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <span>{s.role ? roleLabels[s.role] : "—"}</span>
                  )}
                </TableCell>
                <TableCell className="tabular text-right">{s.sales}</TableCell>
                <TableCell className="tabular text-right">{money(s.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {!me?.isOwner && <p className="mt-3 text-sm text-muted-foreground">Only the Business Owner or System Administrator can change roles.</p>}
    </div>
  );
}
