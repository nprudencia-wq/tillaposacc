import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CloudOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isSyncing, readQueue, syncQueue, type QueuedSale } from "@/lib/offline";
import { internetAvailable } from "@/lib/connectivity";

export function OfflineBar() {
  const qc = useQueryClient();
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState<QueuedSale[]>([]);
  const [busy, setBusy] = useState(false);

  async function sync(manual = false) {
    if (isSyncing()) return;
    setBusy(true);
    const r = await syncQueue();
    setBusy(false);
    setQueue(readQueue());
    setOnline(internetAvailable());
    if (r.synced) {
      toast.success(`${r.synced} offline sale${r.synced > 1 ? "s" : ""} uploaded`);
    }
    if (internetAvailable()) qc.invalidateQueries();
    if (r.failed) toast.error(`${r.failed} offline sale(s) could not upload`);
    if (manual && !r.synced && !r.failed && !navigator.onLine) toast.error("Still offline");
  }

  useEffect(() => {
    const refresh = () => {
      setOnline(internetAvailable()); setQueue(readQueue());
    };
    // Back online: upload queued sales, then pull fresh prices, stock and rates.
    const goOnline = () => { refresh(); void sync(); };
    const onVisible = () => { if (document.visibilityState === "visible" && navigator.onLine) void sync(); };
    refresh();
    if (navigator.onLine) void sync();
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", refresh);
    window.addEventListener("tilla-queue", refresh);
    window.addEventListener("tilla-connectivity", refresh);
    document.addEventListener("visibilitychange", onVisible);
    const t = setInterval(() => { if (navigator.onLine) void sync(); }, 15_000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("tilla-queue", refresh);
      window.removeEventListener("tilla-connectivity", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (online && !queue.length) return null;
  const failed = queue.filter((q) => q.error);
  return (
    <div role="status" className={`flex flex-wrap items-center gap-3 px-4 py-2 text-sm print:hidden ${online ? "bg-warning/15" : "bg-destructive/10"}`}>
      {!online && <span className="flex items-center gap-2 font-semibold text-destructive"><CloudOff className="h-4 w-4" />Offline — sales are saved on this device</span>}
      {queue.length > 0 && <span>{queue.length} sale{queue.length > 1 ? "s" : ""} waiting to upload</span>}
      {failed.length > 0 && <span className="text-destructive">{failed.length} rejected: {failed[0]?.error}</span>}
      {online && queue.length > 0 && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => sync(true)}>
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />Upload now
        </Button>
      )}
    </div>
  );
}
