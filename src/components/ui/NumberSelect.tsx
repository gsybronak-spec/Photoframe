"use client";

import { useId, useMemo, useState } from "react";
import { Check, Edit3, X } from "lucide-react";

export const FONT_SIZE_OPTIONS: readonly number[] = [
  8, 9, 10, 10.1, 10.5, 11, 11.5, 12, 12.5, 12.75, 13, 14, 15, 16, 17.5, 18, 20,
  22, 24, 26, 28, 30, 32, 34, 36, 40, 44, 48, 56, 64, 72,
];

export const LINE_HEIGHT_OPTIONS: readonly number[] = [
  0.8, 0.9, 1.0, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 1.5, 1.6, 1.75, 2.0,
];

export const LETTER_SPACING_OPTIONS: readonly number[] = [
  -2, -1.5, -1, -0.5, 0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12,
];

export const SCALE_OPTIONS: readonly number[] = [
  0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2, 1.25, 1.35, 1.5, 1.75, 2.0,
];

export const OPACITY_OPTIONS: readonly number[] = [
  0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0,
];

export const OPACITY_PERCENT_OPTIONS: readonly number[] = [
  0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0,
];

export const POSITION_X_OPTIONS: readonly number[] = [
  0, 10, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100,
];

export const POSITION_Y_OPTIONS: readonly number[] = [
  10, 20, 30, 40, 50, 60, 65, 70, 72, 74, 76, 78, 80, 82, 85, 90,
];

export const WIDTH_PERCENT_OPTIONS: readonly number[] = [
  30, 40, 50, 60, 65, 70, 75, 80, 85, 90, 95, 100,
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
  helperText?: string;
  displayAsPercentage?: boolean;
}

