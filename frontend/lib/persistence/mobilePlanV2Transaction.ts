"use client";

import { doc, runTransaction, serverTimestamp } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import type { MobilePlanLifecycleResponseV2 } from "@/lib/mobilePlanV2Contract";

type Envelope = { schemaVersion?: number; payload?: unknown; deleted?: boolean };

/**
 * Persist the v2 authority package as one owner transaction. Profile/goal and
 * plan can therefore never expose different planning revisions.
 */
export async function commitMobilePlanV2Package(
  response: MobilePlanLifecycleResponseV2,
  operation: { operation_id: string; request_fingerprint: string },
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Authenticated owner required.");
  if (response.result !== "commit_ready" || !response.commit_plan || !response.commit_planning_inputs) {
    throw new Error("Only a complete commit_ready package may be persisted.");
  }
  const commitPlan = response.commit_plan;
  const inputs = response.commit_planning_inputs;
  const uid = user.uid;
  const refs = Object.fromEntries(
    ["profile", "goal", "plan", "plan_history", "plan_operations"].map((domain) => [
      domain, doc(db, "users", uid, "kinetic", domain),
    ]),
  );
  await runTransaction(db, async (transaction) => {
    const [profileDoc, goalDoc, planDoc, historyDoc, operationsDoc] = await Promise.all([
      transaction.get(refs.profile), transaction.get(refs.goal), transaction.get(refs.plan),
      transaction.get(refs.plan_history), transaction.get(refs.plan_operations),
    ]);
    const envelope = (snapshot: typeof profileDoc): Envelope => snapshot.exists() ? snapshot.data() as Envelope : {};
    const currentPlan = envelope(planDoc).payload as { version?: number } | null | undefined;
    if ((currentPlan?.version ?? 0) !== response.base_version) throw new Error("Plan version conflict.");
    const operations = ((envelope(operationsDoc).payload as { operations?: Array<{ operation_id?: string; request_fingerprint?: string }> } | undefined)?.operations ?? []);
    const prior = operations.find((item) => item.operation_id === operation.operation_id);
    if (prior && prior.request_fingerprint !== operation.request_fingerprint) throw new Error("Operation id conflict.");
    if (prior) return;
    const profile = (envelope(profileDoc).payload as Record<string, unknown> | undefined) ?? {};
    const goal = (envelope(goalDoc).payload as Record<string, unknown> | undefined) ?? {};
    const common = { schemaVersion: 2, deleted: false, clientUpdatedAt: new Date().toISOString(), serverUpdatedAt: serverTimestamp() };
    transaction.set(refs.profile, { ...common, payload: {
      ...profile, experience_level: inputs.experience_level, weekly_mileage: inputs.weekly_mileage ?? undefined,
      preferred_training_days: inputs.preferred_days, personal_bests: inputs.personal_bests_seconds,
      weekly_availability: inputs.weekly_availability, planning_revision: inputs.revision,
    } });
    transaction.set(refs.goal, { ...common, payload: {
      ...goal, goal_type: "race", race_distance: inputs.race_distance, target_date: inputs.target_date,
      experience_level: inputs.experience_level, weekly_mileage: inputs.weekly_mileage ?? undefined,
      current_prs: inputs.personal_bests_seconds, planning_revision: inputs.revision,
    } });
    transaction.set(refs.plan, { ...common, payload: commitPlan });
    const history = ((envelope(historyDoc).payload as { versions?: unknown[] } | undefined)?.versions ?? []);
    transaction.set(refs.plan_history, { ...common, payload: { versions: [...history, commitPlan] } });
    transaction.set(refs.plan_operations, { ...common, payload: { operations: [...operations, {
      ...operation, committed_version: commitPlan.version, planning_revision: inputs.revision,
    }] } });
  });
}
