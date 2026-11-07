// Browser connectivity is reachability, not merely a connected Wi-Fi adapter.
let reachable = true;
export function internetAvailable() {
  return typeof navigator !== "undefined" && navigator.onLine && reachable;
}
export function setInternetAvailable(value: boolean) {
  if (reachable === value) return;
  reachable = value;
  if (typeof window !== "undefined") window.dispatchEvent(new Event("tilla-connectivity"));
}
export async function networkRead<T>(run: () => PromiseLike<T>, ms = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(run()),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Network request timed out")), ms); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}