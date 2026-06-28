"use client";

import { useMemo, useState } from "react";

import GlassCard from "@/components/GlassCard";
import { fetchWhatIfExplanation, type WhatIfResponse } from "@/lib/api";
import type { DayLabel } from "@/lib/planAdjuster";
import type { PlanWeek } from "@/lib/planGenerator";
import { tokens } from "@/lib/tokens";
import {
  buildLocalWhatIfExplanation,
  buildWhatIfSimulation,
  type WhatIfExplanation,
} from "@/lib/whatIf";

const DAYS: DayLabel[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type PreviewState = {
  explanation: WhatIfExplanation;
  source: string;
  warnings: string[];
};

export default function WhatIfPanel({ week }: { week: PlanWeek }) {
  const [day, setDay] = useState<DayLabel>("Wed");
  const [minutes, setMinutes] = useState(30);
  const [easyOnly, setEasyOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const simulation = useMemo(
    () => buildWhatIfSimulation(week, day, minutes, easyOnly),
    [day, easyOnly, minutes, week],
  );

  async function simulate() {
    setLoading(true);
    const local = buildLocalWhatIfExplanation(simulation);
    try {
      const response: WhatIfResponse =
        await fetchWhatIfExplanation(simulation);
      setPreview({
        explanation: response.explanation,
        source: response.fallback_used
          ? "Deterministic fallback"
          : "Local AI explanation",
        warnings: response.warnings,
      });
    } catch {
      setPreview({
        explanation: local,
        source: "Local deterministic preview",
        warnings: [
          "The explanation service was unavailable. The saved plan is unchanged.",
        ],
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <GlassCard className="mb-8 p-6 sm:p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-700 dark:text-blue-300">
            Read-only scenario
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">
            What if my week changes?
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
            Preview a constrained day. Nothing is applied to your plan.
          </p>
        </div>
        <span className="self-start rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/35 dark:text-blue-200">
          Deterministic first
        </span>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-sm font-medium">
          Day
          <select
            value={day}
            onChange={(event) => setDay(event.target.value as DayLabel)}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm dark:border-white/10 dark:bg-neutral-950"
          >
            {DAYS.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Minutes available
          <input
            type="number"
            min={0}
            max={240}
            value={minutes}
            onChange={(event) => setMinutes(Number(event.target.value))}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm tabular-nums dark:border-white/10 dark:bg-neutral-950"
          />
        </label>
        <button
          type="button"
          onClick={simulate}
          disabled={loading}
          className={`min-h-11 rounded-xl px-5 text-sm font-semibold disabled:opacity-50 ${tokens.primary.solid}`}
        >
          {loading ? "Simulating…" : "Preview"}
        </button>
      </div>

      <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-sm text-neutral-600 dark:text-neutral-300">
        <input
          type="checkbox"
          checked={easyOnly}
          onChange={(event) => setEasyOnly(event.target.checked)}
          className="h-4 w-4 rounded border-black/20 accent-blue-600"
        />
        Treat this as an easy-only travel/recovery day
      </label>

      {preview ? (
        <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/55 p-5 dark:border-blue-900/40 dark:bg-blue-950/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Preview result</h3>
            <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
              {preview.source}
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed">
            {preview.explanation.summary}
          </p>
          <ul className="mt-4 space-y-2">
            {preview.explanation.changes.map((change) => (
              <li
                key={`${change.title}-${change.explanation}`}
                className="rounded-xl bg-white/70 px-3 py-2.5 text-sm dark:bg-white/5"
              >
                <span className="font-medium">{change.title}</span>
                <span className="mt-0.5 block text-neutral-600 dark:text-neutral-300">
                  {change.explanation}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            {preview.explanation.tradeoff}
          </p>
          {preview.warnings.map((warning) => (
            <p
              key={warning}
              className="mt-2 text-xs font-medium text-blue-700 dark:text-blue-300"
            >
              {warning}
            </p>
          ))}
        </div>
      ) : null}
    </GlassCard>
  );
}
