import { parseChannelConfig, type MediaUploadDescriptor, type TelegramChannelConfig } from "@multipost/core";
import { ConnectorError, type ChannelConnector, type PublishConnectorResult, type TestConnectorResult } from "./types";
import { ensureVisualMedia, fileToBlob, parseResponseBody, withRetries } from "./utils";

type TelegramApiResponse<T> =
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

type TelegramMessage = {
  message_id: number;
};

type TelegramInputMedia =
  | {
      type: "photo";
      media: string;
      caption?: string;
      parse_mode?: "HTML";
    }
  | {
      type: "video";
      media: string;
      caption?: string;
      parse_mode?: "HTML";
      supports_streaming?: boolean;
    };

function normalizeTelegramHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isGif(media: MediaUploadDescriptor): boolean {
  return media.mimeType.toLowerCase() === "image/gif";
}

function isVideo(media: MediaUploadDescriptor): boolean {
  return media.kind === "video" || media.mimeType.toLowerCase().startsWith("video/");
}

function getCaption(renderBody: string): { caption?: string; overflowText?: string } {
  if (renderBody.length <= 1_024) {
    return {
      caption: renderBody
    };
  }

  return {
    caption: undefined,
    overflowText: renderBody
  };
}

function isFrozenMethodInvalidError(error: unknown): boolean {
  if (!(error instanceof ConnectorError)) {
    return false;
  }

  return error.message.toUpperCase().includes("FROZEN_METHOD_INVALID");
}

async function callTelegram<T>(config: TelegramChannelConfig, method: string, init: RequestInit): Promise<T> {
  return withRetries(
    async () => {
      const response = await fetch(`https://api.telegram.org/bot${config.botToken}/${method}`, init);
      const payload = (await parseResponseBody(response)) as TelegramApiResponse<T> | unknown;
      const telegramError =
        payload && typeof payload === "object" && "description" in payload
          ? String((payload as { description?: unknown }).description ?? "")
          : null;
      const retryAfterSeconds =
        payload && typeof payload === "object" && "parameters" in payload
          ? (payload as { parameters?: { retry_after?: unknown } }).parameters?.retry_after
          : undefined;

      if (!response.ok) {
        throw new ConnectorError(
          telegramError
            ? `Telegram ${method}: ${telegramError}`
            : `Telegram ${method} failed with HTTP ${response.status}.`,
          {
            retryable: response.status === 429 || response.status >= 500,
            retryAfterMs: typeof retryAfterSeconds === "number" ? retryAfterSeconds * 1000 : undefined,
            details: payload
          }
        );
      }

      if (!payload || typeof payload !== "object" || !("ok" in payload)) {
        throw new ConnectorError(`Telegram ${method} returned an unexpected response.`, {
          retryable: false,
          details: payload
        });
      }

      if (!payload.ok) {
        throw new ConnectorError(payload.description, {
          retryable: payload.error_code === 429 || payload.error_code >= 500,
          retryAfterMs: payload.parameters?.retry_after ? payload.parameters.retry_after * 1000 : undefined,
          code: String(payload.error_code),
          details: payload
        });
      }

      return payload.result;
    },
    {
      attempts: 5,
      baseDelayMs: 1_000
    }
  );
}

async function sendText(config: TelegramChannelConfig, text: string): Promise<TelegramMessage> {
  const normalizedText = normalizeTelegramHtml(text);

  return callTelegram<TelegramMessage>(config, "sendMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: config.chatId,
      text: normalizedText,
      parse_mode: "HTML",
      disable_web_page_preview: false
    })
  });
}

async function sendPhoto(config: TelegramChannelConfig, photo: Blob, filename: string, caption?: string): Promise<TelegramMessage> {
  const body = new FormData();
  body.append("chat_id", config.chatId);
  body.append("photo", photo, filename);
  if (caption) {
    body.append("caption", normalizeTelegramHtml(caption));
    body.append("parse_mode", "HTML");
  }

  return callTelegram<TelegramMessage>(config, "sendPhoto", {
    method: "POST",
    body
  });
}

async function sendVideo(config: TelegramChannelConfig, video: Blob, filename: string, caption?: string): Promise<TelegramMessage> {
  const body = new FormData();
  body.append("chat_id", config.chatId);
  body.append("video", video, filename);
  body.append("supports_streaming", "true");
  if (caption) {
    body.append("caption", normalizeTelegramHtml(caption));
    body.append("parse_mode", "HTML");
  }

  return callTelegram<TelegramMessage>(config, "sendVideo", {
    method: "POST",
    body
  });
}

async function sendAnimation(
  config: TelegramChannelConfig,
  animation: Blob,
  filename: string,
  caption?: string
): Promise<TelegramMessage> {
  const body = new FormData();
  body.append("chat_id", config.chatId);
  body.append("animation", animation, filename);
  if (caption) {
    body.append("caption", normalizeTelegramHtml(caption));
    body.append("parse_mode", "HTML");
  }

  return callTelegram<TelegramMessage>(config, "sendAnimation", {
    method: "POST",
    body
  });
}

