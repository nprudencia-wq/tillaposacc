export type ConnectionState = "online" | "syncing" | "offline";

/**
 * Which light to show the cashier.
 * No internet always wins; otherwise anything still waiting to upload means "syncing".
 */
export function connectionState(s: { online: boolean; syncing: boolean; pending: number }): ConnectionState {
  if (!s.online) return "offline";
  if (s.syncing || s.pending > 0) return "syncing";
  return "online";
}

export const connectionLabels: Record<ConnectionState, string> = {
  online: "Online",
  syncing: "Syncing",
  offline: "Offline",
};
