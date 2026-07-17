"use client";

import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import {
  createStorageRepository,
  type PersistenceDomain,
  type PersistedEnvelope,
  type RemoteDocumentStore,
  type StorageRepository,
} from "@/lib/persistence/storageRepository";
import { coerceRemoteEnvelope } from "@/lib/persistence/remoteDocumentValidation";
import {
  captureLocalCacheSnapshot,
  claimLocalCacheForUser,
  localCacheChanged,
  prepareLocalCacheForUser,
} from "@/lib/persistence/localCacheOwnership";
import { trackProductEvent } from "@/lib/instrumentation";

type JsonValue = unknown;
const HYDRATION_TIMEOUT_MS = 2_000;

const DOMAIN_KEYS: Array<{
  domain: PersistenceDomain;
  storageKey: string;
  rawString?: boolean;
}> = [
  { domain: "profile", storageKey: "kinetic_profile" },
  { domain: "goal", storageKey: "kinetic_goal" },
  { domain: "plan", storageKey: "kinetic_plan" },
  { domain: "readiness", storageKey: "kinetic_readiness" },
  { domain: "workouts", storageKey: "kinetic_workout_log" },
  { domain: "recommendations", storageKey: "kinetic_recommendation_log" },
  { domain: "preferences", storageKey: "kinetic_learned_preferences" },
  {
    domain: "dismissed_preferences",
    storageKey: "kinetic_dismissed_preferences",
  },
  { domain: "today", storageKey: "kinetic_today_completion" },
  { domain: "schedule", storageKey: "kinetic_schedule" },
  {
    domain: "calendar_sync",
    storageKey: "kinetic_calendar_last_sync",
    rawString: true,
  },
  {
    domain: "calendar_failure",
    storageKey: "kinetic_calendar_last_failure",
    rawString: true,
  },
  { domain: "health_sync", storageKey: "kinetic_health_sync" },
];

const firestoreStore: RemoteDocumentStore = {
  async read<T>(userId: string, domain: PersistenceDomain) {
    const snapshot = await getDoc(doc(db, "users", userId, "kinetic", domain));
    if (!snapshot.exists()) return null;
    return coerceRemoteEnvelope(domain, snapshot.data()) as PersistedEnvelope<T> | null;
  },

  async write<T>(
    userId: string,
    domain: PersistenceDomain,
    value: PersistedEnvelope<T>,
  ) {
    await setDoc(doc(db, "users", userId, "kinetic", domain), {
      ...value,
      serverUpdatedAt: serverTimestamp(),
    });
  },
};

const repositories = DOMAIN_KEYS.map(({ domain, storageKey, rawString }) =>
  createStorageRepository<JsonValue>({
    domain,
    storageKey,
    remote: firestoreStore,
    ...(rawString
      ? {
          parseLocal: (raw: string) => raw,
          serializeLocal: (value: JsonValue) => String(value),
        }
      : {}),
  }),
);

const byStorageKey = new Map<string, StorageRepository<JsonValue>>(
  repositories.map((repository) => [repository.storageKey, repository]),
);

const mirrorTimers = new Map<string, ReturnType<typeof setTimeout>>();
const mirrorChains = new Map<string, Promise<void>>();

export async function hydrateUserStorage(
  userId: string,
  isSessionCurrent: () => boolean = () => true,
  timeoutMs = HYDRATION_TIMEOUT_MS,
): Promise<"updated" | "unchanged" | "timeout"> {
  const startedAt = performance.now();
  prepareLocalCacheForUser(window.localStorage, userId, () => {
    repositories.forEach((repository) => repository.clearLocal());
  });
  const initialCache = captureLocalCacheSnapshot(
    window.localStorage,
    repositories.map((repository) => repository.storageKey),
  );

  let hydrationActive = true;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const hydration = Promise.all(
    repositories.map(async (repository) => {
      try {
        const initialValue = initialCache[repository.storageKey] ?? null;
        const keyUnchanged = () => {
          try {
            return window.localStorage.getItem(repository.storageKey) === initialValue;
          } catch {
            return true;
          }
        };
        await repository.hydrate(
          userId,
          () => hydrationActive && isSessionCurrent() && keyUnchanged(),
        );
      } catch {
        // Remote persistence is an enhancement. Local demo state remains valid.
      }
    }),
  );
  const deadline = new Promise<"timeout">((resolve) => {
    timeoutId = setTimeout(() => resolve("timeout"), timeoutMs);
  });

  const outcome = await Promise.race([
    hydration.then(() =>
      localCacheChanged(window.localStorage, initialCache)
        ? ("updated" as const)
        : ("unchanged" as const),
    ),
    deadline,
  ]);
  hydrationActive = false;
  if (timeoutId) clearTimeout(timeoutId);

  if (isSessionCurrent()) {
    claimLocalCacheForUser(window.localStorage, userId);
  }
  trackProductEvent("persistence_sync_completed", {
    operation: "hydrate",
    outcome: outcome === "timeout" ? "timeout" : "success",
    cache_changed: outcome === "updated",
    latency_ms: performance.now() - startedAt,
  });
  return outcome;
}

export function mirrorPersistedStorageKey(storageKey: string): void {
  const user = auth.currentUser;
  const repository = byStorageKey.get(storageKey);
  if (!user || !repository) return;
  const existingTimer = mirrorTimers.get(storageKey);
  if (existingTimer) clearTimeout(existingTimer);

  const timer = setTimeout(() => {
    mirrorTimers.delete(storageKey);
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.uid !== user.uid) return;

    const startedAt = performance.now();
    const previous = mirrorChains.get(storageKey) ?? Promise.resolve();
    const next = previous
      .catch(() => {
        // Keep later mirrors moving even if an earlier remote write failed.
      })
      .then(() => repository.mirror(user.uid))
      .then(() => {
        trackProductEvent("persistence_sync_completed", {
          operation: "mirror",
          outcome: "success",
          domain: repository.domain,
          latency_ms: performance.now() - startedAt,
        });
      })
      .catch(() => {
        trackProductEvent("persistence_sync_completed", {
          operation: "mirror",
          outcome: "failed",
          domain: repository.domain,
          latency_ms: performance.now() - startedAt,
        });
        // Never block or break a local training action on remote availability.
      })
      .finally(() => {
        if (mirrorChains.get(storageKey) === next) {
          mirrorChains.delete(storageKey);
        }
      });
    mirrorChains.set(storageKey, next);
  }, 100);
  mirrorTimers.set(storageKey, timer);
}

export async function clearAllUserStorage(userId?: string): Promise<void> {
  const startedAt = performance.now();
  let failed = false;
  await Promise.all(
    repositories.map(async (repository) => {
      try {
        await repository.clear(userId);
      } catch {
        failed = true;
        if (!userId) {
          repository.clearLocal();
        }
      }
    }),
  );
  if (userId) {
    try {
      await firestoreStore.write(userId, "mobile_audit", {
        schemaVersion: 1,
        payload: null,
        deleted: true,
        clientUpdatedAt: new Date().toISOString(),
      });
    } catch {
      failed = true;
    }
  }
  trackProductEvent("persistence_sync_completed", {
    operation: "delete",
    outcome: failed ? "failed" : "success",
    domain: "all",
    latency_ms: performance.now() - startedAt,
  });
  if (failed && userId) {
    throw new Error("Remote deletion did not complete.");
  }
}
