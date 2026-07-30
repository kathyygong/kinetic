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
import { loadMobileCheckinFixture } from "./smoke-mobile-checkin-contract";
import { loadMobileFoundationFixture } from "./smoke-mobile-foundation-contract";
import { loadMobilePlanLifecycleFixture } from "./smoke-mobile-plan-lifecycle-contract";

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
  const checkinFixture = loadMobileCheckinFixture();
  const foundationFixture = loadMobileFoundationFixture();
  const planLifecycleFixture = loadMobilePlanLifecycleFixture();
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
    const ownWorkouts = doc(dbA, "users", userA.uid, "kinetic", "workouts");
    const ownSettings = doc(dbA, "users", userA.uid, "kinetic", "settings");
    const ownOnboarding = doc(dbA, "users", userA.uid, "kinetic", "onboarding");
    const ownPlanHistory = doc(dbA, "users", userA.uid, "kinetic", "plan_history");
    const ownPlanOperations = doc(
      dbA,
      "users",
      userA.uid,
      "kinetic",
      "plan_operations",
    );
    const ownRecommendations = doc(
      dbA,
      "users",
      userA.uid,
      "kinetic",
      "recommendations",
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
    const foreignWorkoutsFromB = doc(
      dbB,
      "users",
      userA.uid,
      "kinetic",
      "workouts",
    );
    const foreignPlanHistoryFromB = doc(
      dbB,
      "users",
      userA.uid,
      "kinetic",
      "plan_history",
    );
    const foreignPlanOperationsFromB = doc(
      dbB,
      "users",
      userA.uid,
      "kinetic",
      "plan_operations",
    );
    const foreignRecommendationsFromB = doc(
      dbB,
      "users",
      userA.uid,
      "kinetic",
      "recommendations",
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
    await setDoc(ownWorkouts, {
      schemaVersion: 1,
      payload: checkinFixture.state.workouts,
      deleted: false,
      clientUpdatedAt: checkinFixture.now,
    });
    await setDoc(ownRecommendations, {
      schemaVersion: 1,
      payload: checkinFixture.state.recommendations,
      deleted: false,
      clientUpdatedAt: checkinFixture.now,
    });
    await setDoc(ownSettings, {
      schemaVersion: 1,
      payload: foundationFixture.active_state,
      deleted: false,
      clientUpdatedAt: "2026-07-30T16:00:00.000Z",
    });
    await setDoc(ownOnboarding, {
      schemaVersion: 1,
      payload: foundationFixture.new_runner_state,
      deleted: false,
      clientUpdatedAt: "2026-07-30T16:00:00.000Z",
    });
    await setDoc(ownPlanHistory, {
      schemaVersion: 1,
      payload: {
        versions: [planLifecycleFixture.commit_move_response],
      },
      deleted: false,
      clientUpdatedAt: "2026-07-30T16:00:00.000Z",
    });
    await setDoc(ownPlanOperations, {
      schemaVersion: 1,
      payload: {
        operations: [
          {
            operation_id:
              planLifecycleFixture.commit_move_request &&
              typeof planLifecycleFixture.commit_move_request === "object" &&
              "operation_id" in planLifecycleFixture.commit_move_request
                ? planLifecycleFixture.commit_move_request.operation_id
                : "fixture-error",
            request_fingerprint: "sha256-mobile-move-0001",
            committed_version: 4,
          },
        ],
      },
      deleted: false,
      clientUpdatedAt: "2026-07-30T16:00:00.000Z",
    });
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
            id: "native-checkin-1",
            name: "mobile_checkin_synced",
            at: "2026-07-20T17:45:00.000Z",
            properties: {
              platform: "ios",
              checkin_kind: "perceived_recovery",
              status: "checked_in",
              outcome: "success",
              failure_state: "none",
              write_scope: "readiness",
              deterministic_validation: "passed",
              has_effort: false,
              has_user_reflection: false,
              update_succeeded: true,
              latency_ms: 160,
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
          {
            schemaVersion: 2,
            id: "shared-pattern-result-1",
            name: "mobile_pattern_result_lifecycle",
            at: "2026-07-23T12:00:00.000Z",
            properties: {
              platform: "web",
              action: "reviewed",
              outcome: "success",
              pattern_family: "specific_day_skips",
              result_kind: "preferred_day_review",
              mutation_state: "review_only",
              deterministic_validation: "not_run",
              source: "deterministic",
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
    const auditEvents =
      (await getDoc(ownMobileAudit)).data()?.payload?.events ?? [];
    expect(
      auditEvents.find(
        (event: { name?: string }) =>
          event.name === "mobile_decision_validated",
      )?.properties?.decision_source === "live",
      "owner A should read privacy-safe native audit events",
    );
    expect(
      auditEvents.find(
        (event: { name?: string }) =>
          event.name === "mobile_intake_lifecycle",
      )?.properties?.route === "review_draft",
      "owner A should read bounded mobile intake lifecycle outcomes",
    );
    expect(
      auditEvents.find(
        (event: { name?: string }) =>
          event.name === "mobile_checkin_synced",
      )?.properties?.write_scope === "readiness",
      "owner A should read bounded mobile check-in lifecycle outcomes",
    );
    expect(
      auditEvents.find(
        (event: { name?: string }) =>
          event.name === "mobile_pattern_result_lifecycle",
      )?.properties?.result_kind === "preferred_day_review",
      "owner A should read bounded behavior-pattern result outcomes",
    );
    expect((await getDoc(ownWorkouts)).exists(), "owner A should read workouts");
    expect((await getDoc(ownSettings)).exists(), "owner A should read settings");
    expect((await getDoc(ownOnboarding)).exists(), "owner A should read onboarding");
    expect((await getDoc(ownPlanHistory)).exists(), "owner A should read plan history");
    expect(
      (await getDoc(ownPlanOperations)).exists(),
      "owner A should read plan operations",
    );
    expect(
      (await getDoc(ownRecommendations)).exists(),
      "owner A should read recommendations",
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
      () => getDoc(foreignWorkoutsFromB),
      "cross-user workouts read",
    );
    await expectDenied(
      () => getDoc(foreignPlanHistoryFromB),
      "cross-user plan history read",
    );
    await expectDenied(
      () => getDoc(foreignPlanOperationsFromB),
      "cross-user plan operations read",
    );
    await expectDenied(
      () => getDoc(foreignRecommendationsFromB),
      "cross-user recommendations read",
    );
    await expectDenied(
      () =>
        setDoc(foreignWorkoutsFromB, {
          schemaVersion: 1,
          payload: checkinFixture.state.workouts,
          deleted: false,
          clientUpdatedAt: checkinFixture.now,
        }),
      "cross-user workouts write",
    );
    await expectDenied(
      () =>
        setDoc(foreignRecommendationsFromB, {
          schemaVersion: 1,
          payload: checkinFixture.state.recommendations,
          deleted: false,
          clientUpdatedAt: checkinFixture.now,
        }),
      "cross-user recommendations write",
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
      "OK - Firestore rules preserve owner-only mobile foundation, plan lifecycle, readiness, check-ins, health sync, audit data, and tombstones",
    );
  } finally {
    await Promise.all([deleteApp(appA), deleteApp(appB), deleteApp(appGuest)]);
  }
}

void main();
