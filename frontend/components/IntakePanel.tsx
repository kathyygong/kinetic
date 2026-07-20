"use client";

import { useMemo, useState } from "react";

import GlassCard from "@/components/GlassCard";
import {
  fetchIntakeDraft,
  type IntakeDraft,
  type IntakeParseResponse,
} from "@/lib/api";
import {
  buildConfirmedIntakeState,
  persistConfirmedIntake,
  validateIntakeDraft,
  type ConfirmedIntakeState,
} from "@/lib/intake";
import type { SavedPlan } from "@/lib/storage";
import { trackProductEvent } from "@/lib/instrumentation";
import { tokens } from "@/lib/tokens";
import type { Goal, UserProfile } from "@/lib/types";

type Props = {
  goal: Goal | null;
  profile: UserProfile | null;
  savedPlan: SavedPlan | null;
  onApplied: (state: ConfirmedIntakeState) => void;
};

type DraftState = {
  response: IntakeParseResponse;
  sourceText: string;
};

export default function IntakePanel({
  goal,
  profile,
  savedPlan,
  onApplied,
}: Props) {
  const [text, setText] = useState("");
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  const today = localISODate();
  const validation = useMemo(
    () =>
      draftState
        ? validateIntakeDraft(
            draftState.response.draft,
            draftState.sourceText,
            today,
            goal,
            savedPlan,
          )
        : null,
    [draftState, goal, savedPlan, today],
  );

  async function parseNote() {
    const note = text.trim();
    if (!note) {
      setError("Add a concrete change for Kinetic to review.");
      return;
    }
    setLoading(true);
    setError(null);
    setApplied(null);
    setDraftState(null);
    const startedAt = performance.now();
    try {
      const response = await fetchIntakeDraft(note, {
        today,
        current_goal: goal,
        current_profile: profile,
      });
      setDraftState({ response, sourceText: note });
      trackProductEvent("intake_lifecycle", {
        action: "reviewed",
        outcome: response.draft.status === "ready" ? "success" : "invalid",
        status: response.draft.status,
        source: response.source,
        fallback_used: response.fallback_used,
        latency_ms: performance.now() - startedAt,
        timed_out: false,
        change_count: countChanges(response.draft),
        warning_count: response.warnings.length + response.draft.warnings.length,
      });
    } catch (cause) {
      const timedOut = cause instanceof DOMException && cause.name === "AbortError";
      trackProductEvent("intake_lifecycle", {
        action: "reviewed",
        outcome: "failed",
        latency_ms: performance.now() - startedAt,
        timed_out: timedOut,
      });
      setError(
        timedOut
          ? "Parsing timed out safely. No changes were made."
          : "Kinetic could not parse this note right now. No changes were made.",
      );
    } finally {
      setLoading(false);
    }
  }

  function confirmDraft() {
    if (!draftState || !validation?.valid) return;
    try {
      const state = buildConfirmedIntakeState({
        draft: draftState.response.draft,
        sourceText: draftState.sourceText,
        today,
        currentGoal: goal,
        currentProfile: profile,
        currentPlan: savedPlan,
      });
      persistConfirmedIntake(state);
      onApplied(state);
      trackProductEvent("intake_lifecycle", {
        action: "confirmed",
        outcome: "success",
        status: draftState.response.draft.status,
        source: draftState.response.source,
        fallback_used: draftState.response.fallback_used,
        change_count: state.appliedCount,
        warning_count: draftState.response.warnings.length,
      });
      setApplied(
        `${state.appliedCount} confirmed change${
          state.appliedCount === 1 ? "" : "s"
        } applied through Kinetic's deterministic planner.`,
      );
      setDraftState(null);
      setText("");
    } catch (cause) {
      trackProductEvent("intake_lifecycle", {
        action: "confirmed",
        outcome: "invalid",
        status: draftState.response.draft.status,
        source: draftState.response.source,
        fallback_used: draftState.response.fallback_used,
        change_count: countChanges(draftState.response.draft),
        warning_count: validation?.errors.length ?? 0,
      });
      setError(
        cause instanceof Error
          ? cause.message
          : "The draft failed final validation. No changes were made.",
      );
    }
  }

  return (
    <GlassCard className="mb-8 p-6 sm:p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-700 dark:text-blue-300">
            Bounded intake
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">
            Tell Kinetic what changed
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
            Describe a goal, training-day, availability, or experience change.
            Kinetic creates a grounded draft for you to review first.
          </p>
        </div>
        <span className="self-start rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/35 dark:text-blue-200">
          Confirm before apply
        </span>
      </div>

      <label className="mt-6 block text-sm font-medium">
        What changed?
        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setApplied(null);
          }}
          rows={3}
          maxLength={1000}
          placeholder="I’m traveling Wednesday through Friday, have 30 minutes Wednesday, and prefer to run Monday, Thursday, and Saturday."
          className="mt-1.5 w-full resize-y rounded-xl border border-black/10 bg-white px-3 py-3 text-sm leading-relaxed outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-neutral-950 dark:focus:border-blue-600 dark:focus:ring-blue-950"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={parseNote}
          disabled={loading || !text.trim()}
          className={`min-h-11 rounded-xl px-5 text-sm font-semibold disabled:opacity-50 ${tokens.primary.solid}`}
        >
          {loading ? "Building draft…" : "Review draft"}
        </button>
        <p className="text-xs text-neutral-500">
          Parsing never writes to your plan.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/25 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}
      {applied ? (
        <p
          role="status"
          className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-200"
        >
          {applied}
        </p>
      ) : null}

      {draftState ? (
        <DraftReview
          response={draftState.response}
          validationErrors={validation?.errors ?? []}
          onConfirm={confirmDraft}
          onDiscard={() => {
            trackProductEvent("intake_lifecycle", {
              action: "discarded",
              outcome: "success",
              status: draftState.response.draft.status,
              source: draftState.response.source,
              fallback_used: draftState.response.fallback_used,
              change_count: countChanges(draftState.response.draft),
              warning_count: draftState.response.warnings.length,
            });
            setDraftState(null);
          }}
        />
      ) : null}
    </GlassCard>
  );
}

