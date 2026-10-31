import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "../../../lib/api";
import { importTelegramEmojiPack } from "../../../lib/telegram-emoji";
import { getTelegramEmojiPacks, serializeTelegramEmojiPack } from "../../../lib/server";

const importTelegramEmojiPackSchema = z.object({
  telegramChannelId: z.string().min(1),
  source: z.string().min(1)
});

export async function GET() {
  try {
    return NextResponse.json({
      packs: await getTelegramEmojiPacks()
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = importTelegramEmojiPackSchema.parse(await request.json());
    const pack = await importTelegramEmojiPack(body);

    return NextResponse.json({
      pack: serializeTelegramEmojiPack(pack),
      message: "Набор Telegram emoji импортирован."
    });
  } catch (error) {
    return handleApiError(error);
  }
}
