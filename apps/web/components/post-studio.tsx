"use client";

import { useDeferredValue, useEffect, useMemo, useState, type ChangeEvent } from "react";
import clsx from "clsx";
import type { PublishMode, PublishStatus, RichTextDocument } from "@multipost/core";
import { renderAllPlatforms, type PlatformRenderResult } from "@multipost/renderers";
import type { ChannelView, MediaAssetView, PostDetailView, PublishTargetView, TelegramEmojiPackView } from "../lib/server";
import { channelTypeLabels, previewFormatLabels, previewPlatformLabels, publishModeLabels } from "../lib/labels";
import { RichTextEditor } from "./rich-text-editor";
import { ScheduleDatetimePicker } from "./schedule-datetime-picker";
import { StatusBadge } from "./status-badge";
import { UiSelect, type UiSelectOption } from "./ui-select";

type ChannelOption = Pick<ChannelView, "id" | "name" | "type" | "maskedConfig">;
type LivePlatform = PlatformRenderResult["platform"];
type ManualConfirmationReason = "captcha" | "auth" | "manual";

type TargetDraftState = {
  mode: PublishMode;
  scheduledAt: string;
};

const publishModeOptions = (Object.entries(publishModeLabels) as Array<[PublishMode, string]>).map(([value, label]) => ({
  value,
  label
})) as UiSelectOption<PublishMode>[];

function detectManualConfirmationReason(errorText: string): ManualConfirmationReason | null {
  const normalized = errorText.toLowerCase();

  if (
    normalized.includes("playwright_captcha_required") ||
    normalized.includes("captcha") ||
    normalized.includes("authcheck") ||
    normalized.includes("не робот")
  ) {
    return "captcha";
  }

  if (
    normalized.includes("playwright_auth_required") ||
    normalized.includes("не авторизован") ||
    normalized.includes("требуется авторизация") ||
    normalized.includes("log in")
  ) {
    return "auth";
  }

  if (normalized.includes("ручн") || normalized.includes("подтверд") || normalized.includes("manual")) {
    return "manual";
  }

  return null;
}

function extractUrlFromText(input: string): string | null {
  const match = input.match(/https?:\/\/[^\s)]+/i);
  return match?.[0] ?? null;
}

function getVkGroupId(channel: ChannelOption): number | null {
  const raw = channel.maskedConfig?.groupId;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string") {
    const parsed = Number(raw.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function getManualConfirmationUrl(channel: ChannelOption, errorText: string): string {
  const urlFromError = extractUrlFromText(errorText);
  if (urlFromError) {
    return urlFromError;
  }

  if (channel.type === "VK_GROUP") {
    const groupId = getVkGroupId(channel);
    if (groupId) {
      return `https://vk.com/public${groupId}`;
    }
    return "https://vk.com";
  }

  if (channel.type === "TELEGRAM_CHANNEL") {
    return "https://web.telegram.org";
  }

  return "https://max.ru";
}

function getManualConfirmationDescription(reason: ManualConfirmationReason, platformLabel: string): string {
  if (reason === "captcha") {
    return `Откройте ${platformLabel}, завершите проверку (капча/антибот), затем нажмите «Проверить снова».`;
  }

  if (reason === "auth") {
    return `Откройте ${platformLabel}, войдите в нужный аккаунт и подтвердите вход, затем нажмите «Проверить снова».`;
  }

  return `Откройте ${platformLabel} и завершите ручное подтверждение. После этого нажмите «Проверить снова».`;
}

function getAttachmentLabel(count: number): string {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return "вложений";
  }

  if (lastDigit === 1) {
    return "вложение";
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return "вложения";
  }

  return "вложений";
}

function isVideoAsset(asset: MediaAssetView): boolean {
  return asset.kind === "video" || asset.mimeType.toLowerCase().startsWith("video/");
}

function getMediaBadge(asset: MediaAssetView): string {
  if (isVideoAsset(asset)) {
    return "VIDEO";
  }

  if (asset.mimeType.toLowerCase() === "image/gif") {
    return "GIF";
  }

  return asset.mimeType.split("/")[1]?.toUpperCase() ?? "MEDIA";
}

function isoToDatetimeLocal(value: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function localDatetimeToIso(value: string): string | null {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
}

function buildDraftTargets(channels: ChannelOption[], targets: PublishTargetView[]) {
  return Object.fromEntries(
    channels.map((channel) => {
      const existing = targets.find((target) => target.channelId === channel.id);
      return [
        channel.id,
        {
          mode: (existing?.mode as PublishMode | undefined) ?? "DISABLED",
          scheduledAt: isoToDatetimeLocal(existing?.scheduledAt ?? null)
        } satisfies TargetDraftState
      ];
    })
  ) as Record<string, TargetDraftState>;
}

function reorderAssets(assets: MediaAssetView[], fromIndex: number, toIndex: number): MediaAssetView[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= assets.length || toIndex >= assets.length) {
    return assets;
  }

  const next = [...assets];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) {
    return assets;
  }

  next.splice(toIndex, 0, moved);
  return next.map((asset, index) => ({
    ...asset,
    sortOrder: index
  }));
}

