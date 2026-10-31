import path from "node:path";
import { ConnectorError } from "@multipost/connectors/types";
import type { Channel } from "@multipost/db";
import { prisma } from "@multipost/db";
import { type TelegramChannelConfig } from "@multipost/core";
import { decryptChannelRecord, getStorage } from "./server";

type TelegramBotResponse<T> =
  | {
      ok: true;
      result: T;
    }
  | {
      ok: false;
      error_code: number;
      description: string;
      parameters?: {
        retry_after?: number;
      };
    };

type TelegramPhotoSize = {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
};

type TelegramSticker = {
  file_id: string;
  file_unique_id: string;
  width?: number;
  height?: number;
  is_animated?: boolean;
  is_video?: boolean;
  thumbnail?: TelegramPhotoSize;
  emoji?: string;
  set_name?: string;
  custom_emoji_id?: string;
  needs_repainting?: boolean;
};

type TelegramStickerSet = {
  name: string;
  title: string;
  sticker_type?: string;
  stickers: TelegramSticker[];
};

type TelegramFile = {
  file_id: string;
  file_unique_id?: string;
  file_path?: string;
};

function parseTelegramResponse<T>(payload: unknown, method: string): T {
  if (!payload || typeof payload !== "object" || !("ok" in payload)) {
    throw new ConnectorError(`Telegram ${method} вернул неожиданный ответ.`, {
      details: payload
    });
  }

  const telegramPayload = payload as TelegramBotResponse<T>;
  if (!telegramPayload.ok) {
    throw new ConnectorError(`Telegram ${method}: ${telegramPayload.description}`, {
      retryable: telegramPayload.error_code === 429 || telegramPayload.error_code >= 500,
      retryAfterMs: telegramPayload.parameters?.retry_after ? telegramPayload.parameters.retry_after * 1000 : undefined,
      code: String(telegramPayload.error_code),
      details: telegramPayload
    });
  }

  return telegramPayload.result;
}

async function callTelegram<T>(
  config: TelegramChannelConfig,
  method: string,
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${config.botToken}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const parsed = parseTelegramResponse<T>(payload, method);
    return parsed;
  }

  return parseTelegramResponse<T>(payload, method);
}

function inferMimeType(filePath: string): string | null {
  const normalized = filePath.toLowerCase();

  if (normalized.endsWith(".webp")) {
    return "image/webp";
  }

  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (normalized.endsWith(".png")) {
    return "image/png";
  }

  if (normalized.endsWith(".webm")) {
    return "video/webm";
  }

  if (normalized.endsWith(".gif")) {
    return "image/gif";
  }

  if (normalized.endsWith(".tgs")) {
    return "application/x-tgsticker";
  }

  return null;
}

function normalizePackUrl(setName: string): string {
  return `https://t.me/addemoji/${setName}`;
}

export function parseTelegramEmojiPackSource(input: string): {
  setName: string;
  sourceUrl: string;
} {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new ConnectorError("Укажите ссылку на набор или short name.", {
      code: "INVALID_EMOJI_PACK_SOURCE"
    });
  }

  const candidate = trimmed.replace(/^@/, "");

  try {
    const parsed = new URL(candidate.startsWith("http") ? candidate : `https://${candidate}`);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const prefix = segments[0]?.toLowerCase();
    const setName = segments[1];

    if ((prefix === "addemoji" || prefix === "addstickers") && setName) {
      return {
        setName,
        sourceUrl: normalizePackUrl(setName)
      };
    }
  } catch {
    // Fall back to short name parsing below.
  }

  if (!/^[a-zA-Z0-9_]{3,128}$/.test(candidate)) {
    throw new ConnectorError("Не удалось распознать ссылку на набор emoji. Используйте t.me/addemoji/... или short name.", {
      code: "INVALID_EMOJI_PACK_SOURCE"
    });
  }

  return {
    setName: candidate,
    sourceUrl: normalizePackUrl(candidate)
  };
}

function selectPreviewFileId(sticker: TelegramSticker): string | null {
  if (sticker.thumbnail?.file_id) {
    return sticker.thumbnail.file_id;
  }

  if (sticker.is_video || !sticker.is_animated) {
    return sticker.file_id;
  }

  return null;
}

