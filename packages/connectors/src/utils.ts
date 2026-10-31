import { sleep, type LocalFileStorage, type MediaUploadDescriptor } from "@multipost/core";
import { ConnectorError } from "./types";

export async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function fileToBlob(storage: LocalFileStorage, media: MediaUploadDescriptor): Promise<Blob> {
  const buffer = await storage.readFile(media.localPath);
  return new Blob([buffer], {
    type: media.mimeType || "application/octet-stream"
  });
}

export async function withRetries<T>(
  action: (attempt: number) => Promise<T>,
  options: {
    attempts: number;
    baseDelayMs: number;
  }
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < options.attempts) {
    try {
      return await action(attempt);
    } catch (error) {
      lastError = error;
      if (!(error instanceof ConnectorError) || !error.retryable || attempt === options.attempts - 1) {
        throw error;
      }

      const delay = error.retryAfterMs ?? options.baseDelayMs * 2 ** attempt;
      await sleep(delay);
      attempt += 1;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Retry loop failed");
}

export function ensureImageOnly(media: MediaUploadDescriptor[], platform: string): MediaUploadDescriptor[] {
  const nonImages = media.filter((item) => item.kind !== "image");
  if (nonImages.length > 0) {
    throw new ConnectorError(`${platform} connector currently supports images only.`, {
      code: "UNSUPPORTED_MEDIA"
    });
  }

  return media;
}

export function ensureVisualMedia(media: MediaUploadDescriptor[], platform: string): MediaUploadDescriptor[] {
  const unsupported = media.filter((item) => item.kind !== "image" && item.kind !== "video");
  if (unsupported.length > 0) {
    throw new ConnectorError(`${platform} connector currently supports only image/video/gif media.`, {
      code: "UNSUPPORTED_MEDIA",
      details: unsupported.map((item) => ({
        id: item.id,
        kind: item.kind,
        mimeType: item.mimeType
      }))
    });
  }

  return media;
}

export function splitVisualMedia(media: MediaUploadDescriptor[]) {
  const items = [...media];

  const gifs = items.filter((item) => item.mimeType.toLowerCase() === "image/gif");
  const videos = items.filter((item) => item.kind === "video" || item.mimeType.toLowerCase().startsWith("video/"));
  const images = items.filter((item) => item.kind === "image" && item.mimeType.toLowerCase() !== "image/gif");

  return {
    gifs,
    videos,
    images
  };
}

export function pickObjectValue<T = string>(input: unknown, keys: string[]): T | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }

  for (const key of keys) {
    if (key in input) {
      return (input as Record<string, T>)[key];
    }
  }

  return undefined;
}
