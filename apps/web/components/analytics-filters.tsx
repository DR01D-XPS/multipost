"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { UiDateInput } from "./ui-date-input";
import { UiSelect, type UiSelectOption } from "./ui-select";

type AnalyticsFiltersProps = {
  channels: Array<{ id: string; name: string }>;
  posts: Array<{ id: string; title: string }>;
  initialChannelId?: string;
  initialPostId?: string;
  initialFrom: string;
  initialTo: string;
};

export function AnalyticsFilters({
  channels,
  posts,
  initialChannelId = "",
  initialPostId = "",
  initialFrom,
  initialTo
}: AnalyticsFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [channelId, setChannelId] = useState(initialChannelId);
  const [postId, setPostId] = useState(initialPostId);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  useEffect(() => {
    setChannelId(initialChannelId);
  }, [initialChannelId]);

  useEffect(() => {
    setPostId(initialPostId);
  }, [initialPostId]);

  useEffect(() => {
    setFrom(initialFrom);
  }, [initialFrom]);

  useEffect(() => {
    setTo(initialTo);
  }, [initialTo]);

  const channelOptions: UiSelectOption<string>[] = [
    { value: "", label: "Все каналы" },
    ...channels.map((channel) => ({
      value: channel.id,
      label: channel.name
    }))
  ];

  const postOptions: UiSelectOption<string>[] = [
    { value: "", label: "Все посты" },
    ...posts.map((post) => ({
      value: post.id,
      label: post.title
    }))
  ];

  function applyFilters() {
    const params = new URLSearchParams();

    if (channelId) {
      params.set("channelId", channelId);
    }

    if (postId) {
      params.set("postId", postId);
    }

    if (from) {
      params.set("from", from);
    }

    if (to) {
      params.set("to", to);
    }

    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  }

  return (
    <form
      className="mt-6 grid gap-4 xl:grid-cols-[240px_240px_190px_190px_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        applyFilters();
      }}
    >
      <UiSelect value={channelId} onChange={setChannelId} options={channelOptions} />
      <UiSelect value={postId} onChange={setPostId} options={postOptions} />
      <UiDateInput value={from} onChange={setFrom} />
      <UiDateInput value={to} onChange={setTo} />

      <button
        type="submit"
        disabled={isPending}
        className="rounded-full border border-line bg-surface px-5 py-3 text-sm font-medium hover:border-accent/45 hover:bg-surfaceSoft disabled:opacity-60"
      >
        {isPending ? "Обновление..." : "Применить"}
      </button>
    </form>
  );
}
