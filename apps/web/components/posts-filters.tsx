"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { publishStatusLabels } from "../lib/labels";
import { UiSelect, type UiSelectOption } from "./ui-select";

type StatusFilterValue = keyof typeof publishStatusLabels | "";

const publishStatuses = Object.keys(publishStatusLabels) as Array<keyof typeof publishStatusLabels>;

const statusOptions: UiSelectOption<StatusFilterValue>[] = [
  { value: "", label: "Все статусы" },
  ...publishStatuses.map((status) => ({
    value: status,
    label: publishStatusLabels[status]
  }))
];

export function PostsFilters({
  initialSearch,
  initialStatus
}: {
  initialSearch?: string;
  initialStatus?: StatusFilterValue;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(initialSearch ?? "");
  const [status, setStatus] = useState<StatusFilterValue>(initialStatus ?? "");
  const searchTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  useEffect(() => {
    setSearch(initialSearch ?? "");
  }, [initialSearch]);

  useEffect(() => {
    setStatus(initialStatus ?? "");
  }, [initialStatus]);

  useEffect(
    () => () => {
      if (searchTimerRef.current !== null) {
        window.clearTimeout(searchTimerRef.current);
      }
    },
    []
  );

  function applyFilters(nextSearch: string, nextStatus: StatusFilterValue) {
    const params = new URLSearchParams(searchParams.toString());
    const normalizedSearch = nextSearch.trim();

    if (normalizedSearch) {
      params.set("search", normalizedSearch);
    } else {
      params.delete("search");
    }

    if (nextStatus) {
      params.set("status", nextStatus);
    } else {
      params.delete("status");
    }

    const query = params.toString();
    startTransition(() => {
      router.replace(query.length > 0 ? `${pathname}?${query}` : pathname);
    });
  }

  function onSearchChange(nextSearch: string) {
    setSearch(nextSearch);
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current);
    }

    searchTimerRef.current = window.setTimeout(() => {
      applyFilters(nextSearch, status);
    }, 260);
  }

  function onStatusChange(nextStatus: StatusFilterValue) {
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }

    setStatus(nextStatus);
    applyFilters(search, nextStatus);
  }

  return (
    <div className="mt-6 grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
      <label className="grid gap-2 text-sm">
        <span className="font-medium text-ink/65">Поиск</span>
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Поиск по черновикам"
          className="rounded-2xl border border-line bg-input px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
        />
      </label>

      <label className="relative z-30 grid gap-2 self-start text-sm">
        <span className="font-medium text-ink/65">Статус публикации</span>
        <UiSelect value={status} onChange={onStatusChange} options={statusOptions} menuPlacement="top" />
      </label>

      {isPending ? <p className="text-xs text-ink/60 md:col-span-2">Обновляю список...</p> : null}
    </div>
  );
}
