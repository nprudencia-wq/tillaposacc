import { useEffect, useState } from "react";
import { isSyncing, readQueue } from "@/lib/offline";
import { connectionLabels, connectionState, type ConnectionState } from "@/lib/connection";

const dotClass: Record<ConnectionState, string> = {
  online: "bg-success",
  syncing: "bg-warning",
  offline: "bg-destructive",
};

// On the dark till bar the word stays in the bar's own text colour (the dot carries the colour);
// on light surfaces the coloured words read well.
const textClass: Record<"onDark" | "onLight", Record<ConnectionState, string>> = {
  onDark: { online: "text-sidebar-foreground", syncing: "text-sidebar-foreground", offline: "text-sidebar-foreground" },
  onLight: { online: "text-success", syncing: "text-warning-foreground", offline: "text-destructive" },
};

/** Always-on connection light for the till: green Online, amber Syncing, red Offline. */
export function ConnectionDot({ className = "", tone = "onDark" }: { className?: string; tone?: "onDark" | "onLight" }) {
  const [state, setState] = useState<ConnectionState>("online");

  useEffect(() => {
    const refresh = () =>
      setState(connectionState({ online: navigator.onLine, syncing: isSyncing(), pending: readQueue().length }));
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    window.addEventListener("tilla-queue", refresh);
    window.addEventListener("tilla-sync", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("tilla-queue", refresh);
      window.removeEventListener("tilla-sync", refresh);
    };
  }, []);

  return (
    <span
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 text-xs font-semibold ${toneClass[tone]} ${textClass[tone][state]} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass[state]} ${state === "syncing" ? "animate-pulse" : ""}`}
      />
      {connectionLabels[state]}
    </span>
  );
}
