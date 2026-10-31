import type {
  Channel,
  ChannelType as PrismaChannelType,
  MediaAsset,
  Post,
  PublishJobLog,
  PublishTarget,
  TelegramEmoji,
  TelegramEmojiPack
} from "@multipost/db";
import { prisma } from "@multipost/db";
import {
  decryptJson,
  encryptJson,
  getServerEnv,
  LocalFileStorage,
  maskChannelConfig,
  parseChannelConfig,
  redactSecrets,
  resolveStorageRoot,
  richTextDocumentSchema,
  type ChannelType,
  type DecryptedChannel
} from "@multipost/core";

type ChannelRecord = Pick<Channel, "id" | "type" | "name" | "config" | "createdAt" | "updatedAt">;
type MediaRecord = Pick<
  MediaAsset,
  "id" | "kind" | "localPath" | "mimeType" | "size" | "width" | "height" | "originalName"
> & {
  sortOrder?: number | null;
};
type LogRecord = Pick<
  PublishJobLog,
  "id" | "runAt" | "status" | "requestPayload" | "responsePayload" | "errorStack"
>;
type TargetRecord = Pick<
  PublishTarget,
  "id" | "channelId" | "mode" | "scheduledAt" | "status" | "lastError" | "externalIds"
> & {
  channel?: Pick<Channel, "id" | "name" | "type"> | null;
  logs?: LogRecord[];
};
type TelegramEmojiRecord = Pick<
  TelegramEmoji,
  | "id"
  | "packId"
  | "customEmojiId"
  | "emoji"
  | "previewPath"
  | "previewMimeType"
  | "width"
  | "height"
  | "isAnimated"
  | "isVideo"
  | "needsRepainting"
  | "sortOrder"
>;
type TelegramEmojiPackRecord = Pick<
  TelegramEmojiPack,
  "id" | "setName" | "title" | "sourceUrl" | "stickerType" | "importedAt" | "updatedAt"
> & {
  emojis?: TelegramEmojiRecord[];
};

export type ChannelView = {
  id: string;
  type: ChannelType;
  name: string;
  createdAt: string;
  updatedAt: string;
  maskedConfig: Record<string, unknown>;
};

export type MediaAssetView = {
  id: string;
  kind: string;
  localPath: string;
  mimeType: string;
  size: number;
  sortOrder: number;
  width: number | null;
  height: number | null;
  originalName: string | null;
  url: string;
};

export type PublishLogView = {
  id: string;
  runAt: string;
  status: string;
  requestPayload: unknown;
  responsePayload: unknown;
  errorStack: string | null;
};

export type PublishTargetView = {
  id: string;
  channelId: string;
  channelName: string | null;
  channelType: ChannelType | null;
  mode: string;
  scheduledAt: string | null;
  status: string;
  lastError: string | null;
  externalIds: unknown;
  logs: PublishLogView[];
};

export type PostSummaryView = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  targets: PublishTargetView[];
};

export type PostDetailView = PostSummaryView & {
  content: unknown;
  mediaAssets: MediaAssetView[];
};

export type TelegramEmojiView = {
  id: string;
  packId: string;
  customEmojiId: string;
  emoji: string;
  previewUrl: string | null;
  previewMimeType: string | null;
  width: number | null;
  height: number | null;
  isAnimated: boolean;
  isVideo: boolean;
  needsRepainting: boolean;
  sortOrder: number;
};

export type TelegramEmojiPackView = {
  id: string;
  setName: string;
  title: string;
  sourceUrl: string;
  stickerType: string;
  importedAt: string;
  updatedAt: string;
  emojiCount: number;
  emojis: TelegramEmojiView[];
};

const env = getServerEnv();
const globalForStorage = globalThis as unknown as {
  multipostStorage?: LocalFileStorage;
};

export function getStorage(): LocalFileStorage {
  if (!globalForStorage.multipostStorage) {
    globalForStorage.multipostStorage = new LocalFileStorage(resolveStorageRoot(env.STORAGE_ROOT));
  }

  return globalForStorage.multipostStorage;
}

function normalizeChannelType(type: PrismaChannelType): ChannelType {
  return type as unknown as ChannelType;
}

export function encryptChannelConfig(type: ChannelType, rawConfig: unknown): string {
  const parsed = parseChannelConfig(type, rawConfig);
  return encryptJson(parsed, env.CHANNEL_CONFIG_SECRET);
}

export function decryptChannelRecord(channel: ChannelRecord): DecryptedChannel {
  const decrypted = decryptJson(channel.config, env.CHANNEL_CONFIG_SECRET);
  return {
    id: channel.id,
    type: normalizeChannelType(channel.type),
    name: channel.name,
    config: parseChannelConfig(normalizeChannelType(channel.type), decrypted)
  };
}