/** Round float to 4 decimal places without loss or NaN. */
export function roundDecimal(n: number, decimals = 4): number {
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

function formatOptionLabel(val: number, unit?: string, displayAsPercentage = false): string {
  const clean = roundDecimal(val, 4);
  if (displayAsPercentage) {
    const pct = roundDecimal(clean * 100, 2);
    return `${pct}%`;
  }
  return unit ? `${clean}${unit}` : String(clean);
}

/**
 * Universal Mobile-First Numerical Control.
 *
 * Core Principles:
 * 1. Default Mode: Fast, touch-friendly `<select>` (minimum 44px target on mobile) with pre-curated presets.
 * 2. Decimal-Preserving: Automatically recognizes any custom decimal (e.g. 10.1, 12.75) and displays it accurately in the dropdown.
 * 3. Dedicated Custom Mode: Selecting "Custom…" (or tapping the edit pencil) opens a dedicated decimal text input with [Apply] and [Cancel].
 * 4. Zero Typing Rejection: Uses `type="text"` with `inputMode="decimal"` so typing "10.", "0.", "-0." is NEVER wiped by browser DOM validation.
 * 5. Instant Local Updates: Calls `onChange` immediately with clean floating-point numbers so live preview updates without delays.
 */
export function NumberSelect({
  label,
  value,
  onChange,
  options,
  min = -9999,
  max = 9999,
  unit,
  allowCustom = true,
  disabled = false,
  className = "",
  size = "md",
  ariaLabel,
  helperText,
  displayAsPercentage = false,
}: NumberSelectProps) {
  const id = useId();
  const safeValue = Number.isFinite(Number(value)) ? roundDecimal(Number(value), 4) : 0;

  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customText, setCustomText] = useState("");
  const [customError, setCustomError] = useState("");

  const openCustomMode = () => {
    setIsCustomMode(true);
    setCustomText(displayAsPercentage ? String(roundDecimal(safeValue * 100, 2)) : String(safeValue));
    setCustomError("");
  };

  // Determine if safeValue exists in the predefined options array
  const isValueInOptions = useMemo(() => {
    return options.some((opt) => Math.abs(opt - safeValue) < 0.0001);
  }, [options, safeValue]);

  // Combined sorted options list that guarantees the current value is always present
  const mergedOptions = useMemo(() => {
    const set = new Set<number>();
    for (const opt of options) {
      if (Number.isFinite(opt)) set.add(roundDecimal(opt, 4));
    }
    if (Number.isFinite(safeValue)) {
      set.add(roundDecimal(safeValue, 4));
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [options, safeValue]);

  const clampAndRound = (val: number): number => {
    const clamped = Math.min(max, Math.max(min, val));
    return roundDecimal(clamped, 4);
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value;
    if (selected === "__CUSTOM_PROMPT__") {
      openCustomMode();
      return;
    }

    const parsed = Number(selected);
    if (!Number.isFinite(parsed)) return;
    const nextVal = clampAndRound(parsed);
    setIsCustomMode(false);
    setCustomError("");
    onChange(nextVal);
  };

  const handleApplyCustom = () => {
    const trimmed = customText.trim();
    if (!trimmed) {
      setCustomError("Enter a number");
      return;
    }

    let parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setCustomError("Invalid number (e.g. 10.1)");
      return;
    }

    // If displayed as percentage (0..1), convert entered "85" to 0.85
    if (displayAsPercentage && max <= 1 && parsed > 1) {
      parsed = parsed / 100;
    }

    const nextVal = clampAndRound(parsed);
    onChange(nextVal);
    setIsCustomMode(false);
    setCustomError("");
  };

  const handleCancelCustom = () => {
    setIsCustomMode(false);
    setCustomText(displayAsPercentage ? String(roundDecimal(safeValue * 100, 2)) : String(safeValue));
    setCustomError("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleApplyCustom();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancelCustom();
    }
  };

  const heightClass = size === "sm" ? "min-h-[38px] text-xs py-1.5" : "min-h-[44px] text-sm py-2.5";
  const selectValueString = isCustomMode ? "__CUSTOM_PROMPT__" : String(safeValue);

  return (
    <div className={`block w-full ${className}`}>
      {label && (
        <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-ink-soft">
          <label htmlFor={id} className="cursor-pointer select-none">
            {label}
          </label>
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-ink-soft/70">
            {unit && <span>{unit}</span>}
            {!isValueInOptions && (
              <span className="rounded-full bg-saffron/15 px-1.5 py-0.2 text-[9px] font-bold text-saffron-deep">
                Custom
              </span>
            )}
          </div>
        </div>
      )}

      {!isCustomMode ? (
        <div className="flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <select
              id={id}
              aria-label={ariaLabel ?? label ?? "Select numeric value"}
              disabled={disabled}
              value={selectValueString}
              onChange={handleSelectChange}
              className={`w-full rounded-2xl border border-amber-900/15 bg-white px-3.5 pr-8 ${heightClass} font-semibold text-ink shadow-sm transition hover:border-coral/50 focus:border-coral focus:ring-2 focus:ring-coral/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {mergedOptions.map((opt) => {
                const isExactCustom = !options.some((o) => Math.abs(o - opt) < 0.0001);
                return (
                  <option key={opt} value={String(opt)}>
                    {formatOptionLabel(opt, unit, displayAsPercentage)}
                    {isExactCustom ? " (Custom)" : ""}
                  </option>
                );
              })}
              {allowCustom && (
                <option value="__CUSTOM_PROMPT__">✏️ Custom decimal…</option>
              )}
            </select>
          </div>

          {allowCustom && (
            <button
              type="button"
              onClick={openCustomMode}
              disabled={disabled}
              title={`Enter custom decimal for ${label ?? "value"}`}
              className={`flex shrink-0 items-center justify-center rounded-2xl border border-amber-900/15 bg-cream/70 px-3 ${heightClass} font-semibold text-ink-soft transition hover:bg-cream hover:text-ink focus:border-coral focus:outline-none disabled:opacity-50`}
              aria-label={`Enter custom decimal for ${label ?? "value"}`}
            >
              <Edit3 className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      ) : (
        /* Dedicated Custom Decimal Input Mode */
        <div className="space-y-1.5 rounded-2xl border border-coral/30 bg-coral/5 p-2">
          <div className="flex items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <input
                id={id}
                type="text"
                inputMode="decimal"
                pattern="[0-9.-]*"
                autoComplete="off"
                autoFocus
                disabled={disabled}
                placeholder={displayAsPercentage ? "e.g. 85" : "e.g. 10.1"}
                value={customText}
                onChange={(e) => {
                  setCustomText(e.target.value);
                  if (customError) setCustomError("");
                }}
                onKeyDown={handleKeyDown}
                aria-label={`Custom decimal for ${label ?? "value"}`}
                className={`w-full rounded-xl border ${
                  customError ? "border-coral bg-white" : "border-coral/40 bg-white"
                } px-3 ${heightClass} font-mono font-bold text-ink shadow-sm focus:border-coral focus:ring-2 focus:ring-coral/20 focus:outline-none disabled:opacity-50`}
              />
              {unit && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs font-semibold text-ink-soft">
                  {displayAsPercentage ? "%" : unit}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleApplyCustom}
              disabled={disabled}
              className={`flex shrink-0 items-center gap-1 rounded-xl bg-gradient-to-r from-saffron to-coral px-3.5 ${heightClass} font-bold text-white shadow-sm transition active:scale-95`}
              title="Apply decimal value"
            >
              <Check className="h-4 w-4" aria-hidden />
              <span>Apply</span>
            </button>

            <button
              type="button"
              onClick={handleCancelCustom}
              disabled={disabled}
              className={`flex shrink-0 items-center justify-center rounded-xl border border-shell bg-white px-2.5 ${heightClass} text-ink-soft transition hover:bg-sand hover:text-ink`}
              title="Cancel"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="flex items-center justify-between px-1 text-[11px]">
            {customError ? (
              <span className="font-semibold text-coral">{customError}</span>
            ) : (
              <span className="text-ink-soft">
                Min: {displayAsPercentage ? `${min * 100}%` : `${min}${unit ?? ""}`} · Max:{" "}
                {displayAsPercentage ? `${max * 100}%` : `${max}${unit ?? ""}`}
              </span>
            )}
            <span className="text-ink-soft/70">Press Enter ↵</span>
          </div>
        </div>
      )}

      {helperText && <p className="mt-1 text-[11px] text-ink-soft">{helperText}</p>}
    </div>
  );
}
