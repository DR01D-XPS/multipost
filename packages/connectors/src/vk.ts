import { parseChannelConfig, type LocalFileStorage, type MediaUploadDescriptor, type VkChannelConfig } from "@multipost/core";
import { ConnectorError, type ChannelConnector, type PublishConnectorResult, type TestConnectorResult } from "./types";
import { ensureVisualMedia, fileToBlob, parseResponseBody, pickObjectValue, withRetries } from "./utils";
import { publishVkViaPlaywright, testVkViaPlaywright } from "./vk-playwright";

type VkMethodResponse<T> =
  | {
      response: T;
    }
  | {
      error: {
        error_code: number;
        error_msg: string;
        request_params?: unknown;
      };
    };

type VkTransport = "API" | "PLAYWRIGHT" | "AUTO";

function getVkTransport(): VkTransport {
  const raw = process.env.VK_PUBLISH_TRANSPORT?.toUpperCase();
  if (raw === "PLAYWRIGHT") {
    return "PLAYWRIGHT";
  }
  if (raw === "AUTO") {
    return "AUTO";
  }
  return "API";
}

function isRetryableVkErrorCode(errorCode: number): boolean {
  return errorCode === 1 || errorCode === 6 || errorCode === 9 || errorCode === 10 || errorCode === 29;
}

function formatVkError(method: string, errorCode: number, errorMessage: string): string {
  if (errorCode === 27) {
    return `VK ${method}: используется токен сообщества, а этот метод недоступен для group auth. Для публикации нужен user access token администратора.`;
  }

  if (errorCode === 15) {
    return `VK ${method}: доступ запрещён. Проверьте права пользователя на публикацию от имени сообщества.`;
  }

  return `VK ${method}: ${errorMessage}`;
}

function shouldFallbackToPlaywright(error: unknown): boolean {
  if (!(error instanceof ConnectorError)) {
    return false;
  }

  return (
    error.code === "MISSING_ACCESS_TOKEN"
  );
}

function getVkApiVersion(): string {
  return process.env.VK_API_VERSION || "5.199";
}

