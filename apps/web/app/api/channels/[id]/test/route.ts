import { NextResponse } from "next/server";
import { testChannel } from "@multipost/connectors";
import { prisma } from "@multipost/db";
import { handleApiError } from "../../../../../lib/api";
import { decryptChannelRecord } from "../../../../../lib/server";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const channel = await prisma.channel.findUnique({
      where: {
        id
      }
    });

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const result = await testChannel({
      channel: decryptChannelRecord(channel)
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
