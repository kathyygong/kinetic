/* Local-first repository migration and isolation smoke. */

export {};

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
  }
}

const localStorage = new MemoryStorage();
Object.assign(globalThis, { window: { localStorage }, localStorage });

type Envelope =
  import("../lib/persistence/storageRepository").PersistedEnvelope<unknown>;
type Domain =
  import("../lib/persistence/storageRepository").PersistenceDomain;

const remote = new Map<string, Envelope>();
const remoteStore = {
  async read<T>(userId: string, domain: Domain) {
    return (remote.get(`${userId}:${domain}`) ?? null) as
      | import("../lib/persistence/storageRepository").PersistedEnvelope<T>
      | null;
  },
  async write<T>(
    userId: string,
    domain: Domain,
    value: import("../lib/persistence/storageRepository").PersistedEnvelope<T>,
  ) {
    remote.set(`${userId}:${domain}`, value as Envelope);
  },
};

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const { createStorageRepository } = await import(
    "../lib/persistence/storageRepository"
  );
  const {
    captureLocalCacheSnapshot,
    claimLocalCacheForUser,
    localCacheChanged,
    prepareLocalCacheForUser,
  } = await import("../lib/persistence/localCacheOwnership");
  const repository = createStorageRepository<{ name: string }>({
    domain: "profile",
    storageKey: "kinetic_profile",
    remote: remoteStore,
  });

  repository.writeLocal({ name: "Local runner" });
  expect(
    (await repository.hydrate("runner-a")) === "migrated",
    "first sign-in should migrate local data",
  );
  expect(
    remote.get("runner-a:profile")?.deleted === false,
    "migration should create a live remote envelope",
  );
  expect(
    remote.get("runner-b:profile") === undefined,
    "remote records must remain user-scoped",
  );

  remote.set("runner-a:profile", {
    schemaVersion: 1,
    payload: { name: "Remote runner" },
    deleted: false,
    clientUpdatedAt: new Date().toISOString(),
  });
  expect(
    (await repository.hydrate("runner-a")) === "remote",
    "remote data should hydrate the local cache",
  );
  expect(
    repository.readLocal()?.name === "Remote runner",
    "remote data should become the local cache",
  );

  await repository.clear("runner-a");
  expect(repository.readLocal() === null, "clear should remove local data");
  expect(
    remote.get("runner-a:profile")?.deleted === true,
    "clear should write a remote tombstone",
  );

  repository.writeLocal({ name: "Stale cache" });
  await repository.hydrate("runner-a");
  expect(
    repository.readLocal() === null,
    "remote tombstones must prevent stale local re-migration",
  );

  let cacheClears = 0;
  expect(
    prepareLocalCacheForUser(localStorage, "runner-a", () => {
      cacheClears += 1;
    }) === "unowned",
    "an unowned demo cache should be eligible for first-user migration",
  );
  expect(cacheClears === 0, "first-user migration must preserve local data");
  claimLocalCacheForUser(localStorage, "runner-a");
  expect(
    prepareLocalCacheForUser(localStorage, "runner-a", () => {
      cacheClears += 1;
    }) === "same-user",
    "the same user should retain their offline cache",
  );
  expect(cacheClears === 0, "same-user hydration must preserve local data");
  expect(
    prepareLocalCacheForUser(localStorage, "runner-b", () => {
      cacheClears += 1;
    }) === "switched-user",
    "a new UID should be recognized as a user switch",
  );
  expect(
    cacheClears === 1,
    "switching UIDs must clear the previous user's training cache",
  );

  const unchangedSnapshot = captureLocalCacheSnapshot(localStorage, [
    "kinetic_profile",
  ]);
  expect(
    !localCacheChanged(localStorage, unchangedSnapshot),
    "an identical hydrated cache should not remount the application",
  );
  repository.writeLocal({ name: "Changed cache" });
  expect(
    localCacheChanged(localStorage, unchangedSnapshot),
    "a changed remote cache should request one application remount",
  );

  repository.writeLocal({ name: "New local action" });
  remote.set("runner-a:profile", {
    schemaVersion: 1,
    payload: { name: "Late remote result" },
    deleted: false,
    clientUpdatedAt: new Date().toISOString(),
  });
  await repository.hydrate("runner-a", () => false);
  expect(
    repository.readLocal()?.name === "New local action",
    "a hydration result arriving after the startup deadline must not overwrite newer local state",
  );

  console.log("OK - local-first persistence is isolated and idempotent");
}

void main();