function getGlobalVkAccessToken(): string {
  return process.env.VK_GLOBAL_ACCESS_TOKEN?.trim() || "";
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function findAttachmentPair(
  input: unknown,
  options: {
    idKeys: string[];
    ownerKeys?: string[];
  }
): { ownerId: number; mediaId: number } | null {
  if (!input) {
    return null;
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      const nested = findAttachmentPair(item, options);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  if (typeof input !== "object") {
    return null;
  }

  const record = input as Record<string, unknown>;
  const ownerId = parseNumber(
    pickObjectValue(record, options.ownerKeys ?? ["owner_id", "ownerId", "from_id", "user_id"])
  );

  for (const idKey of options.idKeys) {
    const mediaId = parseNumber(record[idKey]);
    if (ownerId !== null && mediaId !== null) {
      return {
        ownerId,
        mediaId
      };
    }
  }

  for (const value of Object.values(record)) {
    const nested = findAttachmentPair(value, options);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function normalizeVkUploadPhotoValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function normalizeVkUploadServerValue(value: unknown): string | number | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return undefined;
}

function normalizeVkUploadHashValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function parseVkWallUploadPayload(payload: Record<string, unknown>) {
  const serverValue = normalizeVkUploadServerValue(pickObjectValue(payload, ["server"]));
  const photoValue = normalizeVkUploadPhotoValue(pickObjectValue(payload, ["photo", "photos_list"]))?.trim();
  const hashValue = normalizeVkUploadHashValue(pickObjectValue(payload, ["hash"]));

  if (serverValue === undefined || !photoValue || !hashValue) {
    return null;
  }

  return {
    server: serverValue,
    photo: photoValue,
    hash: hashValue
  };
}

function hasVkWallUploadServerAndHash(payload: Record<string, unknown>): boolean {
  const serverValue = normalizeVkUploadServerValue(pickObjectValue(payload, ["server"]));
  const hashValue = normalizeVkUploadHashValue(pickObjectValue(payload, ["hash"]));
  return serverValue !== undefined && hashValue !== undefined;
}

function normalizeErrorDetails(error: unknown) {
  if (error instanceof ConnectorError) {
    return {
      message: error.message,
      code: error.code,
      details: error.details
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack
    };
  }

  return error;
}

async function callVkMethod<T>(
  config: VkChannelConfig,
  method: string,
  params: Record<string, string | number | undefined>
): Promise<T> {
  if (!config.accessToken) {
    throw new ConnectorError("Для VK API нужен access token. Либо укажите токен, либо включите VK_PUBLISH_TRANSPORT=PLAYWRIGHT.", {
      code: "MISSING_ACCESS_TOKEN"
    });
  }

  return withRetries(
    async () => {
      const body = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          body.set(key, String(value));
        }
      }
      body.set("access_token", config.accessToken);
      body.set("v", getVkApiVersion());

      const response = await fetch(`https://api.vk.com/method/${method}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body
      });
      const payload = (await parseResponseBody(response)) as VkMethodResponse<T> | unknown;

      if (!response.ok) {
        throw new ConnectorError(`VK ${method} failed with HTTP ${response.status}.`, {
          retryable: response.status === 429 || response.status >= 500,
          details: payload
        });
      }

      if (!payload || typeof payload !== "object") {
        throw new ConnectorError(`VK ${method} returned an unexpected response.`, {
          details: payload
        });
      }

      if ("error" in payload) {
        throw new ConnectorError(formatVkError(method, payload.error.error_code, payload.error.error_msg), {
          retryable: isRetryableVkErrorCode(payload.error.error_code),
          code: String(payload.error.error_code),
          details: payload.error
        });
      }

      return payload.response;
    },
    {
      attempts: 5,
      baseDelayMs: 1_000
    }
  );
}

async function uploadWallPhoto(config: VkChannelConfig, storage: LocalFileStorage, media: MediaUploadDescriptor) {
  const server = await callVkMethod<{ upload_url: string }>(config, "photos.getWallUploadServer", {
    group_id: config.groupId
  });

  const uploadFile = await fileToBlob(storage, media);
  const uploadAttempts: Array<Record<string, unknown>> = [];
  const uploadFieldCandidates = ["photo", "file1"];
  let uploadParams: { server: string | number; photo: string; hash: string } | null = null;

  for (const uploadField of uploadFieldCandidates) {
    const formData = new FormData();
    formData.append(uploadField, uploadFile, media.originalName ?? "image.jpg");

    const uploadResponse = await fetch(server.upload_url, {
      method: "POST",
      body: formData
    });
    const uploadPayloadRaw = await parseResponseBody(uploadResponse);
    const uploadPayload =
      uploadPayloadRaw && typeof uploadPayloadRaw === "object"
        ? (uploadPayloadRaw as Record<string, unknown>)
        : { raw: uploadPayloadRaw };

    uploadAttempts.push({
      uploadField,
      status: uploadResponse.status,
      ok: uploadResponse.ok,
      payload: uploadPayload
    });

    if (!uploadResponse.ok) {
      continue;
    }

    const parsed = parseVkWallUploadPayload(uploadPayload);
    if (parsed) {
      uploadParams = parsed;
      break;
    }
  }

  if (!uploadParams) {
    const hasRetryableHttpError = uploadAttempts.some((attempt) => {
      const status = typeof attempt.status === "number" ? attempt.status : 0;
      return status === 429 || status >= 500;
    });
    const hasServerAndHashWithoutPhoto = uploadAttempts.some((attempt) => {
      if (!attempt.ok || !attempt.payload || typeof attempt.payload !== "object") {
        return false;
      }
      return hasVkWallUploadServerAndHash(attempt.payload as Record<string, unknown>);
    });

    try {
      // VK wall photo upload may intermittently return malformed payload; fallback to docs upload to avoid Playwright loops.
      return await uploadWallGif(config, storage, media);
    } catch (fallbackError) {
      throw new ConnectorError("VK wall photo upload failed and docs fallback upload also failed.", {
        code: hasServerAndHashWithoutPhoto ? "VK_WALL_UPLOAD_EMPTY_PHOTO" : "VK_WALL_UPLOAD_INVALID_RESPONSE",
        retryable: hasRetryableHttpError || (fallbackError instanceof ConnectorError ? fallbackError.retryable : false),
        details: {
          uploadUrl: server.upload_url,
          attempts: uploadAttempts,
          docsFallbackError: normalizeErrorDetails(fallbackError)
        }
      });
    }
  }

  const saved = await callVkMethod<Array<Record<string, unknown>>>(config, "photos.saveWallPhoto", {
    group_id: config.groupId,
    server: uploadParams.server,
    photo: uploadParams.photo,
    hash: uploadParams.hash
  });

  const pair = findAttachmentPair(saved, {
    idKeys: ["id"]
  });

  if (!pair) {
    throw new ConnectorError("VK did not return a valid saved photo id.", {
      details: saved
    });
  }

  return {
    attachment: `photo${pair.ownerId}_${pair.mediaId}`,
    raw: saved
  };
}

async function uploadWallGif(config: VkChannelConfig, storage: LocalFileStorage, media: MediaUploadDescriptor) {
  const server = await callVkMethod<{ upload_url: string }>(config, "docs.getWallUploadServer", {
    group_id: config.groupId
  });

  const formData = new FormData();
  formData.append("file", await fileToBlob(storage, media), media.originalName ?? "animation.gif");
  const uploadResponse = await fetch(server.upload_url, {
    method: "POST",
    body: formData
  });
  const uploadPayload = (await parseResponseBody(uploadResponse)) as Record<string, unknown>;

  if (!uploadResponse.ok) {
    throw new ConnectorError(`VK docs upload failed with HTTP ${uploadResponse.status}.`, {
      retryable: uploadResponse.status === 429 || uploadResponse.status >= 500,
      details: uploadPayload
    });
  }

  const fileToken = pickObjectValue<string>(uploadPayload, ["file"]);
  if (!fileToken) {
    throw new ConnectorError("VK docs upload did not return a file token.", {
      details: uploadPayload
    });
  }

  const saved = await callVkMethod<Record<string, unknown>>(config, "docs.save", {
    file: fileToken,
    title: media.originalName ?? "animation.gif"
  });

  const pair = findAttachmentPair(saved, {
    idKeys: ["id", "doc_id"]
  });
  if (!pair) {
    throw new ConnectorError("VK docs.save did not return document id.", {
      details: saved
    });
  }

  return {
    attachment: `doc${pair.ownerId}_${pair.mediaId}`,
    raw: saved
  };
}

async function uploadWallVideo(config: VkChannelConfig, storage: LocalFileStorage, media: MediaUploadDescriptor) {
  const saveResponse = await callVkMethod<Record<string, unknown>>(config, "video.save", {
    group_id: config.groupId,
    wallpost: 1,
    name: media.originalName ?? "video",
    description: ""
  });

  const uploadUrl = pickObjectValue<string>(saveResponse, ["upload_url"]);
  if (!uploadUrl) {
    throw new ConnectorError("VK video.save did not return upload_url.", {
      details: saveResponse
    });
  }

  const formData = new FormData();
  formData.append("video_file", await fileToBlob(storage, media), media.originalName ?? "video.mp4");
  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    body: formData
  });
  const uploadPayload = await parseResponseBody(uploadResponse);

  if (!uploadResponse.ok) {
    throw new ConnectorError(`VK video upload failed with HTTP ${uploadResponse.status}.`, {
      retryable: uploadResponse.status === 429 || uploadResponse.status >= 500,
      details: uploadPayload
    });
  }

  const pairFromUpload = findAttachmentPair(uploadPayload, {
    idKeys: ["video_id", "id"]
  });
  const pairFromSave = findAttachmentPair(saveResponse, {
    idKeys: ["video_id", "id"]
  });
  const pair = pairFromUpload ?? pairFromSave;

  if (!pair) {
    throw new ConnectorError("VK video upload did not return video id.", {
      details: {
        saveResponse,
        uploadPayload
      }
    });
  }

  return {
    attachment: `video${pair.ownerId}_${pair.mediaId}`,
    raw: {
      saveResponse,
      uploadPayload
    }
  };
}

async function publishViaApi(input: {
  config: VkChannelConfig;
  renderBody: string;
  media: MediaUploadDescriptor[];
  storage: LocalFileStorage;
}) {
  const attachments = [];
  const uploadResponses: unknown[] = [];

  for (const asset of input.media) {
    if (asset.kind === "video" || asset.mimeType.toLowerCase().startsWith("video/")) {
      let uploaded: { attachment: string; raw: unknown };
      try {
        uploaded = await uploadWallVideo(input.config, input.storage, asset);
      } catch {
        // Fallback for unstable video.save/upload responses.
        uploaded = await uploadWallGif(input.config, input.storage, asset);
      }
      attachments.push(uploaded.attachment);
      uploadResponses.push(uploaded.raw);
      continue;
    }

    if (asset.mimeType.toLowerCase() === "image/gif") {
      const uploaded = await uploadWallGif(input.config, input.storage, asset);
      attachments.push(uploaded.attachment);
      uploadResponses.push(uploaded.raw);
      continue;
    }

    const uploaded = await uploadWallPhoto(input.config, input.storage, asset);
    attachments.push(uploaded.attachment);
    uploadResponses.push(uploaded.raw);
  }

  const payload = {
    owner_id: -input.config.groupId,
    from_group: 1,
    message: input.renderBody,
    attachments: attachments.join(",") || undefined
  };

  const response = await callVkMethod<{ post_id: number }>(input.config, "wall.post", payload);
  return {
    transport: "api" as const,
    postId: response.post_id,
    requestPayload: payload,
    responsePayload: {
      post: response,
      uploads: uploadResponses
    }
  };
}

function getVkConfig(input: unknown): VkChannelConfig {
  const parsed = parseChannelConfig("VK_GROUP", input);
  const globalToken = getGlobalVkAccessToken();

  if (globalToken.length > 0) {
    return {
      ...parsed,
      accessToken: globalToken
    };
  }

  return parsed;
}

export const vkConnector: ChannelConnector<"VK_GROUP"> = {
  type: "VK_GROUP",

  async test({ channel }): Promise<TestConnectorResult> {
    const config = getVkConfig(channel.config);
    const transport = getVkTransport();
    const message = `[MultiPost test]\nChannel: ${channel.name}\nTime: ${new Date().toISOString()}`;

    if (transport === "PLAYWRIGHT") {
      const result = await testVkViaPlaywright({
        config,
        message
      });

      return {
        message: "VK test post created via Playwright.",
        externalIds: {
          transport: "playwright"
        },
        requestPayload: {
          ownerId: -config.groupId
        },
        responsePayload: result
      };
    }

    try {
      const response = await callVkMethod<{ post_id: number }>(config, "wall.post", {
        owner_id: -config.groupId,
        from_group: 1,
        message
      });

      return {
        message: "VK test wall post created.",
        externalIds: {
          postId: response.post_id,
          transport: "api"
        },
        requestPayload: {
          owner_id: -config.groupId,
          from_group: 1
        },
        responsePayload: response
      };
    } catch (error) {
      if (transport === "AUTO" && shouldFallbackToPlaywright(error)) {
        const result = await testVkViaPlaywright({
          config,
          message
        });

        return {
          message: "VK test post created via Playwright fallback.",
          externalIds: {
            transport: "playwright"
          },
          requestPayload: {
            ownerId: -config.groupId
          },
          responsePayload: result
        };
      }

      throw error;
    }
  },

  async publish({ channel, render, media, storage }): Promise<PublishConnectorResult> {
    const config = getVkConfig(channel.config);
    const assets = ensureVisualMedia(media, "VK");
    const transport = getVkTransport();

    if (transport === "PLAYWRIGHT") {
      const result = await publishVkViaPlaywright({
        config,
        message: render.body,
        mediaAbsolutePaths: assets.map((asset) => storage.getAbsolutePath(asset.localPath))
      });

      return {
        externalIds: {
          transport: "playwright"
        },
        requestPayload: {
          ownerId: -config.groupId,
          mediaCount: assets.length
        },
        responsePayload: result
      };
    }

    try {
      const apiResult = await publishViaApi({
        config,
        renderBody: render.body,
        media: assets,
        storage
      });

      return {
        externalIds: {
          postId: apiResult.postId,
          transport: apiResult.transport
        },
        requestPayload: apiResult.requestPayload,
        responsePayload: apiResult.responsePayload
      };
    } catch (error) {
      if (transport === "AUTO" && shouldFallbackToPlaywright(error)) {
        const result = await publishVkViaPlaywright({
          config,
          message: render.body,
          mediaAbsolutePaths: assets.map((asset) => storage.getAbsolutePath(asset.localPath))
        });

        return {
          externalIds: {
            transport: "playwright"
          },
          requestPayload: {
            ownerId: -config.groupId,
            mediaCount: assets.length
          },
          responsePayload: result
        };
      }

      throw error;
    }
  }
};
