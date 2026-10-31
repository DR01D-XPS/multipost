import { type ChannelType } from "@multipost/core";
import { maxConnector } from "./max";
import { telegramConnector } from "./telegram";
import type { PublishConnectorInput, TestConnectorInput } from "./types";
import { vkConnector } from "./vk";

export * from "./types";

const connectorByType = {
  TELEGRAM_CHANNEL: telegramConnector,
  MAX_CHAT: maxConnector,
  VK_GROUP: vkConnector
} as const;

export function getConnector(type: ChannelType) {
  return connectorByType[type];
}

export async function publishToChannel(input: PublishConnectorInput) {
  return getConnector(input.channel.type).publish(input);
}

export async function testChannel(input: TestConnectorInput) {
  return getConnector(input.channel.type).test(input);
}
