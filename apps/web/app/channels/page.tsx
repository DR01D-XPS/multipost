import { ChannelsManager } from "../../components/channels-manager";
import { getMaskedChannels, getTelegramEmojiPacks } from "../../lib/server";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const [channels, emojiPacks] = await Promise.all([getMaskedChannels(), getTelegramEmojiPacks()]);

  return <ChannelsManager initialChannels={channels} initialEmojiPacks={emojiPacks} />;
}
