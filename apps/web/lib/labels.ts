import type { ChannelType, PublishMode, PublishStatus } from "@multipost/core";
import type { PlatformRenderResult } from "@multipost/renderers";

export const publishStatusLabels: Record<PublishStatus, string> = {
  DRAFT: "Черновик",
  SCHEDULED: "Запланировано",
  PUBLISHING: "Публикуется",
  PUBLISHED: "Опубликовано",
  FAILED: "Ошибка"
};

export const publishModeLabels: Record<PublishMode, string> = {
  DISABLED: "Не публиковать",
  NOW: "Опубликовать сейчас",
  SCHEDULED: "Запланировать"
};

export const channelTypeLabels: Record<ChannelType, string> = {
  VK_GROUP: "VK-группа",
  TELEGRAM_CHANNEL: "Telegram-канал",
  MAX_CHAT: "MAX-чат"
};

export const previewPlatformLabels: Record<PlatformRenderResult["platform"], string> = {
  telegram: "Telegram",
  max: "MAX",
  vk: "VK"
};

export const previewFormatLabels: Record<PlatformRenderResult["outputFormat"], string> = {
  HTML: "HTML",
  MARKDOWN: "Markdown",
  PLAINTEXT: "Без форматирования"
};

export const channelConfigLabels: Record<string, string> = {
  groupId: "ID группы",
  accessToken: "Токен доступа",
  botToken: "Токен бота",
  chatId: "Chat ID или @username"
};