function DraftReview({
  response,
  validationErrors,
  onConfirm,
  onDiscard,
}: {
  response: IntakeParseResponse;
  validationErrors: string[];
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  const draft = response.draft;
  const changes = describeChanges(draft);
  return (
    <section className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/55 p-5 dark:border-blue-900/40 dark:bg-blue-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Reviewable draft</h3>
        <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
          {response.fallback_used
            ? "Deterministic parser"
            : "Local AI · deterministically validated"}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed">{draft.summary}</p>

      {changes.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {changes.map((change) => {
            const evidence = draft.grounding.find(
              (item) => item.change_id === change.id,
            )?.evidence;
            return (
              <li
                key={change.id}
                className="rounded-xl bg-white/75 px-3 py-3 text-sm dark:bg-white/5"
              >
                <span className="font-medium">{change.label}</span>
                <span className="mt-0.5 block text-neutral-600 dark:text-neutral-300">
                  {change.value}
                </span>
                {evidence ? (
                  <span className="mt-1.5 block text-xs text-neutral-500">
                    Grounded in “{evidence}”
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {[...new Set([...response.warnings, ...validationErrors])].map(
        (warning) => (
          <p
            key={warning}
            className="mt-3 text-xs font-medium leading-relaxed text-amber-700 dark:text-amber-300"
          >
            {warning}
          </p>
        ),
      )}

      <p className="mt-4 text-xs leading-relaxed text-neutral-500">
        The draft is untrusted until this screen validates it again. Confirming
        runs the existing deterministic planner and availability guardrails.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={validationErrors.length > 0 || changes.length === 0}
          className={`min-h-11 rounded-xl px-5 text-sm font-semibold disabled:opacity-50 ${tokens.primary.solid}`}
        >
          Confirm changes
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="min-h-11 rounded-xl border border-black/10 bg-white px-5 text-sm font-semibold dark:border-white/10 dark:bg-neutral-950"
        >
          Discard draft
        </button>
      </div>
    </section>
  );
}

function describeChanges(draft: IntakeDraft) {
  return [
    ...draft.goal_changes.map((change) => ({
      id: change.id,
      label: goalLabel(change.field),
      value: String(change.value),
    })),
    ...draft.schedule_changes.map((change) => ({
      id: change.id,
      label: "Preferred training days",
      value: change.value.map(titleDay).join(", "),
    })),
    ...draft.availability_changes.map((change) => ({
      id: change.id,
      label: `${titleDay(change.day)} availability`,
      value: [
        change.available_minutes === null
          ? null
          : `${change.available_minutes} minutes`,
        change.easy_only ? "easy effort only" : null,
      ]
        .filter(Boolean)
        .join(" · "),
    })),
    ...draft.preference_changes.map((change) => ({
      id: change.id,
      label: "Experience level",
      value: change.value[0].toUpperCase() + change.value.slice(1),
    })),
    ...draft.workout_swap_changes.map((change) => ({
      id: change.id,
      label: "Workout swap",
      value: `${titleDay(change.from_day)} to ${titleDay(change.to_day)}`,
    })),
  ];
}

function countChanges(draft: IntakeDraft) {
  return (
    draft.goal_changes.length +
    draft.schedule_changes.length +
    draft.availability_changes.length +
    draft.preference_changes.length +
    draft.workout_swap_changes.length
  );
}

function goalLabel(field: IntakeDraft["goal_changes"][number]["field"]) {
  if (field === "race_distance") return "Race distance";
  if (field === "target_date") return "Target date";
  return "Weekly mileage";
}

function titleDay(day: string) {
  const names: Record<string, string> = {
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday",
  };
  return names[day] ?? day;
}

function localISODate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}