async function sendMediaGroup(
  config: TelegramChannelConfig,
  items: Array<{
    blob: Blob;
    filename: string;
    type: "photo" | "video";
  }>,
  caption?: string
): Promise<TelegramMessage[]> {
  const normalizedCaption = caption ? normalizeTelegramHtml(caption) : undefined;
  const media: TelegramInputMedia[] = items.map((item, index) => {
    const common = {
      media: `attach://file_${index}`,
      ...(index === 0 && normalizedCaption
        ? {
            caption: normalizedCaption,
            parse_mode: "HTML" as const
          }
        : {})
    };

    if (item.type === "photo") {
      return {
        type: "photo",
        ...common
      };
    }

    return {
      type: "video",
      supports_streaming: true,
      ...common
    };
  });

  const body = new FormData();
  body.append("chat_id", config.chatId);
  body.append("media", JSON.stringify(media));

  items.forEach((item, index) => {
    body.append(`file_${index}`, item.blob, item.filename);
  });

  return callTelegram<TelegramMessage[]>(config, "sendMediaGroup", {
    method: "POST",
    body
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function getTelegramConfig(input: unknown): TelegramChannelConfig {
  return parseChannelConfig("TELEGRAM_CHANNEL", input);
}

export const telegramConnector: ChannelConnector<"TELEGRAM_CHANNEL"> = {
  type: "TELEGRAM_CHANNEL",

  async test({ channel }): Promise<TestConnectorResult> {
    const config = getTelegramConfig(channel.config);
    const result = await sendText(
      config,
      `<b>MultiPost test</b>\nChannel: ${channel.name}\nTime: ${new Date().toISOString()}`
    );

    return {
      message: "Telegram test message sent.",
      externalIds: {
        messageId: result.message_id
      },
      requestPayload: {
        chatId: config.chatId,
        method: "sendMessage"
      },
      responsePayload: result
    };
  },

  async publish({ channel, render, media, storage }): Promise<PublishConnectorResult> {
    const config = getTelegramConfig(channel.config);
    const assets = ensureVisualMedia(media, "Telegram");
    const { caption, overflowText } = getCaption(render.body);
    const responses: unknown[] = [];
    const messageIds: number[] = [];
    let hasCaptionBeenSent = false;

    if (assets.length === 0) {
      const result = await sendText(config, render.body);
      responses.push(result);
      messageIds.push(result.message_id);
      hasCaptionBeenSent = true;
    } else {
      const nonGifAlbumItems = await Promise.all(
        assets
          .filter((asset) => !isGif(asset))
          .map(async (asset) => ({
            blob: await fileToBlob(storage, asset),
            filename: asset.originalName ?? (isVideo(asset) ? "video.mp4" : "image.jpg"),
            type: isVideo(asset) ? "video" : "photo"
          }))
      );

      const gifItems = assets.filter((asset) => isGif(asset));

      if (nonGifAlbumItems.length === 1) {
        const [single] = nonGifAlbumItems;
        if (!single) {
          throw new ConnectorError("Telegram media item is unexpectedly empty.");
        }

        const result =
          single.type === "video"
            ? await sendVideo(config, single.blob, single.filename, caption)
            : await sendPhoto(config, single.blob, single.filename, caption);

        responses.push(result);
        messageIds.push(result.message_id);
        hasCaptionBeenSent = Boolean(caption);
      } else if (nonGifAlbumItems.length > 1) {
        const albumChunks = chunk(nonGifAlbumItems, 10);

        for (let chunkIndex = 0; chunkIndex < albumChunks.length; chunkIndex += 1) {
          const albumChunk = albumChunks[chunkIndex];
          if (!albumChunk) {
            continue;
          }

          try {
            const album = await sendMediaGroup(config, albumChunk, chunkIndex === 0 ? caption : undefined);
            responses.push(album);
            messageIds.push(...album.map((item) => item.message_id));
          } catch (error) {
            if (!isFrozenMethodInvalidError(error)) {
              throw error;
            }

            // Fallback for Telegram frozen media-group method: send remaining media one-by-one.
            const remainingItems = nonGifAlbumItems.slice(chunkIndex * 10);
            for (let itemIndex = 0; itemIndex < remainingItems.length; itemIndex += 1) {
              const item = remainingItems[itemIndex];
              if (!item) {
                continue;
              }

              const fallbackCaption = !hasCaptionBeenSent && chunkIndex === 0 && itemIndex === 0 ? caption : undefined;
              const result =
                item.type === "video"
                  ? await sendVideo(config, item.blob, item.filename, fallbackCaption)
                  : await sendPhoto(config, item.blob, item.filename, fallbackCaption);

              responses.push(result);
              messageIds.push(result.message_id);
              if (fallbackCaption) {
                hasCaptionBeenSent = true;
              }
            }

            break;
          }
        }

        if (!hasCaptionBeenSent) {
          hasCaptionBeenSent = Boolean(caption);
        }
      }

      for (const gifAsset of gifItems) {
        const gifBlob = await fileToBlob(storage, gifAsset);
        const gifCaption = !hasCaptionBeenSent ? caption : undefined;
        const result = await sendAnimation(config, gifBlob, gifAsset.originalName ?? "animation.gif", gifCaption);
        responses.push(result);
        messageIds.push(result.message_id);
        if (gifCaption) {
          hasCaptionBeenSent = true;
        }
      }

      if (!hasCaptionBeenSent && caption) {
        const result = await sendText(config, caption);
        responses.push(result);
        messageIds.push(result.message_id);
        hasCaptionBeenSent = true;
      }
    }

    if (overflowText) {
      const overflowResult = await sendText(config, overflowText);
      responses.push(overflowResult);
      messageIds.push(overflowResult.message_id);
    }

    return {
      externalIds: {
        messageIds,
        firstMessageId: messageIds[0]
      },
      requestPayload: {
        chatId: config.chatId,
        mediaCount: assets.length
      },
      responsePayload: responses
    };
  }
};
