import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { internetAvailable } from "@/lib/connectivity";
import { creditSnapshot } from "@/lib/offline-credit";
import { isSharedShopQuery, SHOP_UPDATE_TABLES, shopUpdateFilter } from "@/lib/shop-updates";

export function useShopUpdates(storeId: string | undefined, userId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!storeId || !userId) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let refreshing = false;
    let dirty = false;
    const run = async () => {
      if (disposed || !internetAvailable()) return;
      if (refreshing) { dirty = true; return; }
      refreshing = true;
      try {
        await Promise.all([
          qc.invalidateQueries({ predicate: (query) => isSharedShopQuery(query.queryKey) }),
          creditSnapshot().catch(() => {}),
        ]);
      } finally {
        refreshing = false;
        if (dirty && !disposed) { dirty = false; schedule(); }
      }
    };
    const schedule = () => {
      if (disposed || timer) return;
      timer = setTimeout(() => { timer = undefined; void run(); }, 400);
    };
    const channel = supabase.channel(`shop-live-${storeId}-${userId}-${crypto.randomUUID()}`);
    for (const table of SHOP_UPDATE_TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter: shopUpdateFilter(table, storeId) }, schedule);
    }
    // Refresh on (re)join; if live updates drop, keep refreshing as a backup.
    channel.subscribe((status) => { if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") schedule(); });
    const onVisible = () => { if (document.visibilityState === "visible") schedule(); };
    document.addEventListener("visibilitychange", onVisible);
    const poll = setInterval(() => { if (document.visibilityState === "visible") schedule(); }, 30_000);
    window.addEventListener("tilla-sale", schedule);
    window.addEventListener("tilla-sync", schedule);
    window.addEventListener("tilla-connectivity", schedule);
    window.addEventListener("focus", schedule);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("tilla-sale", schedule);
      window.removeEventListener("tilla-sync", schedule);
      window.removeEventListener("tilla-connectivity", schedule);
      window.removeEventListener("focus", schedule);
      void supabase.removeChannel(channel);
    };
  }, [qc, storeId, userId]);
}