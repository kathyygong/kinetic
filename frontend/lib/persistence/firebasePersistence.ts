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
import {
  claimLocalCacheForUser,
  prepareLocalCacheForUser,
} from "@/lib/persistence/localCacheOwnership";

type JsonValue = unknown;

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
];

const firestoreStore: RemoteDocumentStore = {
  async read<T>(userId: string, domain: PersistenceDomain) {
    const snapshot = await getDoc(doc(db, "users", userId, "kinetic", domain));
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    if (data.schemaVersion !== 1 || typeof data.deleted !== "boolean") {
      return null;
    }
    return {
      schemaVersion: 1,
      payload: (data.payload ?? null) as T | null,
      deleted: data.deleted,
      clientUpdatedAt:
        typeof data.clientUpdatedAt === "string" ? data.clientUpdatedAt : "",
    };
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

export async function hydrateUserStorage(userId: string): Promise<void> {
  prepareLocalCacheForUser(window.localStorage, userId, () => {
    repositories.forEach((repository) => repository.clearLocal());
  });

  await Promise.all(
    repositories.map(async (repository) => {
      try {
        await repository.hydrate(userId);
      } catch {
        // Remote persistence is an enhancement. Local demo state remains valid.
      }
    }),
  );

  claimLocalCacheForUser(window.localStorage, userId);
}

export function mirrorPersistedStorageKey(storageKey: string): void {
  const user = auth.currentUser;
  const repository = byStorageKey.get(storageKey);
  if (!user || !repository) return;
  void repository.mirror(user.uid).catch(() => {
    // Never block or break a local training action on remote availability.
  });
}

export async function clearAllUserStorage(userId?: string): Promise<void> {
  await Promise.all(
    repositories.map(async (repository) => {
      try {
        await repository.clear(userId);
      } catch {
        repository.clearLocal();
      }
    }),
  );
}
