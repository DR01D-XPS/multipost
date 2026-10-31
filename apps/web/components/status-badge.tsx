import clsx from "clsx";
import type { PublishStatus } from "@multipost/core";
import { publishStatusLabels } from "../lib/labels";

const statusStyles: Record<PublishStatus, string> = {
  DRAFT: "border-slate-300 bg-slate-100 text-slate-700",
  SCHEDULED: "border-sky-300 bg-sky-100 text-sky-700",
  PUBLISHING: "border-amber-300 bg-amber-100 text-amber-700",
  PUBLISHED: "border-emerald-300 bg-emerald-100 text-emerald-700",
  FAILED: "border-rose-300 bg-rose-100 text-rose-700"
};

export function StatusBadge({ status }: { status: PublishStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium uppercase tracking-[0.16em]",
        statusStyles[status]
      )}
    >
      {publishStatusLabels[status]}
    </span>
  );
}
