"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { UiDateInput } from "./ui-date-input";
import { UiTimeInput } from "./ui-time-input";

type ScheduleDatetimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

type LocalParts = {
  date: string;
  time: string;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function todayIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function splitLocalDatetime(value: string): LocalParts {
  if (!value) {
    return { date: "", time: "" };
  }

  const [date = "", time = ""] = value.split("T");
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
    time: /^\d{2}:\d{2}$/.test(time.slice(0, 5)) ? time.slice(0, 5) : ""
  };
}

function formatDisplay(value: string): string {
  const parts = splitLocalDatetime(value);
  if (!parts.date && !parts.time) {
    return "дд.мм.гггг --:--";
  }

  if (!parts.date) {
    return `дд.мм.гггг ${parts.time || "--:--"}`;
  }

  const [yearText, monthText, dayText] = parts.date.split("-");
  const composed = `${dayText}.${monthText}.${yearText}`;
  return `${composed} ${parts.time || "--:--"}`;
}

function buildLocalDatetime(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(
    date.getMinutes()
  )}`;
}

function isValidTime(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(value);
}

export function ScheduleDatetimePicker({
  value,
  onChange,
  disabled = false,
  placeholder = "дд.мм.гггг --:--"
}: ScheduleDatetimePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [localDate, setLocalDate] = useState("");
  const [localTime, setLocalTime] = useState("");

  useEffect(() => {
    const parts = splitLocalDatetime(value);
    setLocalDate(parts.date);
    setLocalTime(parts.time);
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

  function commit(nextDate: string, nextTime: string) {
    if (!nextDate && !nextTime) {
      onChange("");
      return;
    }

    const finalDate = nextDate || localDate || todayIsoDate();
    const finalTime = isValidTime(nextTime) ? nextTime : isValidTime(localTime) ? localTime : "10:00";
    onChange(`${finalDate}T${finalTime}`);
  }

  function onDateChange(nextDate: string) {
    setLocalDate(nextDate);
    if (!nextDate) {
      onChange("");
      return;
    }
    commit(nextDate, localTime);
  }

  function onTimeChange(nextTime: string) {
    setLocalTime(nextTime);
    if (isValidTime(nextTime)) {
      commit(localDate, nextTime);
    }

    if (!nextTime && !localDate) {
      onChange("");
    }
  }

  function handlePreset(action: "hour" | "evening" | "tomorrow") {
    const now = new Date();

    if (action === "hour") {
      now.setMinutes(0, 0, 0);
      now.setHours(now.getHours() + 1);
    }

    if (action === "evening") {
      now.setHours(19, 0, 0, 0);
    }

    if (action === "tomorrow") {
      now.setDate(now.getDate() + 1);
      now.setHours(10, 0, 0, 0);
    }

    const nextValue = buildLocalDatetime(now);
    const parts = splitLocalDatetime(nextValue);
    setLocalDate(parts.date);
    setLocalTime(parts.time);
    onChange(nextValue);
    setIsOpen(false);
  }

  const displayValue = useMemo(() => formatDisplay(value), [value]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!disabled) {
            setIsOpen((current) => !current);
          }
        }}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={clsx(
          "inline-flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-input px-4 py-3 text-left",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all duration-300 ease-out",
          "hover:border-accent/45 hover:bg-surfaceSoft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
          disabled && "cursor-not-allowed bg-field text-ink/55 hover:border-line hover:bg-field"
        )}
      >
        <span className={clsx("truncate", !value && "text-ink/45")}>{value ? displayValue : placeholder}</span>
        <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-ink/65" aria-hidden>
          <rect x="3.2" y="4.4" width="13.6" height="12.1" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3.5 7.6h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M7 2.9v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M13 2.9v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      <div
        role="dialog"
        aria-hidden={!isOpen}
        className={clsx(
          "absolute left-0 top-[calc(100%+0.5rem)] z-40 w-full rounded-2xl border border-line/90 bg-surface p-4 shadow-[0_22px_44px_rgba(0,0,0,0.3)] backdrop-blur-xl",
          "transition-all duration-300 ease-out",
          isOpen ? "pointer-events-auto translate-y-0 scale-100 opacity-100" : "pointer-events-none -translate-y-1 scale-[0.98] opacity-0"
        )}
      >
        <div className="grid gap-3">
          <label className="grid gap-2 text-xs font-medium uppercase tracking-[0.14em] text-ink/60">
            Дата
            <UiDateInput value={localDate} onChange={onDateChange} menuPlacement="top" />
          </label>

          <label className="grid gap-2 text-xs font-medium uppercase tracking-[0.14em] text-ink/60">
            Время
            <UiTimeInput value={localTime} onChange={onTimeChange} />
          </label>

          <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => handlePreset("hour")}
              className="rounded-xl border border-line bg-surfaceSoft px-3 py-2 text-xs font-medium hover:border-accent/45 hover:bg-accentSoft"
            >
              Через 1 час
            </button>
            <button
              type="button"
              onClick={() => handlePreset("evening")}
              className="rounded-xl border border-line bg-surfaceSoft px-3 py-2 text-xs font-medium hover:border-accent/45 hover:bg-accentSoft"
            >
              Сегодня 19:00
            </button>
            <button
              type="button"
              onClick={() => handlePreset("tomorrow")}
              className="rounded-xl border border-line bg-surfaceSoft px-3 py-2 text-xs font-medium hover:border-accent/45 hover:bg-accentSoft"
            >
              Завтра 10:00
            </button>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => {
                setLocalDate("");
                setLocalTime("");
                onChange("");
              }}
              className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs hover:border-accentWarm hover:text-accentWarm"
            >
              Очистить
            </button>

            <button
              type="button"
              onClick={() => {
                commit(localDate, localTime);
                setIsOpen(false);
              }}
              className="rounded-full border border-accent bg-accent px-4 py-1.5 text-xs text-white"
            >
              Готово
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
