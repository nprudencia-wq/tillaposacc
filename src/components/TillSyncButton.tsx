import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isSyncing, readQueue, syncQueue } from "@/lib/offline";

export function TillSyncButton() {
  const qc = useQueryClient();
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const refresh = () => { setPending(readQueue().length); setBusy(isSyncing()); };
    refresh();
    window.addEventListener("tilla-queue", refresh);
    window.addEventListener("tilla-sync", refresh);
    return () => { window.removeEventListener("tilla-queue", refresh); window.removeEventListener("tilla-sync", refresh); };
  }, []);
  async function upload() {
    if (isSyncing()) return;
    if (!navigator.onLine) { toast.info("No internet. Your sales are safe and will upload when the connection returns."); return; }
    try {
      await syncQueue(20000);
      const remaining = readQueue();
      setPending(remaining.length);
      if (!remaining.length) toast.success("Sync complete — no sales waiting to upload.");
      else if (remaining.some((s) => s.error)) toast.error(`${remaining.length} sales still saved on this till. Open My day to see upload errors.`);
      else toast.info(`${remaining.length} sales still waiting. Automatic retries will continue; you can tap Sync again.`);
      void qc.invalidateQueries();
    } catch { toast.error("Sync interrupted. Unsent sales remain safely saved on this till."); }
  }
  return <Button size="sm" variant="outline" className="shrink-0" disabled={busy} onClick={() => void upload()} title="Upload pending offline sales" aria-label="Sync offline sales">
    <RefreshCw className={busy ? "animate-spin motion-reduce:animate-none" : ""} />{busy ? "Syncing" : "Sync"}{pending > 0 && <span className="tabular-nums">({pending})</span>}
  </Button>;
}