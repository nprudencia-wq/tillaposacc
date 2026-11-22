import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Monitor, RefreshCw } from "lucide-react";
import { useStaff } from "@/hooks/use-staff";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { currentScope, isSyncing, readQueue, readLocalShift, readPendingClose } from "@/lib/offline";
import { pendingCashMovements } from "@/lib/offline-cash";
import { pendingRepayments } from "@/lib/offline-credit";
import { readPendingSettlements } from "@/lib/settlement-queue";
import { internetAvailable } from "@/lib/connectivity";
import { REGISTER_IDS, HEARTBEAT_INTERVAL_MS, APP_VERSION, readRegister, saveRegister, deviceId, type RegisterId, type RegisterIdentity } from "@/lib/register";
import { logSystemError, registerEventCount } from "@/lib/register-events";
import { hardwareStatus } from "@/lib/hardware";

function useIdentity() {
  const { data: me } = useStaff();
  const [identity, setIdentity] = useState<RegisterIdentity | null>(null);
  useEffect(() => {
    const refresh = () => setIdentity(me?.storeId ? readRegister(me.storeId) : null);
    refresh(); window.addEventListener("tilla-register", refresh);
    return () => window.removeEventListener("tilla-register", refresh);
  }, [me?.storeId]);
  return { me, identity };
}
export function RegisterGate({ children }: { children: ReactNode }) {
  const { me, identity } = useIdentity();
  const [selected, setSelected] = useState<RegisterId>("REG-01");
  const [busy, setBusy] = useState(false);
  if (!me) return <p className="p-6 text-muted-foreground">Loading register…</p>;
  if (identity) return children;
  async function assign() {
    if (!me || !internetAvailable()) { toast.error("Connect once for register setup"); return; }
    setBusy(true);
    try {
      const id = deviceId();
      const { error } = await supabase.rpc("assign_register", { p_register_id: selected, p_device_id: id });
      if (error) throw error;
      saveRegister(me.storeId, { registerId: selected, deviceId: id });
    } catch (error) { toast.error((error as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="mx-auto flex w-full max-w-md flex-col gap-5 p-6 pt-16">
    <Monitor className="h-10 w-10 text-primary" />
    <h1 className="font-display text-2xl font-bold">Assign this register</h1>
    {me.canManageStaff ? <>
      <Select value={selected} onValueChange={(value) => setSelected(value as RegisterId)}><SelectTrigger aria-label="Register ID"><SelectValue /></SelectTrigger><SelectContent>{REGISTER_IDS.map((id) => <SelectItem key={id} value={id}>{id}</SelectItem>)}</SelectContent></Select>
      <Button disabled={busy} onClick={() => void assign()}>{busy ? "Assigning…" : "Assign register"}</Button>
    </> : <p className="text-muted-foreground">A manager must sign in once to assign this device.</p>}
  </section>;
}
export function RegisterStatus() {
  const { me, identity } = useIdentity();
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [count, setCount] = useState(0);
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      setOnline(internetAvailable()); setSyncing(isSyncing());
      const scope = currentScope();
      if (!scope) return;
      const values = await Promise.all([registerEventCount(scope), pendingRepayments(), pendingCashMovements(), readPendingSettlements(), readLocalShift(), readPendingClose()]).catch(() => null);
      if (values && !disposed) setCount(readQueue().length + values[0] + values[1].length + values[2].length + values[3].length + Number(!!values[4]) + Number(!!values[5]));
    };
    void refresh();
    const events = ["online", "offline", "tilla-connectivity", "tilla-queue", "tilla-sync", "tilla-register"];
    events.forEach((event) => window.addEventListener(event, refresh));
    return () => { disposed = true; events.forEach((event) => window.removeEventListener(event, refresh)); };
  }, [me?.id, me?.storeId]);
  useEffect(() => {
    if (!identity || !me) return;
    let active = true, sending = false, last = 0;
    const heartbeat = async () => {
      if (!active || sending || !internetAvailable() || Date.now() - last < HEARTBEAT_INTERVAL_MS) return;
      sending = true; last = Date.now();
      try {
        const scope = currentScope();
        if (!scope) return;
        const queued = readQueue().length + await registerEventCount(scope) + (await pendingRepayments()).length + (await pendingCashMovements()).length + (await readPendingSettlements()).length + Number(!!await readLocalShift()) + Number(!!await readPendingClose());
        const status = hardwareStatus();
        if (!active) return;
        const { error } = await supabase.rpc("upsert_register_heartbeat", { p_register_id: identity.registerId, p_device_id: identity.deviceId, p_printer_status: status.printer, p_scanner_status: status.scanner, p_offline_queue_count: queued, p_app_version: APP_VERSION });
        if (error) logSystemError("sync", error);
      } catch (error) { logSystemError("sync", error); }
      finally { sending = false; }
    };
    const onError = (event: ErrorEvent) => logSystemError("runtime", event.error ?? event.message);
    const onRejected = (event: PromiseRejectionEvent) => logSystemError("runtime", event.reason);
    void heartbeat();
    const timer = setInterval(() => void heartbeat(), HEARTBEAT_INTERVAL_MS);
    window.addEventListener("online", heartbeat); window.addEventListener("error", onError); window.addEventListener("unhandledrejection", onRejected);
    return () => { active = false; clearInterval(timer); window.removeEventListener("online", heartbeat); window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejected); };
  }, [identity, me?.id, me?.storeId]);
  return <div role="status" aria-label="Register sync status" className="flex flex-wrap items-center gap-2 text-xs font-semibold">
    <span>{identity?.registerId ?? "Unassigned"}</span>
    <span className="flex items-center gap-1 rounded bg-sidebar-accent px-2 py-1"><span className={`h-2 w-2 rounded-full ${!online ? "bg-destructive" : syncing ? "bg-warning" : "bg-success"}`} />{!online ? "Offline" : syncing ? "Syncing" : "Online"}{syncing && <RefreshCw className="h-3 w-3 animate-spin" />}{count > 0 && ` · ${count} pending`}</span>
  </div>;
}