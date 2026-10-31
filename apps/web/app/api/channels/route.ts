import { NextResponse } from "next/server";
import { channelSchema } from "@multipost/core";
import { prisma } from "@multipost/db";
import { handleApiError } from "../../../lib/api";
import { encryptChannelConfig, getMaskedChannels, serializeChannel } from "../../../lib/server";

export async function GET() {
  try {
    return NextResponse.json({
      channels: await getMaskedChannels()
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = channelSchema.parse(await request.json());
    const channel = await prisma.channel.create({
      data: {
        type: body.type,
        name: body.name,
        config: encryptChannelConfig(body.type, body.config)
      }
    });

    return NextResponse.json({
      channel: serializeChannel(channel)
    });
  } catch (error) {
    return handleApiError(error);
  }
}

