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
import { loadMobileContractFixtures } from "./smoke-mobile-readiness-contract";

const projectId = "kinetic-rules-test";
const config = { apiKey: "demo-key", authDomain: "localhost", projectId };

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function asDocument(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a document object`);
  }
  return value as Record<string, unknown>;
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
  const fixtures = loadMobileContractFixtures();
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
    const ownHealthSync = doc(
      dbA,
      "users",
      userA.uid,
      "kinetic",
      "health_sync",
    );
    const ownReadiness = doc(
      dbA,
      "users",
      userA.uid,
      "kinetic",
      "readiness",
    );
    const ownMobileAudit = doc(
      dbA,
      "users",
      userA.uid,
      "kinetic",
      "mobile_audit",
    );
    const foreignReadinessFromB = doc(
      dbB,
      "users",
      userA.uid,
      "kinetic",
      "readiness",
    );
    const foreignHealthSyncFromB = doc(
      dbB,
      "users",
      userA.uid,
      "kinetic",
      "health_sync",
    );
    const foreignMobileAuditFromB = doc(
      dbB,
      "users",
      userA.uid,
      "kinetic",
      "mobile_audit",
    );
    const unknownDomainA = doc(
      dbA,
      "users",
      userA.uid,
      "kinetic",
      "arbitrary",
    );

    await setDoc(ownA, { schemaVersion: 1, payload: { name: "A" } });
    await setDoc(ownB, { schemaVersion: 1, payload: { name: "B" } });
    await setDoc(
      ownReadiness,
      asDocument(fixtures.readiness_envelope, "readiness envelope"),
    );
    await setDoc(
      ownHealthSync,
      asDocument(fixtures.health_sync_envelope, "health sync envelope"),
    );
    await setDoc(ownMobileAudit, {
      schemaVersion: 1,
      payload: {
        version: 2,
        events: [
          {
            schemaVersion: 2,
            id: "native-decision-1",
            name: "mobile_decision_validated",
            at: "2026-07-17T12:00:00.000Z",
            properties: {
              platform: "ios",
              outcome: "success",
              decision_source: "live",
            },
          },
          {
            schemaVersion: 2,
            id: "native-intake-1",
            name: "mobile_intake_lifecycle",
            at: "2026-07-20T12:00:00.000Z",
            properties: {
              platform: "ios",
              action: "reviewed",
              outcome: "success",
              route: "review_draft",
              draft_kind: "availability",
              failure_state: "none",
              parser_source: "deterministic",
              mutation_state: "review_only",
              deterministic_validation: "not_run",
            },
          },
        ],
      },
      deleted: false,
      clientUpdatedAt: "2026-07-17T12:00:00.000Z",
    });
    expect((await getDoc(ownA)).exists(), "owner A should read their document");
    expect((await getDoc(ownB)).exists(), "owner B should read their document");
    expect(
      (await getDoc(ownHealthSync)).exists(),
      "owner A should read their mobile health sync document",
    );
    expect(
      (await getDoc(ownMobileAudit)).data()?.payload?.events?.[0]?.properties
        ?.decision_source === "live",
      "owner A should read privacy-safe native audit events",
    );
    expect(
      (await getDoc(ownMobileAudit)).data()?.payload?.events?.[1]?.properties
        ?.route === "review_draft",
      "owner A should read bounded mobile intake lifecycle outcomes",
    );
    const readinessSnapshot = await getDoc(ownReadiness);
    expect(readinessSnapshot.exists(), "owner A should read mobile readiness");
    expect(
      readinessSnapshot.data()?.payload?.entries?.["2026-07-12"]?.source ===
        "healthkit",
      "mobile readiness should preserve bounded HealthKit provenance",
    );
    await expectDenied(() => getDoc(foreignAFromB), "cross-user read");
    await expectDenied(
      () => setDoc(foreignAFromB, { payload: { name: "overwrite" } }),
      "cross-user write",
    );
    await expectDenied(
      () => getDoc(foreignReadinessFromB),
      "cross-user readiness read",
    );
    await expectDenied(
      () =>
        setDoc(
          foreignReadinessFromB,
          asDocument(fixtures.readiness_envelope, "foreign readiness envelope"),
        ),
      "cross-user readiness write",
    );
    await expectDenied(
      () => getDoc(foreignHealthSyncFromB),
      "cross-user health sync read",
    );
    await expectDenied(
      () => getDoc(foreignMobileAuditFromB),
      "cross-user mobile audit read",
    );
    await expectDenied(
      () =>
        setDoc(foreignMobileAuditFromB, {
          schemaVersion: 1,
          payload: { version: 2, events: [] },
          deleted: false,
        }),
      "cross-user mobile audit write",
    );
    await expectDenied(
      () =>
        setDoc(
          foreignHealthSyncFromB,
          asDocument(fixtures.health_sync_envelope, "foreign health sync envelope"),
        ),
      "cross-user health sync write",
    );
    await expectDenied(() => getDoc(guestA), "unauthenticated read");
    await expectDenied(
      () => setDoc(unknownDomainA, { payload: "not allowed" }),
      "unknown domain write",
    );

    await setDoc(
      ownReadiness,
      asDocument(fixtures.readiness_tombstone, "readiness tombstone"),
    );
    await setDoc(
      ownHealthSync,
      asDocument(fixtures.health_sync_tombstone, "health sync tombstone"),
    );
    const readinessTombstone = (await getDoc(ownReadiness)).data();
    const healthSyncTombstone = (await getDoc(ownHealthSync)).data();
    expect(
      readinessTombstone?.deleted === true && readinessTombstone.payload === null,
      "owner readiness delete should persist an explicit tombstone",
    );
    expect(
      healthSyncTombstone?.deleted === true && healthSyncTombstone.payload === null,
      "owner health disconnect should persist an explicit tombstone",
    );

    console.log(
      "OK - Firestore rules preserve owner-only mobile readiness, health sync, audit data, and tombstones",
    );
  } finally {
    await Promise.all([deleteApp(appA), deleteApp(appB), deleteApp(appGuest)]);
  }
}

void main();
