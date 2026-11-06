/** Combine sale queues without duplicates; later lists win for the same client_ref. */
export function mergeQueues<T extends { client_ref: string }>(a: T[], b: T[]): T[] {
  const map = new Map<string, T>();
  for (const s of [...a, ...b]) map.set(s.client_ref, s);
  return [...map.values()];
}
