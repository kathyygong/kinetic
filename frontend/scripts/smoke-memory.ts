/* Training-memory preference lifecycle smoke. */

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
}

const localStorage = new MemoryStorage();
Object.assign(globalThis, { window: { localStorage }, localStorage });

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const { behaviorRepository } = await import(
    "../lib/persistence/behaviorRepository"
  );

  behaviorRepository.confirmPreference({
    id: "busy-days",
    type: "busy_day_preference",
    description: "Prefers shorter easy sessions on packed workdays.",
    confidence: "moderate",
    userConfirmed: true,
    createdAt: "2026-06-27T12:00:00.000Z",
  });
  expect(
    behaviorRepository.listConfirmedPreferences().length === 1,
    "confirmed preference should persist",
  );

  behaviorRepository.dismissPattern("rest-days");
  expect(
    behaviorRepository.listDismissedPatternIds().includes("rest-days"),
    "dismissed pattern should persist",
  );

  behaviorRepository.restorePattern("rest-days");
  expect(
    !behaviorRepository.listDismissedPatternIds().includes("rest-days"),
    "restored pattern should be visible again",
  );

  behaviorRepository.clearMemory();
  expect(
    behaviorRepository.listConfirmedPreferences().length === 0,
    "clear memory should remove confirmed preferences",
  );
  expect(
    behaviorRepository.listDismissedPatternIds().length === 0,
    "clear memory should remove dismissed pattern ids",
  );

  console.log(
    "OK - training memory supports confirm, dismiss, remove, and clear",
  );
}

void main();
