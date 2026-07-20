"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  ClipboardList,
  Filter,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";

import GlassCard from "@/components/GlassCard";
import PageContainer from "@/components/PageContainer";
import {
  clearProductEvents,
  listProductEvents,
  trackProductEvent,
  type ProductEvent,
} from "@/lib/instrumentation";
import {
  selectMobileAuditEvents,
  summarizeMobileAuditEvents,
  type MobileEventName,
} from "@/lib/mobileAudit";
import { readCombinedMobileAuditEvents } from "@/lib/mobileAuditRemote";

type EventFilter = "all" | MobileEventName;

const FILTERS: Array<{ value: EventFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "mobile_companion_sync_completed", label: "Sync" },
  { value: "mobile_decision_validated", label: "Decision" },
  { value: "mobile_intake_lifecycle", label: "Intake" },
  { value: "mobile_checkin_synced", label: "Check-in" },
];

export default function MobileQaPage() {
  const [events, setEvents] = useState<ProductEvent[]>([]);
  const [filter, setFilter] = useState<EventFilter>("all");
  const [readback, setReadback] = useState<"loading" | "ready">("loading");

  const refresh = useCallback(async () => {
    setReadback("loading");
    setEvents(
      await readCombinedMobileAuditEvents(
        selectMobileAuditEvents(listProductEvents()),
      ),
    );
    setReadback("ready");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredEvents = useMemo(() => {
    if (filter === "all") return events;
    return events.filter((event) => event.name === filter);
  }, [events, filter]);

  const summary = useMemo(() => {
    return summarizeMobileAuditEvents(selectMobileAuditEvents(events));
  }, [events]);

  const seedSampleEvents = () => {
    trackProductEvent("mobile_companion_sync_completed", {
      platform: "ios",
      sync_type: "healthkit_readiness",
      outcome: "partial",
      permission_state: "partial",
      background_delivery: "enabled",
      coverage_bucket: "partial",
      confidence_bucket: "moderate",
      conflict: "none",
      latency_ms: 420,
    });
    trackProductEvent("mobile_decision_validated", {
      platform: "ios",
      outcome: "success",
      decision_source: "live",
      failure_state: "none",
      cache_state: "fresh",
      availability_source: "calendar",
      selected_action: "modify",
      confidence_bucket: "moderate",
      calendar_state: "conflict",
      readiness_state: "caution",
      deterministic_validation: "passed",
      has_calendar_warning: true,
      has_recovery_warning: false,
      ai_assisted: true,
      latency_ms: 680,
    });
    trackProductEvent("mobile_intake_lifecycle", {
      platform: "ios",
      action: "reviewed",
      outcome: "success",
      route: "review_draft",
      draft_kind: "availability",
      failure_state: "none",
      parser_source: "ollama",
      mutation_state: "review_only",
      status: "ready",
      source: "ollama",
      fallback_used: false,
      latency_ms: 940,
      timed_out: false,
      change_count: 1,
      warning_count: 0,
      deterministic_validation: "not_run",
    });
    trackProductEvent("mobile_checkin_synced", {
      platform: "ios",
      status: "checked_in",
      outcome: "success",
      has_effort: false,
      has_user_reflection: false,
      update_succeeded: true,
      latency_ms: 160,
    });
    void refresh();
  };

  const clearMobileEvents = () => {
    clearProductEvents();
    void refresh();
  };

  return (
    <PageContainer className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 shadow-sm">
            <Smartphone size={14} />
            Mobile QA
          </div>
          <h1 className="text-3xl font-semibold tracking-normal text-neutral-950 dark:text-white">
            iOS audit events
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-neutral-200 bg-white/80 px-4 text-sm font-medium text-neutral-800 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 dark:border-white/10 dark:bg-white/10 dark:text-neutral-100"
          >
            <RefreshCw size={16} />
            {readback === "loading" ? "Reading Firebase…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={seedSampleEvents}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-950"
          >
            <ClipboardList size={16} />
            Sample iOS events
          </button>
          <button
            type="button"
            onClick={clearMobileEvents}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-rose-200 bg-white/80 px-4 text-sm font-medium text-rose-700 shadow-sm transition hover:bg-rose-50 dark:border-rose-400/20 dark:bg-white/10 dark:text-rose-200"
          >
            <Trash2 size={16} />
            Clear browser log
          </button>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-5">
        <SummaryTile
          icon={Activity}
          label="Mobile events"
          value={String(summary.total)}
        />
        <SummaryTile
          icon={CheckCircle2}
          label="Success"
          value={String(summary.outcomes.get("success") ?? 0)}
        />
        <SummaryTile
          icon={ShieldCheck}
          label="Validation pass"
          value={String(
            events.filter(
              (event) => event.properties.deterministic_validation === "passed",
            ).length,
          )}
        />
        <SummaryTile
          icon={ClipboardList}
          label="Intake routes"
          value={String(
            events.filter(
              (event) =>
                event.name === "mobile_intake_lifecycle" &&
                event.properties.route !== undefined,
            ).length,
          )}
        />
        <SummaryTile
          icon={RefreshCw}
          label="Latest"
          value={summary.latest ? formatTime(summary.latest) : "none"}
        />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[18rem_1fr]">
        <GlassCard interactive={false} className="p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-neutral-950 dark:text-neutral-100">
            <Filter size={16} />
            Filter
          </div>
          <div className="space-y-2">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={`flex min-h-11 w-full items-center justify-between rounded-lg border px-3 text-left text-sm transition ${
                  filter === item.value
                    ? "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-400/40 dark:bg-blue-950/40 dark:text-blue-100"
                    : "border-neutral-200 bg-white/70 text-neutral-700 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-neutral-300"
                }`}
              >
                <span>{item.label}</span>
                <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                  {item.value === "all"
                    ? events.length
                    : summary.names.get(item.value) ?? 0}
                </span>
              </button>
            ))}
          </div>
        </GlassCard>

        <div className="space-y-3">
          {filteredEvents.length === 0 ? (
            <GlassCard interactive={false} className="p-8 text-center">
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                No mobile audit events in the browser or signed-in Firebase readback.
              </p>
            </GlassCard>
          ) : (
            filteredEvents
              .slice()
              .reverse()
              .map((event) => <EventRow key={event.id} event={event} />)
          )}
        </div>
      </section>
    </PageContainer>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <GlassCard interactive={false} className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-neutral-950 dark:text-white">
            {value}
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200">
          <Icon size={18} />
        </div>
      </div>
    </GlassCard>
  );
}

function EventRow({ event }: { event: ProductEvent }) {
  const entries = Object.entries(event.properties);
  return (
    <GlassCard interactive={false} className="p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-neutral-950 dark:text-neutral-100">
            {event.name.replaceAll("_", " ")}
          </h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {formatDateTime(event.at)}
          </p>
        </div>
        <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-950/40 dark:text-emerald-100">
          {String(event.properties.outcome ?? event.properties.status ?? "recorded")}
        </span>
      </div>
      <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map(([key, value]) => (
          <div
            key={key}
            className="rounded-lg border border-neutral-200 bg-white/65 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]"
          >
            <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-400">
              {key}
            </dt>
            <dd className="mt-1 break-words text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {String(value)}
            </dd>
          </div>
        ))}
      </dl>
    </GlassCard>
  );
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
