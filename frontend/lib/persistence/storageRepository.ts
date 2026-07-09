/**
 * Local-first repository contract used by every persisted Kinetic domain.
 *
 * Local writes remain synchronous so today's training flow never depends on
 * the network. Remote hydration/mirroring is asynchronous and best-effort.
 */

export type PersistenceDomain =
  | "profile"
  | "goal"
  | "plan"
  | "readiness"
  | "workouts"
  | "recommendations"
  | "preferences"
  | "dismissed_preferences"
  | "today"
  | "schedule"
  | "calendar_sync"
  | "calendar_failure";

export type PersistedEnvelope<T> = {
  schemaVersion: 1;
  payload: T | null;
  deleted: boolean;
  clientUpdatedAt: string;
};

export interface RemoteDocumentStore {
  read<T>(
    userId: string,
    domain: PersistenceDomain,
  ): Promise<PersistedEnvelope<T> | null>;
  write<T>(
    userId: string,
    domain: PersistenceDomain,
    value: PersistedEnvelope<T>,
  ): Promise<void>;
}

export type HydrationResult = "remote" | "migrated" | "local" | "empty";

export interface StorageRepository<T> {
  readonly domain: PersistenceDomain;
  readonly storageKey: string;
  readLocal(): T | null;
  writeLocal(value: T): void;
  clearLocal(): void;
  mirror(userId: string): Promise<void>;
  hydrate(
    userId: string,
    shouldApply?: () => boolean,
  ): Promise<HydrationResult>;
  clear(userId?: string): Promise<void>;
}

type RepositoryOptions<T> = {
  domain: PersistenceDomain;
  storageKey: string;
  remote: RemoteDocumentStore;
  validate?: (value: unknown) => value is T;
  parseLocal?: (raw: string) => T;
  serializeLocal?: (value: T) => string;
};

const MIGRATION_VERSION = 1;
const REMOTE_CLEAR_TIMEOUT_MS = 10_000;

function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
    operation
      .then(resolve, reject)
      .finally(() => clearTimeout(timeoutId));
  });
}

export function createStorageRepository<T>({
  domain,
  storageKey,
  remote,
  validate,
  parseLocal = (raw) => JSON.parse(raw) as T,
  serializeLocal = (value) => JSON.stringify(value),
}: RepositoryOptions<T>): StorageRepository<T> {
  const markerKey = (userId: string) =>
    `kinetic_persistence_migrated_v${MIGRATION_VERSION}:${userId}:${domain}`;

  const readLocal = (): T | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === null) return null;
      const parsed: unknown = parseLocal(raw);
      if (validate && !validate(parsed)) return null;
      return parsed as T;
    } catch {
      return null;
    }
  };

  const writeLocal = (value: T): void => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, serializeLocal(value));
    } catch {
      // Local persistence remains best-effort in private/quota-limited modes.
    }
  };

  const clearLocal = (): void => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Best-effort; callers should never lose the primary training flow.
    }
  };

  const markMigrated = (userId: string): void => {
    try {
      window.localStorage.setItem(markerKey(userId), "1");
    } catch {
      // A missing marker only causes a safe remote existence check next time.
    }
  };

  const wasMigrated = (userId: string): boolean => {
    try {
      return window.localStorage.getItem(markerKey(userId)) === "1";
    } catch {
      return false;
    }
  };

  const envelope = (payload: T | null, deleted: boolean): PersistedEnvelope<T> => ({
    schemaVersion: 1,
    payload,
    deleted,
    clientUpdatedAt: new Date().toISOString(),
  });

  return {
    domain,
    storageKey,
    readLocal,
    writeLocal,
    clearLocal,

    async mirror(userId) {
      const value = readLocal();
      await remote.write(
        userId,
        domain,
        value === null ? envelope(null, true) : envelope(value, false),
      );
      markMigrated(userId);
    },

    async hydrate(userId, shouldApply = () => true) {
      const stored = await remote.read<T>(userId, domain);
      if (!shouldApply()) {
        return readLocal() === null ? "empty" : "local";
      }
      if (stored) {
        if (stored.deleted || stored.payload === null) clearLocal();
        else writeLocal(stored.payload);
        markMigrated(userId);
        return "remote";
      }

      const local = readLocal();
      if (local !== null && !wasMigrated(userId)) {
        await remote.write(userId, domain, envelope(local, false));
        if (!shouldApply()) return "local";
        markMigrated(userId);
        return "migrated";
      }

      return local === null ? "empty" : "local";
    },

    async clear(userId) {
      if (!userId) {
        clearLocal();
        return;
      }
      await withTimeout(
        remote.write(userId, domain, envelope(null, true)),
        REMOTE_CLEAR_TIMEOUT_MS,
        `Timed out deleting ${domain}`,
      );
      clearLocal();
      markMigrated(userId);
    },
  };
}
