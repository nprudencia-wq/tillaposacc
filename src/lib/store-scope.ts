export type StoreScope = { storeId: string; userId: string };

export function scopedStorageKey(key: string, scope: StoreScope) {
  if (!scope.storeId || !scope.userId) throw new Error("Store and staff identity are required");
  return `${key}:${scope.storeId}:${scope.userId}`;
}

export function belongsToScope(record: { store_id?: string; user_id?: string }, scope: StoreScope) {
  return record.store_id === scope.storeId && record.user_id === scope.userId;
}