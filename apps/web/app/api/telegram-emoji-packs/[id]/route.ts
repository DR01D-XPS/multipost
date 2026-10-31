import { NextResponse } from "next/server";
import { handleApiError } from "../../../../lib/api";
import { deleteTelegramEmojiPack } from "../../../../lib/telegram-emoji";

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await deleteTelegramEmojiPack(id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
