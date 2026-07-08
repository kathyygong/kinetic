"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FirebaseError } from "firebase/app";
import { motion, AnimatePresence } from "framer-motion";

import {
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
} from "@/lib/firebase";
import {
  getUserProfile,
  mergeAuthIntoProfile,
} from "@/lib/profileStorage";
import { hydrateUserStorage } from "@/lib/persistence/firebasePersistence";
import { completeReturningUserSignIn } from "@/lib/persistence/signInHydration";
import { tokens } from "@/lib/tokens";
import AthleticImage from "@/components/AthleticImage";
import KineticLogo from "@/components/KineticLogo";
import StrideWave from "@/components/StrideWave";

type Mode = "signin" | "signup";

// `useSearchParams()` opts the page out of static prerender unless it's
// inside a Suspense boundary — Next.js 16 enforces this at build time.
// Keep all hook usage inside `LoginInner` so the wrapper below can
// remain a tiny shell that just provides the boundary.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode: Mode = searchParams?.get("mode") === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Keep state in sync if the user toggles back via the welcome screen.
  useEffect(() => {
    const m = searchParams?.get("mode");
    if (m === "signup" || m === "signin") setMode(m);
  }, [searchParams]);

  const handleEmailSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        const cred = await signInWithEmail(email, password);
        // A fresh browser has no local cache yet. Hydrate the authenticated
        // user's remote profile before merging auth identity or deciding where
        // to route; otherwise a minimal local profile can overwrite the real
        // Firebase document and incorrectly send a returning runner through
        // onboarding.
        const destination = await completeReturningUserSignIn({
          hydrate: () =>
            hydrateUserStorage(cred.user.uid, () => true, 10_000),
          readProfile: getUserProfile,
          mergeIdentity: () => mergeAuthIntoProfile(cred.user),
        });
        router.push(destination);
      } else {
        const cred = await signUpWithEmail(email, password);
        // Brand new account — seed the profile with their auth identity
        // so the rest of onboarding (goal/PRs/integrations/preview) has
        // a real name + email to write into.
        mergeAuthIntoProfile(cred.user);
        router.push("/onboarding/goal");
      }
    } catch (err) {
      setError(
        err instanceof FirebaseError || err instanceof Error
          ? err.message
          : "Authentication failed.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      const cred = await signInWithGoogle();
      const destination = await completeReturningUserSignIn({
        hydrate: () =>
          hydrateUserStorage(cred.user.uid, () => true, 10_000),
        readProfile: getUserProfile,
        mergeIdentity: () => mergeAuthIntoProfile(cred.user),
      });
      router.push(destination);
    } catch (err) {
      setError(
        err instanceof FirebaseError || err instanceof Error
          ? err.message
          : "Google sign-in failed.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex flex-1 items-center justify-center px-4 py-10 sm:py-14">
      <div className="grid w-full max-w-4xl items-stretch gap-8 lg:grid-cols-[1.05fr_minmax(0,22rem)]">
        {/* Athletic hero — full-bleed photography that sets the tone */}
        {/* before the runner signs in. Hidden on small screens so the */}
        {/* auth form stays front-and-centre on mobile. */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="hidden lg:block"
        >
          <AthleticImage
            src="/images/athletic/track-lanes.jpg"
            alt="Runners training together at dawn"
            eyebrow="Adaptive training"
            title={
              <>
                Train with your body,
                <br />
                not against it.
              </>
            }
            subtitle="Kinetic reads your readiness, your plan, and your day — then tells you exactly what to run."
            className="h-full min-h-[32rem]"
            priority
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="w-full self-center"
        >
        <div className="relative space-y-6 overflow-hidden rounded-3xl border border-white/40 bg-white/80 p-8 shadow-[0_20px_60px_-20px_rgb(15_23_42/0.18)] backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/70">
          {/* Decorative stride wave inside the top of the card — */}
          {/* fades into the title area and reinforces brand motion. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-14 opacity-80">
            <div className="mx-auto h-full w-[110%] -translate-x-[5%]">
              <StrideWave width={520} height={56} tone="blue" loop />
            </div>
          </div>

          <div className="relative space-y-2 pt-2 text-center">
            <div className="flex items-center justify-center gap-3">
              <KineticLogo size={32} />
              {/* Brand wordmark — uppercase Space Grotesk with wide
                  tracking. Mirrors the lockup used in the global
                  top-nav so the login screen reads as the same
                  product the user signs in to. */}
              <h1 className="font-brand text-xl font-semibold uppercase leading-none tracking-[0.24em] text-neutral-900 dark:text-white">
                Kinetic
              </h1>
            </div>
            <AnimatePresence mode="wait">
              <motion.p
                key={mode}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="text-sm text-neutral-500 dark:text-neutral-400"
              >
                {mode === "signin"
                  ? "Welcome back. Let's get moving."
                  : "Create your account in seconds."}
              </motion.p>
            </AnimatePresence>
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
            />
          </div>

          {error && (
            <p className={`text-sm ${tokens.warning.text}`} role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50 ${tokens.primary.solid}`}
          >
            {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
          <span className="text-xs uppercase tracking-wider text-neutral-500">or</span>
          <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className={`flex w-full items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-medium text-black hover:border-black/20 hover:bg-neutral-50 hover:shadow-sm disabled:opacity-50 dark:border-white/15 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800 ${tokens.motion}`}
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <p className="text-center text-sm text-neutral-500">
          {mode === "signin" ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
            }}
            className="font-medium text-black underline-offset-2 hover:underline dark:text-white"
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>
        </div>
        </motion.div>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.6 2.4-7.2 2.4-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C40.9 35.3 44 30.1 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
