"use client";

import { Fragment, type ReactNode } from "react";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";

import { auth } from "@/lib/firebase";
import {
  hydrateUserStorage,
  mirrorPersistedStorageKey,
} from "@/lib/persistence/firebasePersistence";
import { registerPersistenceMirror } from "@/lib/persistence/mirror";

export default function PersistenceBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const [authReady, setAuthReady] = useState(false);
  const [authSession, setAuthSession] = useState("initializing");
  const [hydrationVersion, setHydrationVersion] = useState(0);

  useEffect(() => {
    let active = true;
    let authGeneration = 0;
    const unregisterMirror = registerPersistenceMirror(
      mirrorPersistedStorageKey,
    );
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      const generation = ++authGeneration;
      if (!user) {
        setAuthSession("signed-out");
        setAuthReady(true);
        return;
      }

      // The ownership guard inside hydrateUserStorage runs synchronously
      // before its first await, so a different UID's local cache is cleared
      // before this session is rendered.
      const isSessionCurrent = () =>
        active && generation === authGeneration;
      const hydration = hydrateUserStorage(user.uid, isSessionCurrent);
      setAuthSession(user.uid);
      setAuthReady(true);
      void hydration.then((outcome) => {
        if (isSessionCurrent() && outcome === "complete") {
          setHydrationVersion((version) => version + 1);
        }
      });
    });
    return () => {
      active = false;
      unregisterMirror();
      unsubscribeAuth();
    };
  }, []);

  if (!authReady) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-neutral-500">Loading your training data…</p>
      </main>
    );
  }

  return (
    <Fragment key={`${authSession}:${hydrationVersion}`}>{children}</Fragment>
  );
}
