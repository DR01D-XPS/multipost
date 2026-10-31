"use client";

import clsx from "clsx";

type UiTimeInputProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function formatByDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);

  if (digits.length <= 2) {
    return digits;
  }

  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
}

function normalizeTime(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  let hours = 0;
  let minutes = 0;

  if (digits.length <= 2) {
    hours = Number(digits);
    minutes = 0;
  } else if (digits.length === 3) {
    hours = Number(digits.slice(0, 1));
    minutes = Number(digits.slice(1, 3));
  } else {
    hours = Number(digits.slice(0, 2));
    minutes = Number(digits.slice(2, 4));
  }

  const safeHours = clamp(hours, 0, 23);
  const safeMinutes = clamp(minutes, 0, 59);
  return `${pad2(safeHours)}:${pad2(safeMinutes)}`;
}

export function UiTimeInput({
  value,
  onChange,
  disabled = false,
  placeholder = "чч:мм",
  className
}: UiTimeInputProps) {
  return (
    <div className={clsx("relative", className)}>
      <input
        value={formatByDigits(value)}
        onChange={(event) => {
          const masked = formatByDigits(event.target.value);
          const digits = masked.replace(/\D/g, "");
          const normalized = normalizeTime(masked);

          if (!masked) {
            onChange("");
            return;
          }

          if (digits.length >= 4) {
            onChange(normalized ?? "");
            return;
          }

          onChange(masked);
        }}
        onBlur={(event) => {
          const normalized = normalizeTime(event.target.value);
          onChange(normalized ?? "");
        }}
        placeholder={placeholder}
        inputMode="numeric"
        disabled={disabled}
        className={clsx(
          "w-full rounded-2xl border border-line bg-input px-4 py-3 pr-11",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all duration-300 ease-out",
          "hover:border-accent/45 hover:bg-surfaceSoft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
          disabled && "cursor-not-allowed bg-field text-ink/55 hover:border-line hover:bg-field"
        )}
      />

      <span className="pointer-events-none absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center text-ink/55">
        <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
          <circle cx="10" cy="10" r="6.7" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 6.4v4.1l2.9 1.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
    </div>
  );
}
