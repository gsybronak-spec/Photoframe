"use client";

import { useId, useMemo, useState } from "react";

export const FONT_SIZE_OPTIONS: readonly number[] = [
  8, 9, 10, 10.1, 10.5, 11, 11.5, 12, 12.5, 12.75, 13, 14, 15, 16, 17.5, 18, 20,
  21.5, 22, 24, 26, 28, 30, 32, 36, 40, 44, 48, 56, 64, 72,
];

export const LINE_HEIGHT_OPTIONS: readonly number[] = [
  0.8, 0.9, 1.0, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 1.5, 1.6, 1.75, 2.0,
];

export const LETTER_SPACING_OPTIONS: readonly number[] = [
  -2, -1.5, -1, -0.5, 0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12,
];

export const SCALE_OPTIONS: readonly number[] = [
  0.5, 0.6, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2, 1.25, 1.35, 1.5, 1.75, 2.0,
];

export const OPACITY_OPTIONS: readonly number[] = [
  0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0,
];

export const PERCENT_OPTIONS: readonly number[] = [
  0, 2.5, 5, 7.5, 10, 10.1, 10.5, 12.5, 12.75, 15, 20, 25, 30, 33.3, 35, 40, 45,
  50, 55, 60, 65, 66.7, 70, 75, 78, 80, 82, 85, 90, 95, 100,
];

export const ROTATION_OPTIONS: readonly number[] = [
  -90, -45, -30, -15, -10, -5, -2.5, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2.5, 5, 10, 15, 30, 45, 90,
];

export const FEATURED_LIMIT_OPTIONS: readonly number[] = [
  1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 16, 20, 24,
];

export interface NumberSelectProps {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  options: readonly number[];
  min?: number;
  max?: number;
  step?: number | "any";
  unit?: string;
  allowCustom?: boolean;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
  ariaLabel?: string;
}

function roundClean(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

function formatOptionLabel(val: number, unit?: string): string {
  const clean = roundClean(val);
  return unit ? `${clean}${unit}` : String(clean);
}

/**
 * Reusable Numerical Select + Custom Decimal Input component.
 *
 * - Provides a fast dropdown `<select>` with common integer & decimal presets
 * - Automatically includes the current `value` in the dropdown even if it is a custom decimal (e.g. 10.1, 12.75)
 * - Includes an optional companion decimal input (`inputMode="decimal"`, `step="any"`) so users can type any exact decimal (`10.1`, `10.5`, `-0.5`, `12.75`) without browser integer-step rejection or rounding while typing.
 */
export function NumberSelect({
  label,
  value,
  onChange,
  options,
  min = -9999,
  max = 9999,
  step = "any",
  unit,
  allowCustom = true,
  disabled = false,
  className = "",
  size = "sm",
  ariaLabel,
}: NumberSelectProps) {
  const id = useId();
  const safeValue = Number.isFinite(Number(value)) ? roundClean(Number(value)) : 0;
  const [rawText, setRawText] = useState<string>(() => String(safeValue));
  const [isEditingText, setIsEditingText] = useState(false);
  const displayedText = isEditingText ? rawText : String(safeValue);

  // Merge the current value into the sorted options array so any custom decimal
  // (e.g. 10.1, 12.75) is always selectable and shown accurately in the dropdown.
  const mergedOptions = useMemo(() => {
    const set = new Set<number>();
    for (const opt of options) {
      if (Number.isFinite(opt)) set.add(roundClean(opt));
    }
    if (Number.isFinite(safeValue)) {
      set.add(roundClean(safeValue));
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [options, safeValue]);

  const clampVal = (v: number): number => {
    const clamped = Math.min(max, Math.max(min, v));
    return roundClean(clamped);
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const parsed = Number(e.target.value);
    if (!Number.isFinite(parsed)) return;
    const next = clampVal(parsed);
    setRawText(String(next));
    onChange(next);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextRaw = e.target.value;
    setRawText(nextRaw);
    const trimmed = nextRaw.trim();
    // Allow intermediate states like "", "-", "10.", "-0." while typing
    if (
      trimmed === "" ||
      trimmed === "-" ||
      trimmed === "." ||
      trimmed === "-." ||
      trimmed.endsWith(".") ||
      (trimmed.includes(".") && trimmed.endsWith("0"))
    ) {
      const tentative = Number(trimmed);
      if (Number.isFinite(tentative) && !trimmed.endsWith(".")) {
        onChange(clampVal(tentative));
      }
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      onChange(clampVal(parsed));
    }
  };

  const commitText = () => {
    setIsEditingText(false);
    const trimmed = rawText.trim();
    const parsed = Number(trimmed);
    if (!trimmed || !Number.isFinite(parsed)) {
      setRawText(String(safeValue));
      return;
    }
    const next = clampVal(parsed);
    setRawText(String(next));
    if (next !== safeValue) {
      onChange(next);
    }
  };

  const padClass = size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm";

  return (
    <div className={`block ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="mb-1 flex items-center justify-between text-[11px] font-semibold text-ink-soft"
        >
          <span>{label}</span>
          {unit && <span className="font-mono text-[10px] text-ink-soft/70">{unit}</span>}
        </label>
      )}
      <div className="flex items-center gap-1.5">
        <select
          id={id}
          aria-label={ariaLabel ?? label ?? "Select value"}
          disabled={disabled}
          value={String(safeValue)}
          onChange={handleSelectChange}
          className={`min-w-0 flex-1 rounded-xl border border-amber-900/15 bg-white ${padClass} font-medium text-ink focus:border-coral focus:outline-none disabled:opacity-50`}
        >
          {mergedOptions.map((opt) => (
            <option key={opt} value={String(opt)}>
              {formatOptionLabel(opt, unit)}
            </option>
          ))}
        </select>

        {allowCustom && (
          <input
            type="number"
            inputMode="decimal"
            step={step}
            min={min}
            max={max}
            disabled={disabled}
            aria-label={`${ariaLabel ?? label ?? "Value"} custom decimal`}
            value={displayedText}
            onFocus={() => {
              setRawText(String(safeValue));
              setIsEditingText(true);
            }}
            onChange={handleTextChange}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            className={`w-20 shrink-0 rounded-xl border border-amber-900/15 bg-cream/60 ${padClass} font-mono font-semibold text-ink focus:border-coral focus:bg-white focus:outline-none disabled:opacity-50`}
          />
        )}
      </div>
    </div>
  );
}
