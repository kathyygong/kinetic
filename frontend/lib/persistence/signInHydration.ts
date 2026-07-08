import type { UserProfile } from "@/lib/types";

type HydrationOutcome = "updated" | "unchanged" | "timeout";

type SignInHydrationOptions = {
  hydrate: () => Promise<HydrationOutcome>;
  readProfile: () => UserProfile | null;
  mergeIdentity: () => UserProfile;
};

/**
 * Hydrate a returning runner before any auth-identity merge writes locally.
 *
 * This ordering prevents a fresh browser's minimal auth profile from being
 * mirrored over a complete remote profile while Firebase hydration is still
 * in flight.
 */
export async function completeReturningUserSignIn({
  hydrate,
  readProfile,
  mergeIdentity,
}: SignInHydrationOptions): Promise<"/dashboard" | "/onboarding/goal"> {
  const hydration = await hydrate();
  if (hydration === "timeout" && !readProfile()) {
    throw new Error(
      "Your training data could not be reached yet. Please try signing in again.",
    );
  }
  const profile = mergeIdentity();
  return profile.onboarding_completed ? "/dashboard" : "/onboarding/goal";
}
