"use client";

import type { ReactNode } from "react";
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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unregisterMirror = registerPersistenceMirror(
      mirrorPersistedStorageKey,
    );
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setReady(true);
        return;
      }
      setReady(false);
      await hydrateUserStorage(user.uid);
      setReady(true);
    });
    return () => {
      unregisterMirror();
      unsubscribeAuth();
    };
  }, []);

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-neutral-500">Loading your training data…</p>
      </main>
    );
  }

  return children;
}