export function serializeChannel(channel: ChannelRecord): ChannelView {
  const decrypted = decryptJson(channel.config, env.CHANNEL_CONFIG_SECRET);
  return {
    id: channel.id,
    type: normalizeChannelType(channel.type),
    name: channel.name,
    createdAt: channel.createdAt.toISOString(),
    updatedAt: channel.updatedAt.toISOString(),
    maskedConfig: maskChannelConfig(normalizeChannelType(channel.type), decrypted)
  };
}

export function getMediaUrl(relativePath: string): string {
  return `/api/media/${relativePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

export function serializeMediaAsset(asset: MediaRecord): MediaAssetView {
  return {
    id: asset.id,
    kind: asset.kind,
    localPath: asset.localPath,
    mimeType: asset.mimeType,
    size: asset.size,
    sortOrder: typeof asset.sortOrder === "number" ? asset.sortOrder : 0,
    width: asset.width ?? null,
    height: asset.height ?? null,
    originalName: asset.originalName ?? null,
    url: getMediaUrl(asset.localPath)
  };
}

export function serializeLog(log: LogRecord): PublishLogView {
  return {
    id: log.id,
    runAt: log.runAt.toISOString(),
    status: log.status,
    requestPayload: redactSecrets(log.requestPayload),
    responsePayload: redactSecrets(log.responsePayload),
    errorStack: log.errorStack ?? null
  };
}

export function serializeTelegramEmoji(emoji: TelegramEmojiRecord): TelegramEmojiView {
  return {
    id: emoji.id,
    packId: emoji.packId,
    customEmojiId: emoji.customEmojiId,
    emoji: emoji.emoji,
    previewUrl: emoji.previewPath ? getMediaUrl(emoji.previewPath) : null,
    previewMimeType: emoji.previewMimeType ?? null,
    width: emoji.width ?? null,
    height: emoji.height ?? null,
    isAnimated: emoji.isAnimated,
    isVideo: emoji.isVideo,
    needsRepainting: emoji.needsRepainting,
    sortOrder: emoji.sortOrder
  };
}

export function serializeTelegramEmojiPack(pack: TelegramEmojiPackRecord): TelegramEmojiPackView {
  const emojis = (pack.emojis ?? []).map(serializeTelegramEmoji);

  return {
    id: pack.id,
    setName: pack.setName,
    title: pack.title,
    sourceUrl: pack.sourceUrl,
    stickerType: pack.stickerType,
    importedAt: pack.importedAt.toISOString(),
    updatedAt: pack.updatedAt.toISOString(),
    emojiCount: emojis.length,
    emojis
  };
}

export function serializeTarget(target: TargetRecord): PublishTargetView {
  return {
    id: target.id,
    channelId: target.channelId,
    channelName: target.channel?.name ?? null,
    channelType: target.channel ? normalizeChannelType(target.channel.type) : null,
    mode: target.mode,
    scheduledAt: target.scheduledAt?.toISOString() ?? null,
    status: target.status,
    lastError: target.lastError ?? null,
    externalIds: redactSecrets(target.externalIds),
    logs: (target.logs ?? []).map(serializeLog)
  };
}

export function serializePostSummary(
  post: Pick<Post, "id" | "title" | "createdAt" | "updatedAt"> & {
    publishTargets?: TargetRecord[];
  }
): PostSummaryView {
  return {
    id: post.id,
    title: post.title,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    targets: (post.publishTargets ?? []).map(serializeTarget)
  };
}

export function serializePostDetail(
  post: Pick<Post, "id" | "title" | "content" | "createdAt" | "updatedAt"> & {
    mediaAssets?: MediaRecord[];
    publishTargets?: TargetRecord[];
  }
): PostDetailView {
  return {
    ...serializePostSummary(post),
    content: richTextDocumentSchema.parse(post.content),
    mediaAssets: (post.mediaAssets ?? []).map(serializeMediaAsset)
  };
}

export async function getMaskedChannels() {
  const channels = await prisma.channel.findMany({
    orderBy: {
      createdAt: "desc"
    }
  });

  return channels.map(serializeChannel);
}

export async function getTelegramEmojiPacks() {
  const packs = await prisma.telegramEmojiPack.findMany({
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
    },
    orderBy: [
      {
        updatedAt: "desc"
      },
      {
        title: "asc"
      }
    ]
  });

  return packs.map(serializeTelegramEmojiPack);
}
