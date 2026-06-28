export const LOCAL_OWNER_KEY = "kinetic_persistence_owner_uid";

export interface LocalCacheStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Clear cached training domains before a different authenticated user hydrates.
 *
 * An unowned cache is intentionally preserved so a runner can create demo data
 * before signing in and migrate it once. A cache that has already belonged to
 * another UID must never be migrated into the new account.
 */
export function prepareLocalCacheForUser(
  storage: LocalCacheStorage,
  userId: string,
  clearLocalCaches: () => void,
): "unowned" | "same-user" | "switched-user" {
  const previousOwner = storage.getItem(LOCAL_OWNER_KEY);
  if (!previousOwner) return "unowned";
  if (previousOwner === userId) return "same-user";

  clearLocalCaches();
  return "switched-user";
}

export function claimLocalCacheForUser(
  storage: LocalCacheStorage,
  userId: string,
): void {
  storage.setItem(LOCAL_OWNER_KEY, userId);
}
