import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound, UserPlus, ShieldCheck, Hash } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStaff } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { money, roleLabels } from "@/lib/pos";
import { PERMISSIONS, ROLE_DEFAULTS, effectivePermission, type Permission } from "@/lib/username";
import { createStaffAccount, resetStaffPassword } from "@/lib/staff.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActivityTab, AttendanceTab, PerformanceTab, PinDialog } from "@/components/StaffTabs";
import type { Database } from "@/integrations/supabase/types";

type Role = Database["public"]["Enums"]["app_role"];
const SENIOR = ["admin", "owner", "manager"];

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({ meta: [{ title: "Staff & access — Tilla POS" }, { name: "description", content: "Staff logins, roles, access rights and cashier performance." }, { property: "og:title", content: "Staff & access — Tilla POS" }, { property: "og:description", content: "Staff logins, roles, access rights and cashier performance." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: StaffPage,
});

type Row = { id: string; full_name: string; username: string | null; active: boolean; role: Role | undefined; overrides: Partial<Record<Permission, boolean>>; sales: number; total: number };

function StaffPage() {
  const { data: me } = useStaff();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [resetFor, setResetFor] = useState<Row | null>(null);
  const [accessFor, setAccessFor] = useState<Row | null>(null);
  const [pinFor, setPinFor] = useState<Row | null>(null);

  const { data } = useQuery({
    queryKey: ["staff-list"],
    queryFn: async (): Promise<Row[]> => {
      const since = new Date(); since.setDate(since.getDate() - 30);
      const [{ data: profiles }, { data: roles }, { data: perms }, { data: sales }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, username, active, created_at").order("created_at"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("user_permissions").select("user_id, permission, allowed"),
        supabase.from("sales").select("cashier_id, total").gte("created_at", since.toISOString()),
      ]);
      const perf: Record<string, { n: number; t: number }> = {};
      (sales ?? []).forEach((s) => { const e = (perf[s.cashier_id] ??= { n: 0, t: 0 }); e.n += 1; e.t += Number(s.total); });
      return (profiles ?? []).map((p) => ({
        ...p,
        role: (roles ?? []).find((r) => r.user_id === p.id)?.role as Role | undefined,
        overrides: Object.fromEntries((perms ?? []).filter((x) => x.user_id === p.id).map((x) => [x.permission, x.allowed])),
        sales: perf[p.id]?.n ?? 0, total: perf[p.id]?.t ?? 0,
      }));
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["staff-list"] });

  // Owners/admins manage everyone; managers manage staff below manager.
  const canEdit = (s: Row) => !!me?.canManageStaff && s.id !== me.id && (me.isOwner || !SENIOR.includes(s.role ?? ""));
  const roleChoices = Object.entries(roleLabels).filter(([k]) => me?.isOwner || !SENIOR.includes(k));

  async function changeRole(id: string, role: Role) {
    const { error } = await supabase.rpc("set_user_role", { p_user: id, p_role: role });
    if (error) { toast.error(error.message); return; }
    toast.success("Role updated"); refresh();
  }
  async function setActive(id: string, active: boolean) {
    const { error } = await supabase.rpc("set_user_active", { p_user: id, p_active: active });
    if (error) { toast.error(error.message); return; }
    toast.success(active ? "Login enabled" : "Login disabled"); refresh();
  }

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Staff & access</h1>
          <p className="text-muted-foreground">Staff sign in with a username and password. Create logins here, or staff can sign up themselves and start as Cashiers.</p>
        </div>
        {me?.canManageStaff && <Button onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" />Add staff</Button>}
      </div>
      <Tabs defaultValue="staff" className="mt-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="staff">Staff</TabsTrigger>
          <TabsTrigger value="performance">Sales performance</TabsTrigger>
          {me?.canManageStaff && <TabsTrigger value="attendance">Clock-in / out</TabsTrigger>}
          {me?.canManageStaff && <TabsTrigger value="activity">Activity log</TabsTrigger>}
        </TabsList>
        <TabsContent value="performance"><PerformanceTab /></TabsContent>
        <TabsContent value="attendance"><AttendanceTab /></TabsContent>
        <TabsContent value="activity"><ActivityTab /></TabsContent>
        <TabsContent value="staff">
      <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Username</TableHead><TableHead>Role</TableHead><TableHead>Login</TableHead>
            <TableHead className="text-right">Sales (30 days)</TableHead><TableHead className="text-right">Value</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {(data ?? []).map((s) => (
              <TableRow key={s.id} className={s.active ? "" : "opacity-60"}>
                <TableCell className="font-medium">{s.full_name}{s.id === me?.id && <Badge variant="secondary" className="ml-2">You</Badge>}</TableCell>
                <TableCell className="font-mono text-sm">{s.username ?? "—"}</TableCell>
                <TableCell>
                  {canEdit(s) ? (
                    <Select value={s.role ?? ""} onValueChange={(v) => changeRole(s.id, v as Role)}>
                      <SelectTrigger className="w-48" aria-label={`Role for ${s.full_name}`}><SelectValue placeholder="No role" /></SelectTrigger>
                      <SelectContent>{roleChoices.map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : <span>{s.role ? roleLabels[s.role] : "—"}</span>}
                </TableCell>
                <TableCell>
                  {canEdit(s)
                    ? <Switch checked={s.active} onCheckedChange={(v) => setActive(s.id, v)} aria-label={`${s.active ? "Disable" : "Enable"} login for ${s.full_name}`} />
                    : <Badge variant={s.active ? "secondary" : "destructive"}>{s.active ? "Active" : "Disabled"}</Badge>}
                </TableCell>
                <TableCell className="tabular text-right">{s.sales}</TableCell>
                <TableCell className="tabular text-right">{money(s.total)}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {canEdit(s) && <>
                    <Button size="sm" variant="ghost" onClick={() => setAccessFor(s)}><ShieldCheck className="h-4 w-4" />Access</Button>
                    <Button size="sm" variant="ghost" onClick={() => setResetFor(s)}><KeyRound className="h-4 w-4" />Password</Button>
                  </>}
                  {(canEdit(s) || s.id === me?.id) && <Button size="sm" variant="ghost" onClick={() => setPinFor(s)}><Hash className="h-4 w-4" />PIN</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
        </TabsContent>
      </Tabs>
      {!me?.canManageStaff && <p className="mt-3 text-sm text-muted-foreground">Only an Owner, Administrator or Manager can manage staff.</p>}

      {adding && <AddStaffDialog roles={roleChoices} onClose={() => setAdding(false)} onDone={refresh} />}
      {resetFor && <ResetDialog row={resetFor} onClose={() => setResetFor(null)} />}
      {pinFor && <PinDialog userId={pinFor.id} name={pinFor.full_name} onClose={() => setPinFor(null)} />}
      {accessFor && <AccessDialog row={(data ?? []).find((r) => r.id === accessFor.id) ?? accessFor} onClose={() => setAccessFor(null)} onDone={refresh} />}
    </div>
  );
}

function AddStaffDialog({ roles, onClose, onDone }: { roles: [string, string][]; onClose: () => void; onDone: () => void }) {
  const create = useServerFn(createStaffAccount);
  const [f, setF] = useState({ fullName: "", username: "", password: "", role: "cashier" });
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await create({ data: f }); toast.success(`Login created for ${f.username}`); onDone(); onClose(); }
    catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add staff member</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="n">Full name</Label><Input id="n" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} required /></div>
          <div className="space-y-1.5"><Label htmlFor="u">Username</Label><Input id="u" autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} placeholder="e.g. tendai" required /></div>
          <div className="space-y-1.5"><Label htmlFor="p">Starting password</Label><Input id="p" type="text" minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></div>
          <div className="space-y-1.5"><Label>Role</Label>
            <Select value={f.role} onValueChange={(v) => setF({ ...f, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{roles.map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={busy}>Create login</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const reset = useServerFn(resetStaffPassword);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await reset({ data: { userId: row.id, password: pw } }); toast.success(`Password reset for ${row.full_name}`); onClose(); }
    catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reset password · {row.full_name}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="np">New password</Label><Input id="np" type="text" minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} required /></div>
          <Button type="submit" className="w-full" disabled={busy}>Set password</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AccessDialog({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: () => void }) {
  async function set(p: Permission, v: string) {
    const allowed = v === "default" ? null : v === "allow";
    const { error } = await supabase.rpc("set_user_permission", { p_user: row.id, p_perm: p, p_allowed: allowed as boolean });
    if (error) { toast.error(error.message); return; }
    onDone();
  }
  const roles = row.role ? [row.role] : [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Access rights · {row.full_name}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">"Role default" follows their role ({row.role ? roleLabels[row.role] : "none"}). Choose Allow or Block to override it for this person only.</p>
        <div className="divide-y rounded-lg border">
          {(Object.keys(PERMISSIONS) as Permission[]).map((p) => {
            const def = roles.some((r) => ROLE_DEFAULTS[p].includes(r));
            const ov = row.overrides[p];
            const on = effectivePermission(roles, p, row.overrides);
            return (
              <div key={p} className="flex items-center justify-between gap-3 p-3">
                <div>
                  <div className="text-sm font-semibold">{PERMISSIONS[p]}</div>
                  <div className={`text-xs ${on ? "text-success" : "text-muted-foreground"}`}>{on ? "Allowed" : "Not allowed"}</div>
                </div>
                <Select value={ov === undefined ? "default" : ov ? "allow" : "block"} onValueChange={(v) => set(p, v)}>
                  <SelectTrigger className="w-44" aria-label={`${PERMISSIONS[p]} for ${row.full_name}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Role default ({def ? "on" : "off"})</SelectItem>
                    <SelectItem value="allow">Allow</SelectItem>
                    <SelectItem value="block">Block</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
