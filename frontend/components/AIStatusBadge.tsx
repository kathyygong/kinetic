"use client";

import { useEffect, useState } from "react";

import { fetchAIStatus, type AIStatusResponse } from "@/lib/api";
import { trackProductEvent } from "@/lib/instrumentation";

type AIStatusBadgeProps = {
  className?: string;
};

const LABELS: Record<AIStatusResponse["mode"], string> = {
  fallback: "AI fallback",
  local_ollama: "Local Ollama",
  disabled: "AI disabled",
};

export default function AIStatusBadge({ className = "" }: AIStatusBadgeProps) {
  const [status, setStatus] = useState<AIStatusResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const startedAt = performance.now();
    fetchAIStatus()
      .then((res) => {
        if (!cancelled) {
          setStatus(res);
          trackProductEvent("ai_status_checked", {
            outcome: "success",
            mode: res.mode,
            source: res.source,
            fallback_used: res.fallback_used,
            live_model_enabled: res.live_model_enabled,
            timeout_seconds: res.timeout_seconds,
            latency_ms: Math.round(performance.now() - startedAt),
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          trackProductEvent("ai_status_checked", {
            outcome: "failed",
            mode: "disabled",
            fallback_used: true,
            live_model_enabled: false,
            latency_ms: Math.round(performance.now() - startedAt),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mode = status?.mode ?? (failed ? "disabled" : "fallback");
  const label = failed ? "AI status unknown" : LABELS[mode];
  const detail = failed
    ? "Could not reach /ai/status; deterministic UI copy remains available."
    : status?.intake_model
      ? `${status.message} Intake: ${status.intake_model}.`
      : status?.message ?? "Checking AI runtime mode.";
  const dot =
    mode === "local_ollama" && status?.live_model_enabled
      ? "bg-emerald-500"
      : mode === "disabled" || failed
        ? "bg-neutral-400"
        : "bg-amber-500";

  return (
    <span
      title={detail}
      className={`inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/70 dark:text-neutral-200 ${className}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
      {status?.mode === "local_ollama" && status.model ? (
        <span className="hidden max-w-32 truncate text-neutral-400 sm:inline">
          {status.model}
        </span>
      ) : null}
    </span>
  );
}
