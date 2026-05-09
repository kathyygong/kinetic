"use client";

/**
 * HMS picker — three sub-inputs (hours / minutes / seconds) wrapped in
 * one bordered field. Reads and writes a single integer-second value,
 * so callers don't have to think about decomposition.
 *
 * Used by:
 *   - Settings page (entering PRs as part of the goal)
 *   - Profile editor (entering PRs on the user profile)
 */

type HMSInputProps = {
  /** Stable ID prefix; sub-inputs become `${id}_h`, `${id}_m`, `${id}_s`. */
  id: string;
  /** Current value in integer seconds, or undefined when empty. */
  valueSec: number | undefined;
  /** Placeholder shown when empty, in seconds. Decomposed into h/m/s. */
  placeholderSec: number;
  /** Called with the recomposed value, or `undefined` when fully cleared. */
  onChange: (sec: number | undefined) => void;
};

export default function HMSInput({
  id,
  valueSec,
  placeholderSec,
  onChange,
}: HMSInputProps) {
  // Decompose the current value (or empty if undefined / non-finite).
  const totalSec =
    typeof valueSec === "number" && Number.isFinite(valueSec) && valueSec > 0
      ? Math.round(valueSec)
      : null;
  const h = totalSec === null ? "" : String(Math.floor(totalSec / 3600));
  const m = totalSec === null ? "" : String(Math.floor((totalSec % 3600) / 60));
  const s = totalSec === null ? "" : String(totalSec % 60);

  // Decompose the placeholder so each sub-input shows a sensible hint.
  const ph = Math.floor(placeholderSec / 3600);
  const pm = Math.floor((placeholderSec % 3600) / 60);
  const ps = placeholderSec % 60;

  function update(part: "h" | "m" | "s", raw: string) {
    const nextH = part === "h" ? raw : h;
    const nextM = part === "m" ? raw : m;
    const nextS = part === "s" ? raw : s;

    if (nextH === "" && nextM === "" && nextS === "") {
      onChange(undefined);
      return;
    }

    const hN = Number(nextH || 0);
    const mN = Number(nextM || 0);
    const sN = Number(nextS || 0);
    if (![hN, mN, sN].every(Number.isFinite)) return;

    const total = Math.max(0, Math.floor(hN * 3600 + mN * 60 + sN));
    onChange(total > 0 ? total : undefined);
  }

  return (
    <div
      className={`${HMS_FIELD_CLASS} flex items-center justify-between gap-1 px-2 py-1.5`}
    >
      <HMSSubInput
        id={`${id}_h`}
        ariaLabel="hours"
        value={h}
        placeholder={ph > 0 ? String(ph) : ""}
        max={9}
        onChange={(v) => update("h", v)}
      />
      <span className="text-neutral-400 dark:text-neutral-500">:</span>
      <HMSSubInput
        id={`${id}_m`}
        ariaLabel="minutes"
        value={m}
        placeholder={String(pm).padStart(2, "0")}
        max={59}
        onChange={(v) => update("m", v)}
      />
      <span className="text-neutral-400 dark:text-neutral-500">:</span>
      <HMSSubInput
        id={`${id}_s`}
        ariaLabel="seconds"
        value={s}
        placeholder={String(ps).padStart(2, "0")}
        max={59}
        onChange={(v) => update("s", v)}
      />
    </div>
  );
}

function HMSSubInput({
  id,
  ariaLabel,
  value,
  placeholder,
  max,
  onChange,
}: {
  id: string;
  ariaLabel: string;
  value: string;
  placeholder: string;
  max: number;
  onChange: (v: string) => void;
}) {
  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      min={0}
      max={max}
      step={1}
      aria-label={ariaLabel}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-w-0 flex-1 bg-transparent text-center text-sm tabular-nums text-neutral-900 outline-none placeholder:italic placeholder:text-neutral-400 dark:text-neutral-100 dark:placeholder:text-neutral-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}

// Same visual treatment as the regular text inputs on the settings/profile
// forms so the HMS field reads as a single sibling.
const HMS_FIELD_CLASS =
  "w-full rounded-lg border border-black/10 bg-white text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 hover:border-black/20 focus-within:border-blue-500/60 focus-within:ring-2 focus-within:ring-blue-500/20 dark:border-white/10 dark:bg-neutral-950/60 dark:text-neutral-100 dark:hover:border-white/20 dark:focus-within:border-blue-400/60 dark:focus-within:ring-blue-400/20";
