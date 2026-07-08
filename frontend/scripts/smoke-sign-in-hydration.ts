import { completeReturningUserSignIn } from "../lib/persistence/signInHydration";
import type { UserProfile } from "../lib/types";

function profile(completed: boolean): UserProfile {
  return {
    full_name: "QA runner",
    email: "",
    experience_level: "intermediate",
    preferred_training_days: [],
    personal_bests: {},
    connected_services: {
      google_calendar: { connected: false },
      apple_health: { connected: false },
      garmin: { connected: false },
      oura: { connected: false },
    },
    onboarding_completed: completed,
  };
}

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const order: string[] = [];
  let hydratedProfile: UserProfile | null = null;
  const destination = await completeReturningUserSignIn({
    hydrate: async () => {
      order.push("hydrate");
      hydratedProfile = profile(true);
      return "updated";
    },
    readProfile: () => hydratedProfile,
    mergeIdentity: () => {
      order.push("merge");
      return hydratedProfile ?? profile(false);
    },
  });
  expect(order.join(",") === "hydrate,merge", "identity merged before hydration");
  expect(destination === "/dashboard", "returning runner should reach dashboard");

  let mergeCalled = false;
  let timedOut = false;
  try {
    await completeReturningUserSignIn({
      hydrate: async () => "timeout",
      readProfile: () => null,
      mergeIdentity: () => {
        mergeCalled = true;
        return profile(false);
      },
    });
  } catch {
    timedOut = true;
  }
  expect(timedOut, "empty fresh session should stop after hydration timeout");
  expect(!mergeCalled, "timeout must not mirror a minimal profile");

  const offlineDestination = await completeReturningUserSignIn({
    hydrate: async () => "timeout",
    readProfile: () => profile(true),
    mergeIdentity: () => profile(true),
  });
  expect(
    offlineDestination === "/dashboard",
    "same-user offline cache should remain usable",
  );

  console.log("OK - returning-user routing hydrates before identity merge");
}

void main();
