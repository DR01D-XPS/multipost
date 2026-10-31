import { z } from "zod";

export const channelTypes = ["VK_GROUP", "TELEGRAM_CHANNEL", "MAX_CHAT"] as const;
export type ChannelType = (typeof channelTypes)[number];

export const mediaKinds = ["image", "video", "audio", "file"] as const;
export type MediaKind = (typeof mediaKinds)[number];

export const publishModes = ["DISABLED", "NOW", "SCHEDULED"] as const;
export type PublishMode = (typeof publishModes)[number];

export const publishStatuses = [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "FAILED"
] as const;
export type PublishStatus = (typeof publishStatuses)[number];

export const platformKinds = ["telegram", "max", "vk"] as const;
export type PlatformKind = (typeof platformKinds)[number];

export const richTextMarkSchema = z.object({
  type: z.string(),
  attrs: z.record(z.any()).optional()
});

export type RichTextMark = z.infer<typeof richTextMarkSchema>;

export type RichTextNode = {
  type: string;
  attrs?: Record<string, unknown>;
  marks?: RichTextMark[];
  text?: string;
  content?: RichTextNode[];
};

export const richTextNodeSchema: z.ZodType<RichTextNode> = z.lazy(() =>
  z.object({
    type: z.string(),
    attrs: z.record(z.any()).optional(),
    marks: z.array(richTextMarkSchema).optional(),
    text: z.string().optional(),
    content: z.array(richTextNodeSchema).optional()
  })
);

export const richTextDocumentSchema = z.object({
  type: z.literal("doc"),
  content: z.array(richTextNodeSchema).default([])
});

export type RichTextDocument = z.infer<typeof richTextDocumentSchema>;

export const emptyDocument: RichTextDocument = {
  type: "doc",
  content: [
    {
      type: "paragraph"
    }
  ]
};

const stringOrNumber = z.union([z.string().min(1), z.number().finite()]).transform(String);

export const vkChannelConfigSchema = z.object({
  groupId: z.coerce.number().int().positive(),
  accessToken: z.string().optional().default("")
});

export const telegramChannelConfigSchema = z.object({
  botToken: z.string().min(1),
  chatId: stringOrNumber
});

export const maxChannelConfigSchema = z.object({
  accessToken: z.string().min(1),
  chatId: stringOrNumber
});

export type VkChannelConfig = z.infer<typeof vkChannelConfigSchema>;
export type TelegramChannelConfig = z.infer<typeof telegramChannelConfigSchema>;
export type MaxChannelConfig = z.infer<typeof maxChannelConfigSchema>;

export type ChannelConfigByType = {
  VK_GROUP: VkChannelConfig;
  TELEGRAM_CHANNEL: TelegramChannelConfig;
  MAX_CHAT: MaxChannelConfig;
};

export const channelSchema = z.object({
  type: z.enum(channelTypes),
  name: z.string().min(2).max(80),
  config: z.record(z.any())
});

export const createPostSchema = z.object({
  title: z.string().min(1).max(160),
  content: richTextDocumentSchema.default(emptyDocument)
});

export const updatePostSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  content: richTextDocumentSchema.optional()
});

export const publishTargetMutationSchema = z.object({
  channelId: z.string().min(1),
  mode: z.enum(publishModes),
  scheduledAt: z.string().datetime().nullable().optional()
});

export type PublishTargetMutationInput = z.infer<typeof publishTargetMutationSchema>;

export function parseChannelConfig<T extends ChannelType>(
  type: T,
  rawConfig: unknown
): ChannelConfigByType[T] {
  switch (type) {
    case "VK_GROUP":
      return vkChannelConfigSchema.parse(rawConfig) as ChannelConfigByType[T];
    case "TELEGRAM_CHANNEL":
      return telegramChannelConfigSchema.parse(rawConfig) as ChannelConfigByType[T];
    case "MAX_CHAT":
      return maxChannelConfigSchema.parse(rawConfig) as ChannelConfigByType[T];
  }
}

export function getPlatformFromChannelType(type: ChannelType): PlatformKind {
  switch (type) {
    case "TELEGRAM_CHANNEL":
      return "telegram";
    case "MAX_CHAT":
      return "max";
    case "VK_GROUP":
      return "vk";
  }
}

function maskValue(value: string): string {
  if (value.length <= 6) {
    return "*".repeat(Math.max(value.length, 3));
  }

  return `${value.slice(0, 3)}${"*".repeat(12)}${value.slice(-3)}`;
}

export function maskChannelConfig(type: ChannelType, rawConfig: unknown): Record<string, unknown> {
  const config = parseChannelConfig(type, rawConfig);

  switch (type) {
    case "VK_GROUP":
      return {
        groupId: config.groupId,
        accessToken: config.accessToken ? maskValue(config.accessToken) : ""
      };
    case "TELEGRAM_CHANNEL":
      return {
        botToken: maskValue(config.botToken),
        chatId: config.chatId
      };
    case "MAX_CHAT":
      return {
        accessToken: maskValue(config.accessToken),
        chatId: config.chatId
      };
  }
}

const sensitiveKeyPattern = /token|secret|password|authorization|access/i;

export function redactSecrets(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map((item) => redactSecrets(item));
  }

  if (input && typeof input === "object") {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => {
        if (sensitiveKeyPattern.test(key)) {
          return [key, typeof value === "string" ? maskValue(value) : "[REDACTED]"];
        }

        return [key, redactSecrets(value)];
      })
    );
  }

  return input;
}

export type MediaUploadDescriptor = {
  id: string;
  kind: MediaKind;
  localPath: string;
  mimeType: string;
  size: number;
  sortOrder?: number;
  width?: number | null;
  height?: number | null;
  originalName?: string | null;
};

export type PublishablePost = {
  id: string;
  title: string;
  content: RichTextDocument;
  mediaAssets: MediaUploadDescriptor[];
};

export type DecryptedChannel = {
  id: string;
  type: ChannelType;
  name: string;
  config: ChannelConfigByType[ChannelType];
};
