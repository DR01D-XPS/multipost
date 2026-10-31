"use client";

import { useEffect } from "react";
import clsx from "clsx";

type UiConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
};

export function UiConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  onConfirm,
  onCancel,
  destructive = false
}: UiConfirmDialogProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Закрыть диалог"
        onClick={onCancel}
        className="absolute inset-0 bg-[rgba(6,12,16,0.68)] backdrop-blur-[2px]"
      />

      <div className="relative w-full max-w-md rounded-[1.6rem] border border-line bg-panel p-5 shadow-[0_28px_80px_rgba(0,0,0,0.36)]">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">Подтверждение</p>
        <h3 className="mt-2 text-xl font-semibold">{title}</h3>
        <p className="mt-3 text-sm text-ink/70">{description}</p>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-line bg-surface px-4 py-2 text-sm hover:border-accent/45 hover:bg-surfaceSoft"
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className={clsx(
              "rounded-full border px-4 py-2 text-sm font-medium text-white",
              destructive
                ? "border-rose-500/70 bg-rose-500 hover:border-rose-400 hover:bg-rose-400"
                : "border-accent bg-accent hover:border-accent/80 hover:bg-accent/90"
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
