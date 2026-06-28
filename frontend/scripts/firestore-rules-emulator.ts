/**
 * Cross-user Firestore rules test.
 *
 * Run with Firebase Auth + Firestore emulators configured by firebase.json:
 *   firebase emulators:exec --only auth,firestore "npm run test:firestore-rules"
 */

import { deleteApp, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signInAnonymously,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  setDoc,
} from "firebase/firestore";

const projectId = "kinetic-rules-test";
const config = { apiKey: "demo-key", authDomain: "localhost", projectId };

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function expectDenied(action: () => Promise<unknown>, label: string) {
  try {
    await action();
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "";
    if (code.includes("permission-denied")) return;
    throw error;
  }
  throw new Error(`${label} unexpectedly succeeded`);
}

async function main() {
  const appA = initializeApp(config, "rules-a");
  const appB = initializeApp(config, "rules-b");
  const appGuest = initializeApp(config, "rules-guest");

  try {
    const authA = getAuth(appA);
    const authB = getAuth(appB);
    connectAuthEmulator(authA, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    connectAuthEmulator(authB, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });

    const dbA = getFirestore(appA);
    const dbB = getFirestore(appB);
    const dbGuest = getFirestore(appGuest);
    connectFirestoreEmulator(dbA, "127.0.0.1", 8080);
    connectFirestoreEmulator(dbB, "127.0.0.1", 8080);
    connectFirestoreEmulator(dbGuest, "127.0.0.1", 8080);

    const userA = (await signInAnonymously(authA)).user;
    const userB = (await signInAnonymously(authB)).user;
    const ownA = doc(dbA, "users", userA.uid, "kinetic", "profile");
    const foreignAFromB = doc(
      dbB,
      "users",
      userA.uid,
      "kinetic",
      "profile",
    );
    const guestA = doc(dbGuest, "users", userA.uid, "kinetic", "profile");
    const ownB = doc(dbB, "users", userB.uid, "kinetic", "profile");
    const unknownDomainA = doc(
      dbA,
      "users",
      userA.uid,
      "kinetic",
      "arbitrary",
    );

    await setDoc(ownA, { schemaVersion: 1, payload: { name: "A" } });
    await setDoc(ownB, { schemaVersion: 1, payload: { name: "B" } });
    expect((await getDoc(ownA)).exists(), "owner A should read their document");
    expect((await getDoc(ownB)).exists(), "owner B should read their document");
    await expectDenied(() => getDoc(foreignAFromB), "cross-user read");
    await expectDenied(
      () => setDoc(foreignAFromB, { payload: { name: "overwrite" } }),
      "cross-user write",
    );
    await expectDenied(() => getDoc(guestA), "unauthenticated read");
    await expectDenied(
      () => setDoc(unknownDomainA, { payload: "not allowed" }),
      "unknown domain write",
    );

    console.log(
      "OK - Firestore rules deny unauthenticated, cross-user, and unknown-domain access",
    );
  } finally {
    await Promise.all([deleteApp(appA), deleteApp(appB), deleteApp(appGuest)]);
  }
}

void main();
