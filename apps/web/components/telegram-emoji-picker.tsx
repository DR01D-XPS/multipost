"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { TelegramEmojiPackView, TelegramEmojiView } from "../lib/server";

type PickerEmoji = TelegramEmojiView & {
  packTitle: string;
  setName: string;
};

function EmojiPreview({ emoji }: { emoji: PickerEmoji }) {
  if (emoji.previewUrl && emoji.previewMimeType?.startsWith("image/")) {
    return <img src={emoji.previewUrl} alt={emoji.emoji} className="h-8 w-8 object-contain" />;
  }

  if (emoji.previewUrl && emoji.previewMimeType?.startsWith("video/")) {
    return (
      <video
        src={emoji.previewUrl}
        className="h-8 w-8 object-contain"
        autoPlay
        muted
        loop
        playsInline
      />
    );
  }

  return <span className="text-2xl">{emoji.emoji}</span>;
}

export function TelegramEmojiPicker({
  packs,
  onSelect
}: {
  packs: TelegramEmojiPackView[];
  onSelect: (emoji: PickerEmoji) => void;
}) {
  const [query, setQuery] = useState("");
  const [activePackId, setActivePackId] = useState<string>("all");

  useEffect(() => {
    if (packs.length === 0) {
      setActivePackId("all");
      return;
    }

    if (activePackId !== "all" && !packs.some((pack) => pack.id === activePackId)) {
      setActivePackId(packs[0]?.id ?? "all");
    }
  }, [activePackId, packs]);

  const allEmoji = useMemo(
    () =>
      packs.flatMap((pack) =>
        pack.emojis.map((emoji) => ({
          ...emoji,
          packTitle: pack.title,
          setName: pack.setName
        }))
      ),
    [packs]
  );

  const visibleEmoji = useMemo(() => {
    const base = activePackId === "all" ? allEmoji : allEmoji.filter((emoji) => emoji.packId === activePackId);
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return base;
    }

    return base.filter((emoji) => {
      return (
        emoji.emoji.toLowerCase().includes(normalizedQuery) ||
        emoji.packTitle.toLowerCase().includes(normalizedQuery) ||
        emoji.setName.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [activePackId, allEmoji, query]);

  const groupedEmoji = useMemo(() => {
    const groups = new Map<string, PickerEmoji[]>();

    for (const emoji of visibleEmoji) {
      const existing = groups.get(emoji.emoji) ?? [];
      existing.push(emoji);
      groups.set(emoji.emoji, existing);
    }

    return [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([emoji, items]) => ({
        emoji,
        items: [...items].sort((left, right) => {
          if (left.packTitle !== right.packTitle) {
            return left.packTitle.localeCompare(right.packTitle);
          }

          return left.sortOrder - right.sortOrder;
        })
      }));
  }, [visibleEmoji]);

  if (packs.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-line bg-surfaceSoft p-4 text-sm text-ink/60">
        Сначала импортируйте Telegram emoji pack на странице «Каналы», и он появится здесь.
      </div>
    );
  }

  return (
    <div className="rounded-[1.5rem] border border-line bg-surfaceSoft p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">Telegram emoji</p>
          <h3 className="mt-2 text-lg font-semibold">Панель кастомных emoji</h3>
        </div>

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по emoji или названию набора"
          className="w-full rounded-2xl border border-line bg-input px-4 py-2.5 text-sm lg:max-w-sm"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActivePackId("all")}
          className={clsx(
            "rounded-full border px-3 py-1.5 text-sm transition",
            activePackId === "all" ? "border-accent bg-accent text-white" : "border-line bg-surface hover:border-accent/50"
          )}
        >
          Все наборы
        </button>

        {packs.map((pack) => (
          <button
            key={pack.id}
            type="button"
            onClick={() => setActivePackId(pack.id)}
            className={clsx(
              "rounded-full border px-3 py-1.5 text-sm transition",
              activePackId === pack.id ? "border-accent bg-accent text-white" : "border-line bg-surface hover:border-accent/50"
            )}
          >
            {pack.title}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-5">
        {groupedEmoji.map((group) => (
          <section key={group.emoji}>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xl">{group.emoji}</span>
              <span className="text-sm text-ink/60">{group.items.length} вариантов</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {group.items.map((emoji) => (
                <button
                  key={emoji.customEmojiId}
                  type="button"
                  onClick={() => onSelect(emoji)}
                  title={`${emoji.packTitle} • ${emoji.emoji}`}
                  className="group flex min-h-16 min-w-16 flex-col items-center justify-center rounded-2xl border border-line bg-surface px-2 py-2 transition hover:border-accent hover:bg-accentSoft"
                >
                  <EmojiPreview emoji={emoji} />
                  <span className="mt-1 text-[10px] uppercase tracking-[0.18em] text-ink/45 group-hover:text-ink/70">
                    {emoji.emoji}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}

        {groupedEmoji.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface px-4 py-6 text-sm text-ink/60">
            По вашему запросу ничего не найдено.
          </div>
        ) : null}
      </div>
    </div>
  );
}
