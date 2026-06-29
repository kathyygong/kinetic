export const LOCAL_OWNER_KEY = "kinetic_persistence_owner_uid";

export interface LocalCacheStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type LocalCacheSnapshot = Record<string, string | null>;

export function captureLocalCacheSnapshot(
  storage: LocalCacheStorage,
  keys: string[],
): LocalCacheSnapshot {
  return Object.fromEntries(
    keys.map((key) => {
      try {
        return [key, storage.getItem(key)];
      } catch {
        return [key, null];
      }
    }),
  );
}

export function localCacheChanged(
  storage: LocalCacheStorage,
  snapshot: LocalCacheSnapshot,
): boolean {
  return Object.entries(snapshot).some(([key, previous]) => {
    try {
      return storage.getItem(key) !== previous;
    } catch {
      return false;
    }
  });
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
  let previousOwner: string | null;
  try {
    previousOwner = storage.getItem(LOCAL_OWNER_KEY);
  } catch {
    return "unowned";
  }
  if (!previousOwner) return "unowned";
  if (previousOwner === userId) return "same-user";

  clearLocalCaches();
  return "switched-user";
}

export function claimLocalCacheForUser(
  storage: LocalCacheStorage,
  userId: string,
): void {
  try {
    storage.setItem(LOCAL_OWNER_KEY, userId);
  } catch {
    // Cache ownership is a privacy guard, but unavailable localStorage must
    // not break the deterministic training flow.
  }
}
