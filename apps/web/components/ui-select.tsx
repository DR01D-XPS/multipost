"use client";

import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";

export type UiSelectOption<T extends string = string> = {
  value: T;
  label: string;
};

type UiSelectProps<T extends string> = {
  value: T;
  options: UiSelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  menuMode?: "overlay" | "inline";
  menuPlacement?: "bottom" | "top";
};

export function UiSelect<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
  placeholder,
  className,
  buttonClassName,
  menuMode = "overlay",
  menuPlacement = "bottom"
}: UiSelectProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const listboxId = useId();
  const selected = options.find((option) => option.value === value);
  const isInlineMenu = menuMode === "inline";
  const overlayPlacementClass =
    menuPlacement === "top" ? "absolute bottom-[calc(100%+0.45rem)] left-0 z-40" : "absolute left-0 top-[calc(100%+0.45rem)] z-40";
  const overlayOriginClass = menuPlacement === "top" ? "origin-bottom" : "origin-top";

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

  return (
    <div ref={containerRef} className={clsx("relative", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        onClick={() => {
          if (!disabled) {
            setIsOpen((current) => !current);
          }
        }}
        disabled={disabled}
        className={clsx(
          "group ui-select-trigger inline-flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-input px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
          "hover:border-accent/45 hover:bg-surfaceSoft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
          disabled && "cursor-not-allowed opacity-60 hover:border-line hover:bg-input",
          buttonClassName
        )}
      >
        <span className={clsx("truncate", !selected && "text-ink/45")}>{selected?.label ?? placeholder ?? "Выберите"}</span>
        <svg
          viewBox="0 0 20 20"
          className={clsx(
            "h-4 w-4 shrink-0 text-ink/65 transition-transform duration-300 ease-out",
            isOpen ? "rotate-180" : "rotate-0"
          )}
          aria-hidden
        >
          <path
            d="M5.25 7.5L10 12.25L14.75 7.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div
        id={listboxId}
        role="listbox"
        className={clsx(
          isInlineMenu
            ? "relative mt-2 w-full origin-top overflow-hidden rounded-2xl bg-surface shadow-[0_18px_38px_rgba(0,0,0,0.2)] backdrop-blur-xl transition-[max-height,opacity,transform,padding,border-color] duration-300 ease-out"
            : clsx(
                overlayPlacementClass,
                overlayOriginClass,
                "w-full rounded-2xl border border-line/90 bg-surface p-1.5 shadow-[0_18px_38px_rgba(0,0,0,0.24)] backdrop-blur-xl transition-all duration-300 ease-out"
              ),
          isOpen
            ? isInlineMenu
              ? "pointer-events-auto max-h-[22rem] translate-y-0 border border-line/90 p-1.5 opacity-100"
              : "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : isInlineMenu
              ? "pointer-events-none max-h-0 -translate-y-1 border border-transparent p-0 opacity-0"
              : "pointer-events-none -translate-y-1 scale-[0.98] opacity-0"
        )}
      >
        {options.map((option) => {
          const isActive = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={isActive}
              onClick={() => {
                setIsOpen(false);
                if (!isActive) {
                  onChange(option.value);
                }
              }}
              className={clsx(
                "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm",
                "transition-all duration-200 ease-out",
                isActive
                  ? "bg-accentSoft text-accent shadow-[inset_0_0_0_1px_rgba(15,139,109,0.2)]"
                  : "text-ink/92 hover:bg-surfaceSoft hover:text-ink"
              )}
            >
              <span className="truncate">{option.label}</span>
              {isActive ? (
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                  OK
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
