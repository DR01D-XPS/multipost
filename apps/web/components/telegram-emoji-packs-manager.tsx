"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChannelView, TelegramEmojiPackView, TelegramEmojiView } from "../lib/server";
import { UiConfirmDialog } from "./ui-confirm-dialog";

type TelegramImportChannel = Pick<ChannelView, "id" | "name">;

function EmojiPreview({ emoji }: { emoji: TelegramEmojiView }) {
  if (emoji.previewUrl && emoji.previewMimeType?.startsWith("image/")) {
    return <img src={emoji.previewUrl} alt={emoji.emoji} className="h-8 w-8 object-contain" />;
  }

  if (emoji.previewUrl && emoji.previewMimeType?.startsWith("video/")) {
    return <video src={emoji.previewUrl} className="h-8 w-8 object-contain" autoPlay muted loop playsInline />;
  }

  return <span className="text-xl">{emoji.emoji}</span>;
}

export function TelegramEmojiPacksManager({
  initialPacks,
  telegramChannels
}: {
  initialPacks: TelegramEmojiPackView[];
  telegramChannels: TelegramImportChannel[];
}) {
  const [packs, setPacks] = useState(initialPacks);
  const [source, setSource] = useState("");
  const [telegramChannelId, setTelegramChannelId] = useState(telegramChannels[0]?.id ?? "");
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteIntent, setDeleteIntent] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    setPacks(initialPacks);
  }, [initialPacks]);

  useEffect(() => {
    if (telegramChannels.length === 0) {
      setTelegramChannelId("");
      return;
    }

    if (!telegramChannels.some((channel) => channel.id === telegramChannelId)) {
      setTelegramChannelId(telegramChannels[0]?.id ?? "");
    }
  }, [telegramChannels, telegramChannelId]);

  const packCountLabel = useMemo(() => {
    if (packs.length === 1) {
      return "1 набор";
    }

    if (packs.length >= 2 && packs.length <= 4) {
      return `${packs.length} набора`;
    }

    return `${packs.length} наборов`;
  }, [packs.length]);

  async function handleImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!telegramChannelId) {
      setMessage("Сначала добавьте Telegram-канал с botToken.");
      return;
    }

    setIsImporting(true);
    setMessage(null);

    const response = await fetch("/api/telegram-emoji-packs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        telegramChannelId,
        source
      })
    });

    const payload = (await response.json().catch(() => ({}))) as {
      pack?: TelegramEmojiPackView;
      message?: string;
      error?: string;
    };

    if (!response.ok || !payload.pack) {
      setMessage(payload.error ?? "Не удалось импортировать набор Telegram emoji.");
      setIsImporting(false);
      return;
    }

    setPacks((current) => {
      const withoutCurrent = current.filter((pack) => pack.id !== payload.pack!.id);
      return [payload.pack!, ...withoutCurrent];
    });
    setSource("");
    setMessage(payload.message ?? "Набор Telegram emoji обновлен.");
    setIsImporting(false);
  }

  async function handleDelete(packId: string) {
    const response = await fetch(`/api/telegram-emoji-packs/${packId}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setMessage(payload.error ?? "Не удалось удалить набор.");
      return;
    }

    setPacks((current) => current.filter((pack) => pack.id !== packId));
    setMessage("Набор удален из локальной библиотеки.");
  }

  return (
    <section className="rounded-[2rem] border border-line bg-panel p-6 shadow-studio">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">Telegram emoji</p>
          <h2 className="mt-2 text-3xl font-semibold">Паки кастомных emoji</h2>
          <p className="mt-3 max-w-3xl text-sm text-ink/70">
            Импортируйте наборы по ссылке вида <span className="font-mono">t.me/addemoji/pack_name</span> или по short name.
            Сайт сохранит их локально и покажет в панели редактора.
          </p>
        </div>

        <div className="rounded-full border border-line bg-surface px-4 py-2 text-sm text-ink/70">{packCountLabel}</div>
      </div>

      <form onSubmit={handleImport} className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
        <label className="grid gap-2 text-sm">
          <span className="font-medium">Ссылка или short name набора</span>
          <input
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="rounded-2xl border border-line bg-input px-4 py-3"
            placeholder="Например: https://t.me/addemoji/NewsCaps или NewsCaps"
            disabled={telegramChannels.length === 0}
            required
          />
        </label>

        <button
          type="submit"
          disabled={isImporting || telegramChannels.length === 0}
          className="self-end rounded-full border border-accent bg-accent px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {isImporting ? "Импорт..." : "Импортировать набор"}
        </button>
      </form>

      <p className="mt-3 text-xs text-ink/55">
        Ссылку на набор берите в Telegram: откройте набор emoji и скопируйте ссылку на него. Поддерживается и прямой short name.
      </p>

      {message ? <p className="mt-4 text-sm text-ink/70">{message}</p> : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {packs.map((pack) => (
          <article key={pack.id} className="rounded-[1.75rem] border border-line bg-surface p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="truncate text-xl font-semibold">{pack.title}</h3>
                <p className="mt-2 font-mono text-xs text-ink/55">{pack.setName}</p>
                <a href={pack.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-sm text-accent underline underline-offset-4">
                  Открыть ссылку набора
                </a>
              </div>

              <button
                type="button"
                onClick={() => setDeleteIntent({ id: pack.id, title: pack.title })}
                className="rounded-full border border-line bg-surfaceSoft px-4 py-2 text-sm hover:border-accentWarm hover:text-accentWarm"
              >
                Удалить
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3 text-xs text-ink/60">
              <span>{pack.emojiCount} emoji</span>
              <span>Обновлен {new Date(pack.updatedAt).toLocaleString()}</span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {pack.emojis.slice(0, 24).map((emoji) => (
                <div key={emoji.customEmojiId} className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-surfaceSoft" title={`${emoji.emoji} • ${pack.title}`}>
                  <EmojiPreview emoji={emoji} />
                </div>
              ))}

              {pack.emojis.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line bg-surfaceSoft px-4 py-3 text-sm text-ink/60">
                  В наборе пока нет загруженных emoji.
                </div>
              ) : null}
            </div>
          </article>
        ))}

        {packs.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-line bg-surface p-8 text-sm text-ink/60 xl:col-span-2">
            Импортируйте первый Telegram emoji pack, и он появится здесь и в панели редактора поста.
          </div>
        ) : null}
      </div>

      <UiConfirmDialog
        isOpen={deleteIntent !== null}
        title={deleteIntent ? `Удалить набор "${deleteIntent.title}"?` : "Удалить набор?"}
        description="Уже вставленные emoji в постах останутся, но набор исчезнет из панели."
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        destructive
        onCancel={() => setDeleteIntent(null)}
        onConfirm={() => {
          if (!deleteIntent) {
            return;
          }

          void handleDelete(deleteIntent.id);
          setDeleteIntent(null);
        }}
      />
    </section>
  );
}
