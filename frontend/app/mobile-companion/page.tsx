"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  CloudOff,
  Dumbbell,
  HeartPulse,
  LockKeyhole,
  MessageSquareText,
  Moon,
  ShieldCheck,
  Sparkles,
  Timer,
  Watch,
} from "lucide-react";

import KineticLogo from "@/components/KineticLogo";
import MetricArc from "@/components/MetricArc";
import PhoneFrame from "@/components/PhoneFrame";
import { trackProductEvent } from "@/lib/instrumentation";

type SyncState = "synced" | "stale" | "denied";
type CalendarState = "clear" | "conflict" | "stale";
type WorkoutStatus = "pending" | "accepted" | "checked_in" | "completed" | "skipped";
type IntakeStatus = "idle" | "drafted" | "applied";

type Scenario = {
  label: string;
  syncPill: string;
  readinessLabel: string;
  confidenceLabel: string;
  confidenceValue: number;
  recoveryValue: number;
  recoveryTone: "emerald" | "amber" | "rose";
  workoutTitle: string;
  workoutMeta: string;
  primaryCopy: string;
  reasoning: string[];
  metrics: Array<{
    label: string;
    value: string;
    state: "good" | "warn" | "muted";
  }>;
  privacy: string;
};

type CalendarContext = {
  label: string;
  pill: string;
  title: string;
  detail: string;
  state: "good" | "warn" | "muted";
};

const SCENARIOS: Record<SyncState, Scenario> = {
  synced: {
    label: "Synced",
    syncPill: "Health synced 8:12 AM",
    readinessLabel: "Ready",
    confidenceLabel: "High confidence",
    confidenceValue: 0.78,
    recoveryValue: 0.84,
    recoveryTone: "emerald",
    workoutTitle: "Tempo intervals",
    workoutMeta: "42 min · 5.1 mi · quality day",
    primaryCopy: "Run the planned session",
    reasoning: [
      "Sleep and HRV are inside your recent baseline.",
      "No stale data warnings are active.",
      "The quality session still fits the block.",
    ],
    metrics: [
      { label: "Sleep", value: "7h 28m", state: "good" },
      { label: "HRV", value: "54 ms", state: "good" },
      { label: "Resting HR", value: "49 bpm", state: "good" },
    ],
    privacy: "Daily summary only. Raw HealthKit samples stay on device.",
  },
  stale: {
    label: "Stale",
    syncPill: "Health last synced yesterday",
    readinessLabel: "Caution",
    confidenceLabel: "Moderate confidence",
    confidenceValue: 0.54,
    recoveryValue: 0.66,
    recoveryTone: "amber",
    workoutTitle: "Short aerobic run",
    workoutMeta: "30 min · easy effort",
    primaryCopy: "Use the scaled option",
    reasoning: [
      "Readiness is more than a day old.",
      "Kinetic reduces certainty instead of guessing.",
      "The aerobic option protects the training rhythm.",
    ],
    metrics: [
      { label: "Sleep", value: "stale", state: "warn" },
      { label: "HRV", value: "stale", state: "warn" },
      { label: "Resting HR", value: "51 bpm", state: "muted" },
    ],
    privacy: "Open the app to refresh HealthKit before trusting harder work.",
  },
  denied: {
    label: "Denied",
    syncPill: "Health permission needed",
    readinessLabel: "Unknown",
    confidenceLabel: "Low confidence",
    confidenceValue: 0.38,
    recoveryValue: 0.5,
    recoveryTone: "rose",
    workoutTitle: "Manual check-in first",
    workoutMeta: "2 min · sleep, fatigue, soreness",
    primaryCopy: "Log readiness",
    reasoning: [
      "Kinetic has no fresh HealthKit signal.",
      "Manual readiness is the safest next input.",
      "The plan will not change until deterministic validation runs.",
    ],
    metrics: [
      { label: "Sleep", value: "not shared", state: "muted" },
      { label: "HRV", value: "not shared", state: "muted" },
      { label: "Resting HR", value: "not shared", state: "muted" },
    ],
    privacy: "Granting access reads summaries locally; raw samples are not uploaded.",
  },
};

