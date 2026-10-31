import { parseChannelConfig, type LocalFileStorage, type MaxChannelConfig, type MediaUploadDescriptor } from "@multipost/core";
import { ConnectorError, type ChannelConnector, type PublishConnectorResult, type TestConnectorResult } from "./types";
import { ensureVisualMedia, fileToBlob, parseResponseBody, pickObjectValue, withRetries } from "./utils";

const MAX_API_BASE = "https://platform-api.max.ru";

type MaxUploadType = "image" | "video" | "file";

function resolveUploadType(media: MediaUploadDescriptor): MaxUploadType {
  if (media.kind === "video" || media.mimeType.toLowerCase().startsWith("video/")) {
    return "video";
  }

  if (media.kind === "image") {
    return "image";
  }

  return "file";
}

async function maxRequest<T>(config: MaxChannelConfig, path: string, init: RequestInit): Promise<T> {
  return withRetries(
    async () => {
      const response = await fetch(`${MAX_API_BASE}${path}`, {
        ...init,
        headers: {
          Authorization: config.accessToken,
          ...(init.headers ?? {})
        }
      });
      const payload = (await parseResponseBody(response)) as Record<string, unknown> | string | null;

      if (!response.ok) {
        const code = typeof payload === "object" ? pickObjectValue<string>(payload, ["code", "error_code", "reason"]) : undefined;
        throw new ConnectorError(`MAX request failed with HTTP ${response.status}.`, {
          retryable: response.status === 429 || response.status >= 500 || code === "attachment.not.ready",
          code,
          details: payload
        });
      }

      return payload as T;
    },
    {
      attempts: 5,
      baseDelayMs: 1_500
    }
  );
}

async function uploadMedia(
  config: MaxChannelConfig,
  storage: LocalFileStorage,
  media: MediaUploadDescriptor
): Promise<{ type: MaxUploadType; payload: unknown }> {
  const uploadType = resolveUploadType(media);
  const uploadInit = await maxRequest<Record<string, unknown>>(config, `/uploads?type=${uploadType}`, {
    method: "POST"
  });

  const uploadUrl =
    pickObjectValue<string>(uploadInit, ["url", "upload_url"]) ??
    pickObjectValue<string>(uploadInit, ["href"]);

  if (!uploadUrl) {
    throw new ConnectorError("MAX upload endpoint did not return an upload URL.", {
      details: uploadInit
    });
  }

  const formData = new FormData();
  formData.append("data", await fileToBlob(storage, media), media.originalName ?? `upload.${uploadType}`);

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    body: formData,
    headers: {
      Authorization: config.accessToken
    }
  });
  const uploadPayload = await parseResponseBody(uploadResponse);

  if (!uploadResponse.ok) {
    throw new ConnectorError(`MAX upload failed with HTTP ${uploadResponse.status}.`, {
      retryable: uploadResponse.status === 429 || uploadResponse.status >= 500,
      details: uploadPayload
    });
  }

  return {
    type: uploadType,
    payload: uploadPayload
  };
}

function getMaxConfig(input: unknown): MaxChannelConfig {
  return parseChannelConfig("MAX_CHAT", input);
}

export const maxConnector: ChannelConnector<"MAX_CHAT"> = {
  type: "MAX_CHAT",

  async test({ channel }): Promise<TestConnectorResult> {
    const config = getMaxConfig(channel.config);
    const payload = {
      text: `*MultiPost test*\nChannel: ${channel.name}\nTime: ${new Date().toISOString()}`,
      format: "markdown"
    };

    const response = await maxRequest<Record<string, unknown>>(config, `/messages?chat_id=${encodeURIComponent(config.chatId)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    return {
      message: "MAX test message sent.",
      externalIds: {
        messageId: pickObjectValue(response, ["message_id", "mid"]) ?? pickObjectValue(response, ["id"])
      },
      requestPayload: payload,
      responsePayload: response
    };
  },

  async publish({ channel, render, media, storage }): Promise<PublishConnectorResult> {
    const config = getMaxConfig(channel.config);
    const assets = ensureVisualMedia(media, "MAX");
    const attachments = [];

    for (const asset of assets) {
      const uploaded = await uploadMedia(config, storage, asset);
      attachments.push({
        type: uploaded.type,
        payload: uploaded.payload
      });
    }

    const payload = {
      text: render.body || "",
      format: "markdown",
      attachments: attachments.length > 0 ? attachments : undefined
    };

    const response = await maxRequest<Record<string, unknown>>(config, `/messages?chat_id=${encodeURIComponent(config.chatId)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    return {
      externalIds: {
        messageId: pickObjectValue(response, ["message_id", "mid"]) ?? pickObjectValue(response, ["id"])
      },
      requestPayload: payload,
      responsePayload: response
    };
  }
};
