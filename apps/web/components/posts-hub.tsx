"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { PublishStatus, RichTextDocument } from "@multipost/core";
import { renderAllPlatforms, type PlatformRenderResult } from "@multipost/renderers";
import type { MediaAssetView, PostDetailView, PostSummaryView } from "../lib/server";
import { StatusBadge } from "./status-badge";
import { UiConfirmDialog } from "./ui-confirm-dialog";

type PreviewPlatform = PlatformRenderResult["platform"];

function getMediaBadge(asset: MediaAssetView): string {
  if (asset.kind === "video") {
    return "VIDEO";
  }

  if (asset.mimeType.toLowerCase() === "image/gif") {
    return "GIF";
  }

  return asset.mimeType.split("/")[1]?.toUpperCase() ?? "MEDIA";
}

function isVideoAsset(asset: MediaAssetView): boolean {
  return asset.kind === "video" || asset.mimeType.toLowerCase().startsWith("video/");
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={clsx(
        "h-4 w-4 text-ink/80 transition-transform duration-300 ease-out group-hover:text-accent",
        expanded ? "rotate-180" : "rotate-0"
      )}
      aria-hidden
    >
      <path d="M4.5 7.5L10 13l5.5-5.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PostsHub({ initialPosts }: { initialPosts: PostSummaryView[] }) {
  const router = useRouter();
  const [posts, setPosts] = useState(initialPosts);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [detailsByPostId, setDetailsByPostId] = useState<Record<string, PostDetailView>>({});
  const [loadingPreviewByPostId, setLoadingPreviewByPostId] = useState<Record<string, boolean>>({});
  const [previewErrorByPostId, setPreviewErrorByPostId] = useState<Record<string, string>>({});
  const [platformByPostId, setPlatformByPostId] = useState<Record<string, PreviewPlatform>>({});
  const [deleteIntent, setDeleteIntent] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    setPosts(initialPosts);
  }, [initialPosts]);

  async function handleDelete(postId: string, title: string) {
    if (deletingPostId === postId) {
      return;
    }

    setDeletingPostId(postId);
    setFeedback(null);

    const response = await fetch(`/api/posts/${postId}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setFeedback(payload.error ?? "Не удалось удалить черновик.");
      setDeletingPostId(null);
      return;
    }

    setPosts((current) => current.filter((post) => post.id !== postId));
    setDeletingPostId(null);
    setExpandedPostId((current) => (current === postId ? null : current));
    setFeedback(`Черновик "${title}" удален.`);
    startTransition(() => {
      router.refresh();
    });
  }

  async function ensurePostDetail(postId: string) {
    if (detailsByPostId[postId] || loadingPreviewByPostId[postId]) {
      return;
    }

    setLoadingPreviewByPostId((current) => ({
      ...current,
      [postId]: true
    }));
    setPreviewErrorByPostId((current) => ({
      ...current,
      [postId]: ""
    }));

    const response = await fetch(`/api/posts/${postId}`);
    const payload = (await response.json().catch(() => ({}))) as { post?: PostDetailView; error?: string };

    if (!response.ok || !payload.post) {
      setPreviewErrorByPostId((current) => ({
        ...current,
        [postId]: payload.error ?? "Не удалось загрузить предпросмотр."
      }));
      setLoadingPreviewByPostId((current) => ({
        ...current,
        [postId]: false
      }));
      return;
    }

    setDetailsByPostId((current) => ({
      ...current,
      [postId]: payload.post
    }));
    setLoadingPreviewByPostId((current) => ({
      ...current,
      [postId]: false
    }));
  }

  async function togglePreview(postId: string) {
    if (expandedPostId === postId) {
      setExpandedPostId(null);
      return;
    }

    setExpandedPostId(postId);
    setPlatformByPostId((current) => ({
      ...current,
      [postId]: current[postId] ?? "telegram"
    }));

    await ensurePostDetail(postId);
  }

  function renderPreview(postId: string) {
    const detail = detailsByPostId[postId];
    const isLoading = loadingPreviewByPostId[postId];
    const error = previewErrorByPostId[postId];
    const selectedPlatform = platformByPostId[postId] ?? "telegram";

    if (isLoading && !detail) {
      return <div className="rounded-[1.25rem] border border-line bg-surfaceSoft p-4 text-sm text-ink/70">Загружаю предпросмотр...</div>;
    }

    if (error && !detail) {
      return <div className="rounded-[1.25rem] border border-rose-300/50 bg-rose-100/40 p-4 text-sm text-rose-700">{error}</div>;
    }

    if (!detail) {
      return null;
    }

    const previews = renderAllPlatforms(detail.content as RichTextDocument, detail.mediaAssets);
    const previewMap = Object.fromEntries(previews.map((preview) => [preview.platform, preview])) as Record<
      PreviewPlatform,
      PlatformRenderResult
    >;
    const preview = previewMap[selectedPlatform];

    return (
      <div className="rounded-[1.4rem] border border-line bg-surfaceSoft p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium">Быстрый предпросмотр</p>
          <div className="flex flex-wrap gap-2">
            {(["telegram", "max", "vk"] as PreviewPlatform[]).map((platformOption) => (
              <button
                key={platformOption}
                type="button"
                onClick={() =>
                  setPlatformByPostId((current) => ({
                    ...current,
                    [postId]: platformOption
                  }))
                }
                className={clsx(
                  "rounded-full border px-3 py-1 text-xs uppercase tracking-[0.14em] transition-all duration-300 ease-out",
                  selectedPlatform === platformOption
                    ? "border-accent bg-accent text-white shadow-[0_8px_18px_rgba(15,139,109,0.28)]"
                    : "border-line bg-surface text-ink/80 hover:border-accent/40 hover:bg-surfaceSoft"
                )}
              >
                {platformOption === "telegram" ? "Telegram" : platformOption === "max" ? "MAX" : "VK"}
              </button>
            ))}
          </div>
        </div>

        {detail.mediaAssets.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            {detail.mediaAssets.map((asset) => (
              <div key={asset.id} className="relative overflow-hidden rounded-xl border border-line/70 bg-canvas/40">
                {isVideoAsset(asset) ? (
                  <video src={asset.url} className="h-24 w-full object-cover" muted playsInline preload="metadata" controls={false} />
                ) : (
                  <img src={asset.url} alt={asset.originalName ?? "Вложение"} className="h-24 w-full object-cover" loading="lazy" />
                )}
                <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-white">
                  {getMediaBadge(asset)}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <div className={clsx("mt-4 rounded-[1rem] border p-4", selectedPlatform === "vk" ? "border-[#d7e0e8] bg-white" : "border-line bg-surface")}>
          <div
            className={clsx(
              "live-preview-body",
              selectedPlatform === "telegram" && "telegram-live-body",
              selectedPlatform === "max" && "live-preview-body--max",
              selectedPlatform === "vk" && "live-preview-body--vk"
            )}
            dangerouslySetInnerHTML={{
              __html: preview.previewHtml || "<p><em>Текст поста пока пуст.</em></p>"
            }}
          />
        </div>
      </div>
    );
  }

  const hasPosts = useMemo(() => posts.length > 0, [posts]);

  return (
    <div className="space-y-4">
      {feedback ? <p className="text-sm text-ink/70">{feedback}</p> : null}

      {posts.map((post) => {
        const isExpanded = expandedPostId === post.id;
        return (
          <article key={post.id} className="rounded-[1.75rem] border border-line bg-surface p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/40">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <Link href={`/posts/${post.id}`} className="block">
                  <h3 className="text-xl font-semibold">{post.title}</h3>
                  <p className="mt-2 text-sm text-ink/70">Обновлено {new Date(post.updatedAt).toLocaleString()}</p>
                </Link>
              </div>

              <div className="flex flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteIntent({ id: post.id, title: post.title })}
                  disabled={deletingPostId === post.id}
                  className="rounded-full border border-line px-4 py-2 text-sm transition hover:border-accentWarm hover:text-accentWarm disabled:opacity-60"
                >
                  {deletingPostId === post.id ? "Удаление..." : "Удалить"}
                </button>

                <button
                  type="button"
                  onClick={() => void togglePreview(post.id)}
                  aria-label={isExpanded ? "Скрыть предпросмотр" : "Показать предпросмотр"}
                  className="group relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-gradient-to-b from-surface to-surfaceSoft shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-accent/55 hover:shadow-[0_10px_24px_rgba(0,0,0,0.18)]"
                >
                  <ChevronIcon expanded={isExpanded} />
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {post.targets.length > 0 ? (
                post.targets.map((target) => (
                  <div key={target.id} className="flex items-center gap-2 rounded-full border border-line bg-surfaceSoft px-3 py-1.5">
                    <span className="text-xs font-medium">{target.channelName ?? "Неизвестный канал"}</span>
                    <StatusBadge status={target.status as PublishStatus} />
                  </div>
                ))
              ) : (
                <span className="rounded-full border border-line bg-surfaceSoft px-3 py-1.5 text-xs text-ink/60">Каналы публикации не настроены</span>
              )}
            </div>

            <div className="post-preview-reveal mt-4" data-open={isExpanded ? "true" : "false"}>
              <div className="post-preview-reveal__inner">{renderPreview(post.id)}</div>
            </div>
          </article>
        );
      })}

      {!hasPosts ? (
        <div className="rounded-[1.75rem] border border-dashed border-line bg-surfaceSoft p-8 text-center text-sm text-ink/70">
          По текущим фильтрам ничего не найдено.
        </div>
      ) : null}

      <UiConfirmDialog
        isOpen={deleteIntent !== null}
        title={deleteIntent ? `Удалить черновик "${deleteIntent.title}"?` : "Удалить черновик?"}
        description="Публикационные статусы и логи этого поста тоже будут удалены."
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        destructive
        onCancel={() => setDeleteIntent(null)}
        onConfirm={() => {
          if (!deleteIntent) {
            return;
          }

          void handleDelete(deleteIntent.id, deleteIntent.title);
          setDeleteIntent(null);
        }}
      />
    </div>
  );
}