const CALENDAR_CONTEXTS: Record<CalendarState, CalendarContext> = {
  clear: {
    label: "Clear",
    pill: "Calendar clear until 11:30 AM",
    title: "Planned slot available",
    detail: "Tempo still fits before the first meeting.",
    state: "good",
  },
  conflict: {
    label: "Conflict",
    pill: "Calendar conflict at 8:45 AM",
    title: "30 min window today",
    detail: "Kinetic should scale the session before it asks for effort.",
    state: "warn",
  },
  stale: {
    label: "Stale",
    pill: "Calendar not refreshed",
    title: "Schedule confidence low",
    detail: "Review the schedule before accepting a harder workout.",
    state: "muted",
  },
};

const STATUS_COPY: Record<WorkoutStatus, string> = {
  pending: "No action saved yet",
  accepted: "Workout accepted for today",
  checked_in: "Manual readiness captured for today",
  completed: "Completed and ready for review",
  skipped: "Skipped without changing the plan",
};

const INTAKE_COPY: Record<IntakeStatus, string> = {
  idle: "No schedule update drafted",
  drafted: "AI parsed a review-only schedule draft",
  applied: "Draft applied after deterministic validation",
};

export default function MobileCompanionPrototype() {
  const [syncState, setSyncState] = useState<SyncState>("synced");
  const [calendarState, setCalendarState] = useState<CalendarState>("clear");
  const [status, setStatus] = useState<WorkoutStatus>("pending");
  const [intakeStatus, setIntakeStatus] = useState<IntakeStatus>("idle");
  const [notificationOn, setNotificationOn] = useState(false);
  const scenario = SCENARIOS[syncState];
  const calendar = CALENDAR_CONTEXTS[calendarState];

  const decision = useMemo(() => {
    if (calendarState === "conflict") {
      return {
        title: syncState === "denied" ? "Manual check-in first" : "Scale to 30 min easy",
        meta: syncState === "denied" ? "2 min · then adapt safely" : "30 min · aerobic · preserves load cap",
        primary: syncState === "denied" ? "Log readiness" : "Apply safe adjustment",
        reasons: [
          "Calendar leaves only a 30 min training window.",
          "The deterministic engine keeps weekly load inside bounds.",
          ...scenario.reasoning,
        ],
      };
    }

    if (calendarState === "stale") {
      return {
        title: syncState === "denied" ? "Manual check-in first" : "Confirm schedule first",
        meta: syncState === "denied" ? "2 min · readiness fallback" : "Calendar stale · no unsafe mutation",
        primary: syncState === "denied" ? "Log readiness" : "Review schedule",
        reasons: [
          "Calendar freshness is low, so Kinetic does not invent availability.",
          "The current plan stays unchanged until the schedule is confirmed.",
          ...scenario.reasoning,
        ],
      };
    }

    return {
      title: scenario.workoutTitle,
      meta: scenario.workoutMeta,
      primary: scenario.primaryCopy,
      reasons: scenario.reasoning,
    };
  }, [calendarState, scenario, syncState]);

  const statusTone = useMemo(() => {
    if (status === "completed") return "text-emerald-700 bg-emerald-50 border-emerald-200";
    if (status === "skipped") return "text-amber-800 bg-amber-50 border-amber-200";
    if (status === "accepted" || status === "checked_in") {
      return "text-blue-800 bg-blue-50 border-blue-200";
    }
    return "text-neutral-600 bg-white/70 border-neutral-200";
  }, [status]);

  const auditDecision = () => {
    trackProductEvent("mobile_decision_validated", {
      platform: "ios",
      outcome: "success",
      selected_action: selectedActionFor(syncState, calendarState),
      confidence_bucket: confidenceBucketFor(syncState),
      calendar_state: calendarState,
      readiness_state: readinessStateFor(syncState),
      deterministic_validation:
        syncState === "denied" || calendarState === "stale" ? "not_run" : "passed",
      has_calendar_warning: calendarState !== "clear",
      has_recovery_warning: syncState !== "synced",
      ai_assisted: intakeStatus !== "idle",
      latency_ms: 180,
    });
  };

  const handleSyncStateChange = (state: SyncState) => {
    setSyncState(state);
    setStatus("pending");
    trackProductEvent("mobile_companion_sync_completed", {
      platform: "ios",
      sync_type: "healthkit_readiness",
      outcome:
        state === "synced" ? "success" : state === "stale" ? "stale" : "failed",
      permission_state: state === "denied" ? "denied" : "granted",
      background_delivery: state === "stale" ? "stale" : "enabled",
      coverage_bucket: state === "synced" ? "complete" : state === "stale" ? "partial" : "none",
      confidence_bucket: confidenceBucketFor(state),
      conflict: "none",
      latency_ms: 140,
    });
  };

  const handleCalendarStateChange = (state: CalendarState) => {
    setCalendarState(state);
    setStatus("pending");
    trackProductEvent("mobile_companion_sync_completed", {
      platform: "ios",
      sync_type: "calendar_context",
      outcome: state === "stale" ? "stale" : "success",
      coverage_bucket: state === "clear" ? "complete" : "partial",
      confidence_bucket: state === "stale" ? "low" : "moderate",
      conflict: "none",
      latency_ms: 120,
    });
  };

  const handlePreviewIntake = () => {
    setIntakeStatus("drafted");
    trackProductEvent("mobile_intake_lifecycle", {
      platform: "ios",
      action: "reviewed",
      outcome: "success",
      status: "ready",
      source: "ollama",
      fallback_used: false,
      latency_ms: 900,
      timed_out: false,
      change_count: 1,
      warning_count: 0,
      deterministic_validation: "not_run",
    });
  };

  const handleValidateIntake = () => {
    setIntakeStatus("applied");
    trackProductEvent("mobile_intake_lifecycle", {
      platform: "ios",
      action: "confirmed",
      outcome: "success",
      status: "ready",
      source: "ollama",
      fallback_used: false,
      latency_ms: 460,
      timed_out: false,
      change_count: 1,
      warning_count: 0,
      deterministic_validation: "passed",
    });
  };

  const handleAccept = () => {
    setStatus("accepted");
    auditDecision();
  };

  const handleCheckIn = () => {
    setStatus("checked_in");
    trackProductEvent("mobile_checkin_synced", {
      platform: "ios",
      status: "checked_in",
      outcome: "success",
      has_effort: false,
      has_user_reflection: false,
      update_succeeded: true,
      latency_ms: 160,
    });
  };

  const handleComplete = () => {
    setStatus("completed");
    trackProductEvent("mobile_checkin_synced", {
      platform: "ios",
      status: "completed",
      outcome: "success",
      has_effort: true,
      has_user_reflection: false,
      update_succeeded: true,
      latency_ms: 190,
    });
  };

  const handleSkip = () => {
    setStatus("skipped");
    trackProductEvent("mobile_checkin_synced", {
      platform: "ios",
      status: "skipped",
      outcome: "success",
      has_effort: false,
      has_user_reflection: false,
      update_succeeded: true,
      latency_ms: 170,
    });
  };

  return (
    <main
      data-testid="mobile-companion-root"
      className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_32%),linear-gradient(135deg,#f8fafc,#eef6ff_46%,#f8fafc)] text-neutral-950"
    >
      <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(18rem,0.85fr)_minmax(24rem,1.15fr)] lg:items-center lg:py-10">
        <section className="order-2 lg:order-1">
          <div className="mb-8 flex items-center gap-3">
            <KineticLogo size={34} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                iOS companion prototype
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-normal text-neutral-950">
                Validate Today before building native.
              </h1>
            </div>
          </div>

          <div className="space-y-5">
            <ControlGroup title="HealthKit state">
              {(["synced", "stale", "denied"] as SyncState[]).map((state) => (
                <button
                  key={state}
                  type="button"
                  data-testid={`mobile-health-${state}`}
                  onClick={() => handleSyncStateChange(state)}
                  className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition ${
                    syncState === state
                      ? "border-blue-500 bg-blue-50 text-blue-900 shadow-sm"
                      : "border-white/80 bg-white/70 text-neutral-700 hover:border-blue-200 hover:bg-white"
                  }`}
                >
                  <span className="font-medium">{SCENARIOS[state].label}</span>
                  <span className="text-xs">{SCENARIOS[state].confidenceLabel}</span>
                </button>
              ))}
            </ControlGroup>

            <ControlGroup title="Calendar context">
              {(["clear", "conflict", "stale"] as CalendarState[]).map((state) => (
                <button
                  key={state}
                  type="button"
                  data-testid={`mobile-calendar-${state}`}
                  onClick={() => handleCalendarStateChange(state)}
                  className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition ${
                    calendarState === state
                      ? "border-blue-500 bg-blue-50 text-blue-900 shadow-sm"
                      : "border-white/80 bg-white/70 text-neutral-700 hover:border-blue-200 hover:bg-white"
                  }`}
                >
                  <span className="font-medium">{CALENDAR_CONTEXTS[state].label}</span>
                  <span className="text-xs">{CALENDAR_CONTEXTS[state].title}</span>
                </button>
              ))}
            </ControlGroup>

            <ControlGroup title="AI intake review">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="mobile-intake-preview"
                  onClick={handlePreviewIntake}
                  className="rounded-lg border border-white/80 bg-white/75 px-3 py-3 text-sm font-medium text-neutral-800 transition hover:border-blue-200 hover:bg-blue-50"
                >
                  Preview note
                </button>
                <button
                  type="button"
                  data-testid="mobile-intake-validate"
                  onClick={handleValidateIntake}
                  className="rounded-lg border border-white/80 bg-white/75 px-3 py-3 text-sm font-medium text-neutral-800 transition hover:border-emerald-200 hover:bg-emerald-50"
                >
                  Validate
                </button>
              </div>
            </ControlGroup>

            <div
              data-testid="mobile-intake-status"
              className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900"
            >
              {INTAKE_COPY[intakeStatus]}
            </div>

            <ControlGroup title="Check-in loop">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="mobile-checkin-accept"
                  onClick={handleAccept}
                  className="rounded-lg border border-white/80 bg-white/75 px-3 py-3 text-sm font-medium text-neutral-800 transition hover:border-blue-200 hover:bg-blue-50"
                >
                  Accept
                </button>
                <button
                  type="button"
                  data-testid="mobile-checkin-complete"
                  onClick={handleComplete}
                  className="rounded-lg border border-white/80 bg-white/75 px-3 py-3 text-sm font-medium text-neutral-800 transition hover:border-emerald-200 hover:bg-emerald-50"
                >
                  Complete
                </button>
                <button
                  type="button"
                  data-testid="mobile-checkin-skip"
                  onClick={handleSkip}
                  className="rounded-lg border border-white/80 bg-white/75 px-3 py-3 text-sm font-medium text-neutral-800 transition hover:border-amber-200 hover:bg-amber-50"
                >
                  Skip
                </button>
                <button
                  type="button"
                  data-testid="mobile-checkin-reset"
                  onClick={() => setStatus("pending")}
                  className="rounded-lg border border-white/80 bg-white/75 px-3 py-3 text-sm font-medium text-neutral-800 transition hover:border-neutral-300 hover:bg-white"
                >
                  Reset
                </button>
              </div>
            </ControlGroup>

            <div
              data-testid="mobile-checkin-status"
              className={`rounded-lg border px-4 py-3 text-sm font-medium ${statusTone}`}
            >
              {STATUS_COPY[status]}
            </div>

            <ControlGroup title="Notification candidate">
              <button
                type="button"
                data-testid="mobile-notification-toggle"
                onClick={() => setNotificationOn((value) => !value)}
                className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm transition ${
                  notificationOn
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-white/80 bg-white/70 text-neutral-700 hover:bg-white"
                }`}
              >
                <span className="font-medium">Evening check-in</span>
                <span>{notificationOn ? "Quiet reminder on" : "Off by default"}</span>
              </button>
            </ControlGroup>
          </div>
        </section>

        <section className="order-1 flex justify-center lg:order-2">
          <div className="w-full max-w-[25rem] overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_28px_70px_-42px_rgb(15_23_42/0.62)] sm:hidden">
            <TodayScreen
              scenario={scenario}
              calendar={calendar}
              decision={decision}
              syncState={syncState}
              status={status}
              intakeStatus={intakeStatus}
              notificationOn={notificationOn}
              onAccept={handleAccept}
              onCheckIn={handleCheckIn}
              onComplete={handleComplete}
              onSkip={handleSkip}
            />
          </div>
          <PhoneFrame
            className="hidden w-full max-w-[25rem] sm:block"
            screenMinHeightClass="min-h-[48rem]"
            screenClassName="bg-[linear-gradient(180deg,#f8fbff,#eef6ff_54%,#ffffff)] p-0"
            label="Kinetic iOS companion Today prototype"
          >
            <TodayScreen
              scenario={scenario}
              calendar={calendar}
              decision={decision}
              syncState={syncState}
              status={status}
              intakeStatus={intakeStatus}
              notificationOn={notificationOn}
              onAccept={handleAccept}
              onCheckIn={handleCheckIn}
              onComplete={handleComplete}
              onSkip={handleSkip}
            />
          </PhoneFrame>
        </section>
      </div>
    </main>
  );
}

function TodayScreen({
  scenario,
  calendar,
  decision,
  syncState,
  status,
  intakeStatus,
  notificationOn,
  onAccept,
  onCheckIn,
  onComplete,
  onSkip,
}: {
  scenario: Scenario;
  calendar: CalendarContext;
  decision: {
    title: string;
    meta: string;
    primary: string;
    reasons: string[];
  };
  syncState: SyncState;
  status: WorkoutStatus;
  intakeStatus: IntakeStatus;
  notificationOn: boolean;
  onAccept: () => void;
  onCheckIn: () => void;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const SyncIcon =
    syncState === "synced" ? Watch : syncState === "stale" ? Clock3 : CloudOff;

  return (
    <div className="flex min-h-[46.5rem] flex-col bg-[#f7fbff] px-4 pb-4 pt-5">
      <header className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-neutral-700 shadow-sm"
        >
          <ChevronLeft size={19} />
        </button>
        <div className="flex items-center gap-2 rounded-full bg-white/85 px-3 py-2 text-xs font-semibold text-neutral-700 shadow-sm">
          <KineticLogo size={18} />
          Today
        </div>
        <button
          type="button"
          aria-label="Privacy"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-neutral-700 shadow-sm"
        >
          <LockKeyhole size={17} />
        </button>
      </header>

      <section className="pt-7">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
              Morning check
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-normal text-neutral-950">
              <span data-testid="mobile-readiness-label">{scenario.readinessLabel}</span>
            </h2>
          </div>
          <div className="rounded-full border border-white bg-white/85 px-3 py-2 text-right shadow-sm">
            <p className="text-[11px] font-medium text-neutral-500">Confidence</p>
            <p className="text-sm font-semibold text-neutral-900">
              {Math.round(scenario.confidenceValue * 100)}%
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-center">
          <MetricArc
            value={scenario.recoveryValue}
            size={220}
            stroke={16}
            tone={scenario.recoveryTone}
            delay={0}
          >
            <span className="text-5xl font-semibold tabular-nums text-neutral-950">
              {Math.round(scenario.recoveryValue * 100)}
            </span>
            <span className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
              readiness
            </span>
          </MetricArc>
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-white bg-white/88 p-4 shadow-[0_18px_45px_-30px_rgb(15_23_42/0.48)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Recommendation
            </p>
            <h3 className="mt-2 text-2xl font-semibold tracking-normal text-neutral-950">
              <span data-testid="mobile-decision-title">{decision.title}</span>
            </h3>
            <p data-testid="mobile-decision-meta" className="mt-1 text-sm text-neutral-600">
              {decision.meta}
            </p>
          </div>
          <Dumbbell className="mt-1 text-blue-600" size={24} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {scenario.metrics.map((metric) => (
            <MetricTile key={metric.label} {...metric} />
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-3 text-sm text-blue-950">
          <SyncIcon size={17} className="shrink-0 text-blue-700" />
          <span data-testid="mobile-health-pill" className="font-medium">
            {scenario.syncPill}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-white px-3 py-3 text-sm text-neutral-800">
          <CalendarDays size={17} className="shrink-0 text-blue-700" />
          <span data-testid="mobile-calendar-pill" className="font-medium">
            {calendar.pill}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
          <button
            type="button"
            onClick={syncState === "denied" ? onCheckIn : onAccept}
            data-testid="mobile-primary-action"
            className="rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-neutral-950/12 transition hover:bg-blue-950"
          >
            {decision.primary}
          </button>
          <button
            type="button"
            onClick={onSkip}
            aria-label="Skip"
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-700"
          >
            <Timer size={18} />
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-white bg-white/78 p-4 shadow-[0_18px_45px_-34px_rgb(15_23_42/0.38)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-emerald-600" />
            <h3 className="text-sm font-semibold text-neutral-950">Why this call</h3>
          </div>
          <span className="text-xs font-medium text-neutral-500">
            {scenario.confidenceLabel}
          </span>
        </div>
        <div className="space-y-2">
          {decision.reasons.map((reason) => (
            <div key={reason} className="flex gap-2 text-sm text-neutral-700">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-blue-600" />
              <p>{reason}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-white bg-white/78 p-4 shadow-[0_18px_45px_-34px_rgb(15_23_42/0.38)]">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
            {intakeStatus === "idle" ? <MessageSquareText size={17} /> : <Sparkles size={17} />}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-950">
              {intakeStatus === "idle" ? "Tell Kinetic what changed" : "Review-only AI draft"}
            </h3>
            <p className="mt-1 text-xs leading-5 text-neutral-600">
              {intakeStatus === "idle"
                ? "Example: I only have 30 minutes today."
                : "Parsed as a schedule constraint; deterministic validation must approve before the plan changes."}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onComplete}
          className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
            status === "completed"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : "border-white bg-white/80 text-neutral-800"
          }`}
        >
          Complete
        </button>
        <button
          type="button"
          onClick={onSkip}
          className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
            status === "skipped"
              ? "border-amber-300 bg-amber-50 text-amber-800"
              : "border-white bg-white/80 text-neutral-800"
          }`}
        >
          Skip
        </button>
      </section>

      <section className="mt-auto pt-4">
        <div className="rounded-2xl border border-white bg-white/76 p-4">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              {notificationOn ? <Bell size={17} /> : <Moon size={17} />}
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-950">
                {notificationOn ? "Quiet check-in enabled" : "No nudges by default"}
              </p>
              <p className="mt-1 text-xs leading-5 text-neutral-600">
                {scenario.privacy} Web QA can audit mobile-originated decisions.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricTile({
  label,
  value,
  state,
}: {
  label: string;
  value: string;
  state: "good" | "warn" | "muted";
}) {
  const tone =
    state === "good"
      ? "bg-emerald-50 text-emerald-800"
      : state === "warn"
        ? "bg-amber-50 text-amber-800"
        : "bg-neutral-100 text-neutral-600";
  const Icon = label === "Sleep" ? Moon : label === "HRV" ? Activity : HeartPulse;

  return (
    <div className={`min-h-[5.25rem] rounded-xl px-3 py-3 ${tone}`}>
      <Icon size={16} />
      <p className="mt-2 text-[11px] font-medium leading-none opacity-75">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold leading-tight">{value}</p>
    </div>
  );
}

function ControlGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function confidenceBucketFor(state: SyncState): "low" | "moderate" | "high" {
  if (state === "synced") return "high";
  if (state === "stale") return "moderate";
  return "low";
}

function readinessStateFor(
  state: SyncState,
): "ready" | "caution" | "unknown" | "stale" {
  if (state === "synced") return "ready";
  if (state === "stale") return "stale";
  return "unknown";
}

function selectedActionFor(
  syncState: SyncState,
  calendarState: CalendarState,
): "proceed" | "modify" | "rest" | "unknown" {
  if (syncState === "denied") return "unknown";
  if (calendarState !== "clear" || syncState === "stale") return "modify";
  return "proceed";
}