async function downloadPreviewAsset(
  config: TelegramChannelConfig,
  sticker: TelegramSticker
): Promise<{
  previewPath: string | null;
  previewMimeType: string | null;
}> {
  const previewFileId = selectPreviewFileId(sticker);
  if (!previewFileId) {
    return {
      previewPath: null,
      previewMimeType: null
    };
  }

  try {
    const file = await callTelegram<TelegramFile>(config, "getFile", {
      file_id: previewFileId
    });

    if (!file.file_path) {
      return {
        previewPath: null,
        previewMimeType: null
      };
    }

    const mimeType = inferMimeType(file.file_path);
    if (!mimeType || mimeType === "application/x-tgsticker") {
      return {
        previewPath: null,
        previewMimeType: null
      };
    }

    const response = await fetch(`https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`);
    if (!response.ok) {
      throw new ConnectorError(`Не удалось скачать preview-файл Telegram: HTTP ${response.status}.`, {
        retryable: response.status === 429 || response.status >= 500
      });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const stored = await getStorage().saveFile({
      originalName: path.basename(file.file_path),
      mimeType,
      buffer
    });

    return {
      previewPath: stored.relativePath,
      previewMimeType: stored.mimeType
    };
  } catch (error) {
    console.warn("[telegram-emoji] preview download failed", {
      customEmojiId: sticker.custom_emoji_id,
      error
    });

    return {
      previewPath: null,
      previewMimeType: null
    };
  }
}

async function resolveTelegramChannel(channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: {
      id: channelId
    }
  });

  if (!channel) {
    throw new ConnectorError("Telegram-канал для импорта не найден.", {
      code: "TELEGRAM_CHANNEL_NOT_FOUND"
    });
  }

  if (channel.type !== "TELEGRAM_CHANNEL") {
    throw new ConnectorError("Для импорта emoji pack нужен именно Telegram-канал.", {
      code: "INVALID_IMPORT_CHANNEL"
    });
  }

  return channel;
}

export async function importTelegramEmojiPack(input: {
  telegramChannelId: string;
  source: string;
}) {
  const channel = (await resolveTelegramChannel(input.telegramChannelId)) as Channel;
  const decryptedChannel = decryptChannelRecord(channel);
  const config = decryptedChannel.config as TelegramChannelConfig;
  const parsedSource = parseTelegramEmojiPackSource(input.source);
  const stickerSet = await callTelegram<TelegramStickerSet>(config, "getStickerSet", {
    name: parsedSource.setName
  });

  if (stickerSet.sticker_type !== "custom_emoji") {
    throw new ConnectorError("Этот набор не является набором кастомных emoji Telegram.", {
      code: "NOT_CUSTOM_EMOJI_PACK"
    });
  }

  const pack = await prisma.telegramEmojiPack.upsert({
    where: {
      setName: stickerSet.name
    },
    update: {
      title: stickerSet.title,
      sourceUrl: parsedSource.sourceUrl,
      stickerType: stickerSet.sticker_type ?? "custom_emoji",
      importedAt: new Date()
    },
    create: {
      setName: stickerSet.name,
      title: stickerSet.title,
      sourceUrl: parsedSource.sourceUrl,
      stickerType: stickerSet.sticker_type ?? "custom_emoji"
    }
  });

  const seenCustomEmojiIds: string[] = [];

  for (const [index, sticker] of stickerSet.stickers.entries()) {
    if (!sticker.custom_emoji_id) {
      continue;
    }

    const preview = await downloadPreviewAsset(config, sticker);
    await prisma.telegramEmoji.upsert({
      where: {
        customEmojiId: sticker.custom_emoji_id
      },
      update: {
        packId: pack.id,
        emoji: sticker.emoji ?? "🙂",
        telegramFileId: sticker.file_id,
        telegramFileUniqueId: sticker.file_unique_id,
        previewPath: preview.previewPath,
        previewMimeType: preview.previewMimeType,
        width: sticker.width ?? null,
        height: sticker.height ?? null,
        isAnimated: Boolean(sticker.is_animated),
        isVideo: Boolean(sticker.is_video),
        needsRepainting: Boolean(sticker.needs_repainting),
        sortOrder: index
      },
      create: {
        packId: pack.id,
        customEmojiId: sticker.custom_emoji_id,
        emoji: sticker.emoji ?? "🙂",
        telegramFileId: sticker.file_id,
        telegramFileUniqueId: sticker.file_unique_id,
        previewPath: preview.previewPath,
        previewMimeType: preview.previewMimeType,
        width: sticker.width ?? null,
        height: sticker.height ?? null,
        isAnimated: Boolean(sticker.is_animated),
        isVideo: Boolean(sticker.is_video),
        needsRepainting: Boolean(sticker.needs_repainting),
        sortOrder: index
      }
    });

    seenCustomEmojiIds.push(sticker.custom_emoji_id);
  }

  await prisma.telegramEmoji.deleteMany({
    where: {
      packId: pack.id,
      ...(seenCustomEmojiIds.length > 0
        ? {
            customEmojiId: {
              notIn: seenCustomEmojiIds
            }
          }
        : {})
    }
  });

  return prisma.telegramEmojiPack.findUniqueOrThrow({
    where: {
      id: pack.id
    },
    include: {
      emojis: {
        orderBy: [
          {
            sortOrder: "asc"
          },
          {
            createdAt: "asc"
          }
        ]
      }
    }
  });
}

export async function deleteTelegramEmojiPack(packId: string) {
  const pack = await prisma.telegramEmojiPack.findUnique({
    where: {
      id: packId
    },
    include: {
      emojis: {
        select: {
          previewPath: true
        }
      }
    }
  });

  if (!pack) {
    return;
  }

  const previewPaths = [...new Set(pack.emojis.map((emoji) => emoji.previewPath).filter((path): path is string => Boolean(path)))];

  for (const previewPath of previewPaths) {
    await getStorage().deleteFile(previewPath);
  }

  await prisma.telegramEmojiPack.delete({
    where: {
      id: packId
    }
  });
}