function MediaPreviewTile({ asset }: { asset: MediaAssetView }) {
  return (
    <figure className="relative overflow-hidden rounded-[1rem] border border-line/60 bg-canvas/35">
      {isVideoAsset(asset) ? (
        <video src={asset.url} className="h-28 w-full object-cover" muted playsInline preload="metadata" />
      ) : (
        <img src={asset.url} alt={asset.originalName ?? "Вложение"} className="h-28 w-full object-cover" loading="lazy" />
      )}
      <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-1 text-[10px] font-semibold tracking-[0.18em] text-white">
        {getMediaBadge(asset)}
      </span>
    </figure>
  );
}

function LivePlatformPreview({
  platform,
  preview,
  mediaAssets,
  onPlatformChange
}: {
  platform: LivePlatform;
  preview: PlatformRenderResult;
  mediaAssets: MediaAssetView[];
  onPlatformChange: (platform: LivePlatform) => void;
}) {
  const previewTime = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  return (
    <div
      className={clsx(
        "rounded-[1.75rem] border p-4 shadow-studio transition-all duration-300",
        platform === "telegram" && "border-[#314352] bg-[#24313c] text-white",
        platform === "max" && "border-[#2c3948] bg-[#1f2a35] text-white",
        platform === "vk" && "border-[#d7e0e8] bg-[#edf2f6] text-[#1d2a39]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className={clsx(
              "font-mono text-[11px] uppercase tracking-[0.28em]",
              platform === "vk" ? "text-[#5c7d9b]" : "text-[#8ad6c0]"
            )}
          >
            Живой вид
          </p>
          <h3 className="mt-2 text-lg font-semibold">{previewPlatformLabels[platform]}</h3>
          <p className={clsx("mt-1 text-xs", platform === "vk" ? "text-[#5b7187]" : "text-white/65")}>
            {previewFormatLabels[preview.outputFormat]}
          </p>
        </div>

        <span
          className={clsx(
            "rounded-full px-3 py-1 text-xs",
            platform === "vk" ? "bg-white text-[#48617a]" : "bg-white/10 text-white/70"
          )}
        >
          {mediaAssets.length} {getAttachmentLabel(mediaAssets.length)}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(["telegram", "max", "vk"] as LivePlatform[]).map((platformOption) => (
          <button
            key={platformOption}
            type="button"
            onClick={() => onPlatformChange(platformOption)}
            className={clsx(
              "rounded-full border px-3 py-1.5 text-sm transition-all duration-300",
              platform === platformOption
                ? platform === "vk"
                  ? "border-[#5d7d9b] bg-[#5d7d9b] text-white"
                  : "border-[#8ad6c0] bg-[#8ad6c0] text-[#0f1f2b]"
                : platform === "vk"
                  ? "border-[#c5d2de] bg-white text-[#38516a]"
                  : "border-white/20 bg-white/5 text-white/80"
            )}
          >
            {previewPlatformLabels[platformOption]}
          </button>
        ))}
      </div>

      <div
        className={clsx(
          "mt-4 rounded-[1.5rem] p-4",
          platform === "telegram" && "bg-[#1f2a35]",
          platform === "max" && "bg-[#19222d]",
          platform === "vk" && "bg-white"
        )}
      >
        <div
          className={clsx(
            "text-xs uppercase tracking-[0.18em]",
            platform === "vk" ? "text-[#6b8398]" : "text-[#8ad6c0]"
          )}
        >
          {platform === "vk" ? "Сообщество" : "Канал"}
        </div>

        {mediaAssets.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {mediaAssets.slice(0, 4).map((asset) => (
              <MediaPreviewTile key={asset.id} asset={asset} />
            ))}
          </div>
        ) : null}

        <div
          className={clsx(
            "mt-4",
            platform === "telegram" && "telegram-live-bubble",
            platform === "max" && "live-preview-bubble live-preview-bubble--max",
            platform === "vk" && "live-preview-post live-preview-post--vk"
          )}
        >
          <div
            className={clsx(
              "live-preview-body",
              platform === "telegram" && "telegram-live-body",
              platform === "max" && "live-preview-body--max",
              platform === "vk" && "live-preview-body--vk"
            )}
            dangerouslySetInnerHTML={{
              __html: preview.previewHtml || "<p><em>Начните писать текст, и здесь сразу появится итоговый пост.</em></p>"
            }}
          />

          <div className={clsx("mt-3 text-right text-xs", platform === "vk" ? "text-[#6c8094]" : "text-white/45")}>{previewTime}</div>
        </div>
      </div>
    </div>
  );
}

