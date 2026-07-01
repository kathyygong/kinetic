"use client";

import { useEffect, useMemo, useState } from "react";

import GlassCard from "@/components/GlassCard";
import {
  fetchTrainingSummary,
  type TrainingSummaryResponse,
} from "@/lib/api";
import { behaviorRepository } from "@/lib/persistence/behaviorRepository";
import {
  buildTrainingSummaryRequest,
  type TrainingSummaryPeriod,
} from "@/lib/trainingSummary";

export default function TrainingSummaryPanel() {
  const [period, setPeriod] = useState<TrainingSummaryPeriod>("weekly");
  const [summary, setSummary] = useState<TrainingSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const input = useMemo(
    () =>
      buildTrainingSummaryRequest(
        period,
        behaviorRepository.listEvents(),
        behaviorRepository.listConfirmedPreferences(),
      ),
    [period],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchTrainingSummary(input)
      .then((response) => {
        if (!cancelled) setSummary(response);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [input]);

  return (
    <GlassCard interactive={false} className="mb-8 p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-blue-600 dark:text-blue-400">
            Training review
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950 dark:text-white">
            {summary?.narrative.headline ?? "Your training, in context"}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-600 dark:text-neutral-300">
            A read-only review of logged outcomes, recovery, and confirmed
            preferences. It never changes your plan.
          </p>
        </div>
        <div
          aria-label="Training review period"
          className="flex rounded-full bg-neutral-100 p-1 dark:bg-white/10"
        >
          {(["weekly", "monthly"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
              className={`min-h-11 rounded-full px-4 text-sm font-medium transition ${
                period === value
                  ? "bg-white text-neutral-950 shadow-sm dark:bg-neutral-800 dark:text-white"
                  : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              }`}
            >
              {value === "weekly" ? "7 days" : "30 days"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-neutral-500" role="status">
          Building your grounded review…
        </p>
      ) : error || !summary ? (
        <p className="mt-6 text-sm text-amber-700 dark:text-amber-300" role="alert">
          The review is temporarily unavailable. Your plan was not changed.
        </p>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Metric
              label="Consistency"
              value={`${summary.metrics.consistency_pct}%`}
              detail={`${summary.metrics.completed_sessions} of ${summary.metrics.logged_sessions} logged`}
            />
            <Metric
              label="Completed volume"
              value={`${summary.metrics.total_miles.toFixed(1)} mi`}
              detail={`${summary.metrics.total_minutes} minutes`}
            />
            <Metric
              label="Recovery trend"
              value={trendLabel(summary.metrics.recovery_trend)}
              detail={
                summary.metrics.average_recovery === null
                  ? "Not enough recovery history"
                  : `${Math.round(summary.metrics.average_recovery * 100)}% average`
              }
            />
          </div>

          <div className="mt-6 grid gap-5 border-t border-black/10 pt-6 dark:border-white/10 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
                What stands out
              </p>
              <p className="mt-2 text-sm leading-6 text-neutral-700 dark:text-neutral-200">
                {summary.narrative.overview} {summary.narrative.highlight}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
                Next focus
              </p>
              <p className="mt-2 text-sm leading-6 text-neutral-700 dark:text-neutral-200">
                {summary.narrative.next_focus}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            <span className="rounded-full border border-black/10 px-3 py-1 dark:border-white/10">
              {summary.fallback_used ? "Deterministic review" : "Local AI · grounded"}
            </span>
            <span>Read-only · raw notes excluded</span>
          </div>

          {summary.warnings.length > 0 ? (
            <ul className="mt-4 space-y-1 text-xs text-amber-700 dark:text-amber-300">
              {summary.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </GlassCard>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl bg-neutral-50 p-4 dark:bg-white/[0.05]">
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950 dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        {detail}
      </p>
    </div>
  );
}

function trendLabel(
  trend: TrainingSummaryResponse["metrics"]["recovery_trend"],
) {
  if (trend === "unknown") return "Building history";
  return trend[0].toUpperCase() + trend.slice(1);
}
