"use client";

import AthleticImage from "@/components/AthleticImage";
import PhoneFrame from "@/components/PhoneFrame";

type KineticPreviewStackProps = {
  className?: string;
  priority?: boolean;
};

/**
 * Photo-backed app preview inspired by the supplied fitness mockup.
 *
 * The athletic image stays the grounding layer; the phone frames stage
 * Kinetic's actual product concepts above it.
 */
export default function KineticPreviewStack({
  className = "",
  priority = false,
}: KineticPreviewStackProps) {
  return (
    <section
      aria-label="Kinetic training preview"
      className={`relative h-[29rem] overflow-hidden rounded-[2.2rem] sm:h-[31rem] ${className}`}
    >
      <AthleticImage
        src="/images/athletic/runner-sunset.jpg"
        alt="Runner climbing a mountain trail above the clouds"
        className="absolute inset-0 h-full rounded-[2.2rem]"
        priority={priority}
      />

      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.28),transparent_28%),linear-gradient(180deg,rgba(15,23,42,0.08),rgba(15,23,42,0.34)_58%,rgba(15,23,42,0.76))]"
      />

      <div className="absolute left-5 right-5 top-5 z-10 text-left text-white sm:left-7 sm:top-7">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/82">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-sky-200 to-blue-400"
          />
          Adaptive training
        </p>
        <h2 className="mt-2 max-w-md text-balance text-3xl font-semibold leading-[1.05] tracking-tight drop-shadow-sm sm:text-4xl">
          Your plan, recovery, and day in one view.
        </h2>
      </div>

      <div className="absolute inset-x-0 bottom-5 z-20 flex items-end justify-center gap-3 px-4 sm:bottom-7 sm:gap-4">
        <div className="hidden w-36 translate-y-4 sm:block lg:w-40">
          <TrainingSummaryPhone />
        </div>
        <div className="w-[11.75rem] sm:w-44 lg:w-48">
          <WorkoutSchedulePhone />
        </div>
        <div className="hidden w-36 translate-y-5 sm:block lg:w-40">
          <ReadinessPhone />
        </div>
      </div>
    </section>
  );
}

function TrainingSummaryPhone() {
  const bars = [36, 52, 44, 78, 64, 88, 58];

  return (
    <PhoneFrame
      label="Training summary preview"
      screenMinHeightClass="min-h-[18rem]"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-400">
            Training
          </p>
          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-400 to-sky-300" />
        </div>

        <div>
          <p className="text-2xl font-semibold tracking-tight">2,762</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            miles banked this year
          </p>
        </div>

        <div className="flex h-20 items-end gap-1.5 rounded-2xl bg-white/65 p-3 shadow-inner dark:bg-white/8">
          {bars.map((height, index) => (
            <span
              key={index}
              className="w-full rounded-full bg-gradient-to-t from-blue-600 to-sky-300"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/80 p-3 text-blue-950 dark:border-blue-800/40 dark:bg-blue-950/28 dark:text-blue-100">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-60">
            This week
          </p>
          <p className="mt-1 text-sm font-semibold">4 of 5 sessions ready</p>
        </div>
      </div>
    </PhoneFrame>
  );
}

function WorkoutSchedulePhone() {
  return (
    <PhoneFrame
      label="Workout schedule preview"
      screenMinHeightClass="min-h-[20rem]"
    >
      <div className="space-y-4">
        <div className="rounded-[1.25rem] bg-[linear-gradient(135deg,rgba(59,130,246,0.18),rgba(14,165,233,0.10))] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-700 dark:text-blue-300">
            Day 08
          </p>
          <h3 className="mt-2 text-2xl font-semibold leading-[1.02] tracking-tight">
            Today
            <br />
            workout schedule
          </h3>
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            Tempo run, trimmed around your calendar.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <Metric label="Duration" value="40 min" />
          <Metric label="Load" value="Medium" />
          <Metric label="Pace" value="8:15" />
          <Metric label="Ready" value="89%" />
        </div>

        <div className="rounded-2xl border border-white/70 bg-white/70 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">Warm up</span>
            <span className="text-neutral-500">10 min</span>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-neutral-200 dark:bg-white/10">
            <div className="h-full w-2/3 rounded-full bg-blue-500" />
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            Deterministic safety core keeps the session inside bounds.
          </p>
        </div>
      </div>
    </PhoneFrame>
  );
}

function ReadinessPhone() {
  return (
    <PhoneFrame
      label="Readiness preview"
      screenMinHeightClass="min-h-[18rem]"
    >
      <div className="space-y-4">
        <div className="rounded-[1.25rem] bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(37,99,235,0.72))] p-4 text-white">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/65">
            Readiness
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight">95%</p>
          <p className="text-xs text-white/68">active signals fresh</p>
        </div>

        <div className="space-y-2 rounded-2xl border border-white/70 bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.06]">
          <StatusRow label="Sleep" value="7h 40m" tone="bg-emerald-500" />
          <StatusRow label="HRV" value="+8%" tone="bg-blue-500" />
          <StatusRow label="Soreness" value="Mild" tone="bg-amber-500" />
        </div>

        <div className="rounded-full border border-blue-100 bg-blue-50/80 px-3 py-2 text-center text-xs font-semibold text-blue-800 dark:border-blue-800/40 dark:bg-blue-950/28 dark:text-blue-200">
          Proceed with control
        </div>
      </div>
    </PhoneFrame>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.06]">
      <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
        {label}
      </p>
      <p className="mt-1 font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function StatusRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="inline-flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
        <span className={`h-1.5 w-1.5 rounded-full ${tone}`} />
        {label}
      </span>
      <span className="font-semibold text-neutral-950 dark:text-neutral-50">
        {value}
      </span>
    </div>
  );
}