export function PostStudio({
  post,
  channels,
  emojiPacks
}: {
  post: PostDetailView;
  channels: ChannelOption[];
  emojiPacks: TelegramEmojiPackView[];
}) {
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content as RichTextDocument);
  const [mediaAssets, setMediaAssets] = useState(post.mediaAssets);
  const [targets, setTargets] = useState(post.targets);
  const [draftTargets, setDraftTargets] = useState(() => buildDraftTargets(channels, post.targets));
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isReorderingMedia, setIsReorderingMedia] = useState(false);
  const [livePlatform, setLivePlatform] = useState<LivePlatform>("telegram");
  const [showInlineVerificationFrame, setShowInlineVerificationFrame] = useState(false);
  const deferredContent = useDeferredValue(content);

  const previews = useMemo(() => renderAllPlatforms(deferredContent, mediaAssets), [deferredContent, mediaAssets]);
  const previewByPlatform = useMemo(
    () =>
      Object.fromEntries(previews.map((preview) => [preview.platform, preview])) as Record<LivePlatform, PlatformRenderResult>,
    [previews]
  );
  const manualConfirmationRequest = useMemo(() => {
    for (const channel of channels) {
      const target = targets.find((item) => item.channelId === channel.id);
      const lastError = target?.lastError?.trim();
      if (!lastError) {
        continue;
      }

      const reason = detectManualConfirmationReason(lastError);
      if (!reason) {
        continue;
      }

      return {
        channelName: channel.name,
        platformLabel: channelTypeLabels[channel.type],
        link: getManualConfirmationUrl(channel, lastError),
        reason,
        errorText: lastError
      };
    }

    return null;
  }, [channels, targets]);

  useEffect(() => {
    if (!manualConfirmationRequest) {
      setShowInlineVerificationFrame(false);
      return;
    }

    setShowInlineVerificationFrame(manualConfirmationRequest.reason === "captcha");
  }, [manualConfirmationRequest]);

  async function persistDraft(
    successMessage = "Черновик сохранён.",
    options: {
      syncTargetDrafts?: boolean;
    } = {}
  ) {
    const response = await fetch(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title,
        content
      })
    });
    const payload = (await response.json()) as { post?: PostDetailView; error?: string };

    if (!response.ok || !payload.post) {
      setFeedback(payload.error ?? "Не удалось сохранить черновик.");
      return false;
    }

    setTitle(payload.post.title);
    setContent(payload.post.content as RichTextDocument);
    setMediaAssets(payload.post.mediaAssets);
    setTargets(payload.post.targets);
    if (options.syncTargetDrafts) {
      setDraftTargets(buildDraftTargets(channels, payload.post.targets));
    }
    setFeedback(successMessage);
    return true;
  }

  async function refreshPost() {
    const response = await fetch(`/api/posts/${post.id}`);
    const payload = (await response.json()) as { post?: PostDetailView; error?: string };
    if (!response.ok || !payload.post) {
      setFeedback(payload.error ?? "Не удалось обновить данные поста.");
      return;
    }

    setTitle(payload.post.title);
    setContent(payload.post.content as RichTextDocument);
    setMediaAssets(payload.post.mediaAssets);
    setTargets(payload.post.targets);
    setDraftTargets(buildDraftTargets(channels, payload.post.targets));
    setFeedback("Данные поста обновлены.");
  }

  async function saveDraft() {
    setIsSaving(true);
    await persistDraft("Черновик сохранён.");
    setIsSaving(false);
  }

  async function applyPublishingPlan() {
    setIsSaving(true);
    const saved = await persistDraft("Черновик сохранён перед обновлением публикации.");
    if (!saved) {
      setIsSaving(false);
      return;
    }

    const response = await fetch(`/api/posts/${post.id}/publishTargets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        targets: channels.map((channel) => {
          const current = draftTargets[channel.id] ?? {
            mode: "DISABLED",
            scheduledAt: ""
          };

          return {
            channelId: channel.id,
            mode: current.mode,
            scheduledAt: current.mode === "SCHEDULED" ? localDatetimeToIso(current.scheduledAt) : null
          };
        })
      })
    });
    const payload = (await response.json()) as { targets?: PublishTargetView[]; error?: string };

    if (!response.ok || !payload.targets) {
      setFeedback(payload.error ?? "Не удалось обновить параметры публикации.");
      setIsSaving(false);
      return;
    }

    setTargets(payload.targets);
    setDraftTargets(buildDraftTargets(channels, payload.targets));
    setFeedback("Параметры публикации обновлены.");
    setIsSaving(false);
  }

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file);
    }

    const response = await fetch(`/api/posts/${post.id}/media`, {
      method: "POST",
      body: formData
    });
    const payload = (await response.json()) as { mediaAssets?: MediaAssetView[]; error?: string };
    if (!response.ok || !payload.mediaAssets) {
      setFeedback(payload.error ?? "Не удалось загрузить вложения.");
      setIsUploading(false);
      return;
    }

    const uploadedMedia = payload.mediaAssets;
    setMediaAssets((current) =>
      [...current, ...uploadedMedia].sort(
        (left, right) => (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER)
      )
    );
    setFeedback(`Загружено файлов: ${uploadedMedia.length}.`);
    setIsUploading(false);
    event.target.value = "";
  }

  async function removeMedia(mediaId: string) {
    const response = await fetch(`/api/posts/${post.id}/media/${mediaId}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setFeedback(payload.error ?? "Не удалось удалить вложение.");
      return;
    }

    setMediaAssets((current) => current.filter((asset) => asset.id !== mediaId));
    setFeedback("Вложение удалено.");
  }

  async function moveMedia(assetId: string, direction: "up" | "down") {
    const fromIndex = mediaAssets.findIndex((asset) => asset.id === assetId);
    if (fromIndex === -1) {
      return;
    }

    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= mediaAssets.length) {
      return;
    }

    const previousAssets = mediaAssets;
    const reordered = reorderAssets(mediaAssets, fromIndex, toIndex);
    setMediaAssets(reordered);
    setIsReorderingMedia(true);

    const response = await fetch(`/api/posts/${post.id}/media/order`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        orderedMediaIds: reordered.map((asset) => asset.id)
      })
    });
    const payload = (await response.json().catch(() => ({}))) as { mediaAssets?: MediaAssetView[]; error?: string };

    if (!response.ok || !payload.mediaAssets) {
      setMediaAssets(previousAssets);
      setFeedback(payload.error ?? "Не удалось изменить порядок вложений.");
      setIsReorderingMedia(false);
      return;
    }

    setMediaAssets(payload.mediaAssets);
    setIsReorderingMedia(false);
  }

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-6">
        <div className="app-surface-elevated rounded-[2rem] border border-line bg-panel p-6 shadow-studio">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-5xl font-semibold tracking-[-0.03em] sm:text-6xl">Редактор поста</h2>
              <label className="mt-4 block text-sm font-medium text-ink/70">Название черновика</label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-3 w-full border-none bg-transparent p-0 text-4xl font-semibold outline-none"
                placeholder="Введите название черновика"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveDraft}
                disabled={isSaving}
                className="rounded-full border border-accent bg-accent px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {isSaving ? "Сохранение..." : "Сохранить черновик"}
              </button>
              <button
                type="button"
                onClick={refreshPost}
                className="rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-medium"
              >
                Обновить данные
              </button>
            </div>
          </div>

          {feedback ? <p className="mt-4 text-sm text-ink/70">{feedback}</p> : null}
        </div>

        <section className="rounded-[2rem] border border-line bg-surface p-6">
          <h2 className="text-2xl font-semibold">Текст поста</h2>
          <p className="mt-2 text-sm text-ink/70">Горячие клавиши: Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Shift+S, Ctrl+Shift+M, Ctrl+K.</p>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0">
              <RichTextEditor content={content} onChange={setContent} emojiPacks={emojiPacks} />
            </div>

            <LivePlatformPreview
              platform={livePlatform}
              preview={previewByPlatform[livePlatform]}
              mediaAssets={mediaAssets}
              onPlatformChange={setLivePlatform}
            />
          </div>
        </section>

        <section className="rounded-[2rem] border border-line bg-surface p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-2xl font-semibold">Вложения</h2>

            <label className="inline-flex cursor-pointer rounded-full border border-line bg-surfaceSoft px-5 py-2.5 text-sm font-medium">
              {isUploading ? "Загрузка..." : "Загрузить фото / GIF / видео"}
              <input type="file" accept="image/*,video/*" multiple onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          <p className="mt-3 text-sm text-ink/65">
            Порядок карточек определяет порядок вложений в публикации. В Telegram это влияет на порядок элементов в альбоме.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {mediaAssets.map((asset, index) => (
              <div key={asset.id} className="rounded-[1.5rem] border border-line bg-surfaceSoft p-3">
                <div className="relative overflow-hidden rounded-xl">
                  {isVideoAsset(asset) ? (
                    <video src={asset.url} className="h-44 w-full object-cover" controls playsInline preload="metadata" />
                  ) : (
                    <img src={asset.url} alt={asset.originalName ?? "Вложение"} className="h-44 w-full object-cover" loading="lazy" />
                  )}
                  <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold tracking-[0.18em] text-white">
                    {getMediaBadge(asset)}
                  </span>
                </div>

                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{asset.originalName ?? "Медиафайл"}</p>
                    <p className="mt-1 font-mono text-xs text-ink/60">{Math.round(asset.size / 1024)} KB</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeMedia(asset.id)}
                    className="rounded-full border border-line bg-surface px-3 py-1 text-xs hover:border-accentWarm hover:text-accentWarm"
                  >
                    Удалить
                  </button>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => moveMedia(asset.id, "up")}
                    disabled={index === 0 || isReorderingMedia}
                    className="rounded-full border border-line bg-surface px-3 py-1 text-xs disabled:opacity-45"
                  >
                    Выше
                  </button>
                  <button
                    type="button"
                    onClick={() => moveMedia(asset.id, "down")}
                    disabled={index === mediaAssets.length - 1 || isReorderingMedia}
                    className="rounded-full border border-line bg-surface px-3 py-1 text-xs disabled:opacity-45"
                  >
                    Ниже
                  </button>
                </div>
              </div>
            ))}

            {mediaAssets.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-line bg-surfaceSoft p-8 text-sm text-ink/60">Пока нет вложений.</div>
            ) : null}
          </div>
        </section>
      </section>

      <aside className="space-y-4">
        <section className="app-surface-elevated rounded-[2rem] border border-line bg-panel p-5 shadow-studio">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">Публикация</p>
          <h2 className="mt-2 text-2xl font-semibold">Настройки по каналам</h2>
        </section>

        {channels.map((channel) => {
          const target = targets.find((item) => item.channelId === channel.id);
          const draft = draftTargets[channel.id] ?? { mode: "DISABLED", scheduledAt: "" };

          return (
            <section key={channel.id} className="rounded-[1.75rem] border border-line bg-surface p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">{channelTypeLabels[channel.type]}</p>
                  <h3 className="mt-2 text-xl font-semibold">{channel.name}</h3>
                </div>
                <StatusBadge status={(target?.status as PublishStatus | undefined) ?? "DRAFT"} />
              </div>

              <div className="mt-4 grid gap-3">
                <div className="grid gap-2 text-sm">
                  <span className="font-medium">Режим публикации</span>
                  <UiSelect
                    value={draft.mode}
                    options={publishModeOptions}
                    onChange={(nextMode) =>
                      setDraftTargets((current) => ({
                        ...current,
                        [channel.id]: {
                          ...draft,
                          mode: nextMode
                        }
                      }))
                    }
                  />
                </div>

                <div className="grid gap-2 text-sm">
                  <span className="font-medium">Дата и время</span>
                  <ScheduleDatetimePicker
                    value={draft.scheduledAt}
                    onChange={(nextDatetime) =>
                      setDraftTargets((current) => ({
                        ...current,
                        [channel.id]: {
                          ...draft,
                          mode: nextDatetime ? "SCHEDULED" : draft.mode,
                          scheduledAt: nextDatetime
                        }
                      }))
                    }
                  />
                </div>
              </div>

              {target?.lastError ? <p className="mt-3 text-sm text-rose-700">{target.lastError}</p> : null}
            </section>
          );
        })}

        <button
          type="button"
          onClick={applyPublishingPlan}
          disabled={isSaving}
          className="w-full rounded-full border border-accent bg-accent px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {isSaving ? "Сохранение..." : "Применить настройки публикации"}
        </button>
      </aside>
      </div>

      {manualConfirmationRequest ? (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-[120] w-[min(980px,calc(100%-1.5rem))] -translate-x-1/2">
          <section className="pointer-events-auto rounded-[1.4rem] border border-amber-300/45 bg-[#2f3a37]/95 p-4 text-[#f6f1da] shadow-[0_22px_60px_rgba(8,12,12,0.45)] backdrop-blur-md sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-amber-200">Требуется ручное подтверждение</p>
                <h3 className="mt-1 text-base font-semibold sm:text-lg">{manualConfirmationRequest.channelName}</h3>
                <p className="mt-2 text-sm text-[#f6f1da]/90">
                  {getManualConfirmationDescription(
                    manualConfirmationRequest.reason,
                    manualConfirmationRequest.platformLabel
                  )}
                </p>
                <p className="mt-2 max-h-10 overflow-hidden text-ellipsis text-xs text-[#f6f1da]/75">
                  {manualConfirmationRequest.errorText}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={manualConfirmationRequest.link}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-[#8ad6c0]/65 bg-[#8ad6c0]/20 px-4 py-2 text-sm font-medium text-[#d6fff4] transition-all duration-200 hover:bg-[#8ad6c0]/30"
                >
                  Открыть
                </a>
                <button
                  type="button"
                  onClick={refreshPost}
                  disabled={isSaving}
                  className="rounded-full border border-amber-200/45 bg-transparent px-4 py-2 text-sm font-medium text-amber-100 transition-all duration-200 hover:bg-amber-200/12"
                >
                  Проверить снова
                </button>
                <button
                  type="button"
                  onClick={applyPublishingPlan}
                  disabled={isSaving}
                  className="rounded-full border border-[#8ad6c0]/65 bg-[#8ad6c0]/20 px-4 py-2 text-sm font-medium text-[#d6fff4] transition-all duration-200 hover:bg-[#8ad6c0]/30 disabled:opacity-60"
                >
                  {isSaving ? "Отправка..." : "Повторить публикацию"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowInlineVerificationFrame((current) => !current)}
                  disabled={isSaving}
                  className="rounded-full border border-amber-200/45 bg-transparent px-4 py-2 text-sm font-medium text-amber-100 transition-all duration-200 hover:bg-amber-200/12"
                >
                  {showInlineVerificationFrame ? "Скрыть окно" : "Показать окно"}
                </button>
              </div>
            </div>

            {showInlineVerificationFrame ? (
              <div className="mt-4 overflow-hidden rounded-xl border border-amber-200/25 bg-black/15">
                <iframe
                  src={manualConfirmationRequest.link}
                  title="Ручное подтверждение"
                  className="h-[320px] w-full"
                  loading="lazy"
                />
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
