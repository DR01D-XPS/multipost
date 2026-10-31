"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";

type UiDateInputProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  menuPlacement?: "bottom" | "top";
  className?: string;
};

const weekdayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

function getStartOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isoToDisplay(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "";
  }

  const [yearText, monthText, dayText] = value.split("-");
  return `${dayText}.${monthText}.${yearText}`;
}

function digitsToMaskedDate(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);

  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  }

  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4, 8)}`;
}

function displayToIso(display: string): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(display);
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  if (year < 1900 || year > 2100) {
    return null;
  }

  if (month < 1 || month > 12) {
    return null;
  }

  if (day < 1 || day > 31) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  const isValid = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  if (!isValid) {
    return null;
  }

  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function isoToDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

function buildMonthGrid(monthCursor: Date): Date[] {
  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const startDate = new Date(year, month, 1 - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const cell = new Date(startDate);
    cell.setDate(startDate.getDate() + index);
    return cell;
  });
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function UiDateInput({
  value,
  onChange,
  disabled = false,
  placeholder = "дд.мм.гггг",
  menuPlacement = "bottom",
  className
}: UiDateInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState(isoToDisplay(value));
  const [monthCursor, setMonthCursor] = useState<Date>(() => {
    const parsed = isoToDate(value);
    return getStartOfMonth(parsed ?? new Date());
  });

  useEffect(() => {
    setText(isoToDisplay(value));
    const parsed = isoToDate(value);
    if (parsed) {
      setMonthCursor(getStartOfMonth(parsed));
    }
  }, [value]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (disabled) {
      setIsOpen(false);
    }
  }, [disabled]);

  const todayIso = useMemo(() => toIsoDate(new Date()), []);
  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("ru-RU", {
        month: "long",
        year: "numeric"
      }).format(monthCursor),
    [monthCursor]
  );
  const monthGrid = useMemo(() => buildMonthGrid(monthCursor), [monthCursor]);

  function handleTextChange(nextRaw: string) {
    const masked = digitsToMaskedDate(nextRaw);
    setText(masked);

    if (!masked) {
      onChange("");
      return;
    }

    if (masked.length === 10) {
      const isoValue = displayToIso(masked);
      if (isoValue) {
        onChange(isoValue);
        const parsed = isoToDate(isoValue);
        if (parsed) {
          setMonthCursor(getStartOfMonth(parsed));
        }
      }
    }
  }

  function handleBlur() {
    if (!text) {
      onChange("");
      return;
    }

    const isoValue = displayToIso(text);
    if (!isoValue) {
      setText(isoToDisplay(value));
      return;
    }

    setText(isoToDisplay(isoValue));
    onChange(isoValue);
  }

  function selectDate(date: Date) {
    const isoValue = toIsoDate(date);
    setText(isoToDisplay(isoValue));
    onChange(isoValue);
    setMonthCursor(getStartOfMonth(date));
    setIsOpen(false);
  }

  function shiftMonth(diff: number) {
    setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() + diff, 1));
  }

  return (
    <div ref={containerRef} className={clsx("relative", className)}>
      <div className="relative">
        <input
          value={text}
          onChange={(event) => handleTextChange(event.target.value)}
          onBlur={handleBlur}
          onFocus={() => {
            if (!disabled) {
              setIsOpen(true);
            }
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

        <button
          type="button"
          onClick={() => {
            if (!disabled) {
              setIsOpen((current) => !current);
            }
          }}
          disabled={disabled}
          className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center text-ink/65 hover:text-accent disabled:cursor-not-allowed disabled:text-ink/40"
          aria-label="Открыть календарь"
        >
          <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden>
            <rect x="3.2" y="4.4" width="13.6" height="12.1" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M3.5 7.6h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M7 2.9v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M13 2.9v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div
        className={clsx(
          "absolute left-0 z-40 aspect-square w-[20rem] max-w-[calc(100vw-1rem)] rounded-2xl border border-line/90 bg-surface p-4 shadow-[0_22px_44px_rgba(0,0,0,0.3)] backdrop-blur-xl",
          "transition-all duration-300 ease-out",
          menuPlacement === "top" ? "bottom-[calc(100%+0.45rem)] origin-bottom" : "top-[calc(100%+0.45rem)] origin-top",
          isOpen
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : menuPlacement === "top"
              ? "pointer-events-none translate-y-1 scale-[0.98] opacity-0"
              : "pointer-events-none -translate-y-1 scale-[0.98] opacity-0"
        )}
        role="dialog"
        aria-hidden={!isOpen}
      >
        <div className="flex h-full flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surfaceSoft hover:border-accent/45 hover:bg-accentSoft"
              aria-label="Предыдущий месяц"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
                <path d="M11.8 4.6L6.4 10l5.4 5.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <p className="text-center text-sm font-semibold capitalize">{monthLabel}</p>

            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surfaceSoft hover:border-accent/45 hover:bg-accentSoft"
              aria-label="Следующий месяц"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
                <path d="M8.2 4.6L13.6 10l-5.4 5.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs text-ink/60">
            {weekdayLabels.map((label) => (
              <div key={label} className="py-1">
                {label}
              </div>
            ))}
          </div>

          <div className="grid grow grid-cols-7 grid-rows-6 gap-1">
            {monthGrid.map((cellDate) => {
              const isoValue = toIsoDate(cellDate);
              const isCurrentMonth = cellDate.getMonth() === monthCursor.getMonth();
              const isSelected = value === isoValue;
              const isToday = todayIso === isoValue;

              return (
                <button
                  key={isoValue}
                  type="button"
                  onClick={() => selectDate(cellDate)}
                  className={clsx(
                    "inline-flex items-center justify-center rounded-lg text-sm",
                    "transition-all duration-200 ease-out",
                    isSelected
                      ? "bg-accent text-white shadow-[0_8px_18px_rgba(15,139,109,0.28)]"
                      : isCurrentMonth
                        ? "text-ink hover:bg-surfaceSoft hover:text-accent"
                        : "text-ink/42 hover:bg-surfaceSoft hover:text-ink/70",
                    isToday && !isSelected && "ring-1 ring-accent/45"
                  )}
                >
                  {cellDate.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-1 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setText("");
                onChange("");
              }}
              className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs hover:border-accentWarm hover:text-accentWarm"
            >
              Очистить
            </button>

            <button
              type="button"
              onClick={() => selectDate(new Date())}
              className="rounded-full border border-accent/35 bg-accentSoft px-3 py-1.5 text-xs text-accent hover:border-accent"
            >
              Сегодня
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
