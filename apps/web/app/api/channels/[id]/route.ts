import { NextResponse } from "next/server";
import { z } from "zod";
import { channelTypes, parseChannelConfig } from "@multipost/core";
import { prisma } from "@multipost/db";
import { handleApiError } from "../../../../lib/api";
import { decryptChannelRecord, encryptChannelConfig, serializeChannel } from "../../../../lib/server";

const channelPatchSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  config: z.record(z.any()).optional()
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = channelPatchSchema.parse(await request.json());
    const existing = await prisma.channel.findUnique({
      where: {
        id
      }
    });

    if (!existing) {
      return NextResponse.json({ error: "Канал не найден" }, { status: 404 });
    }

    const type = existing.type as (typeof channelTypes)[number];
    const currentConfig = decryptChannelRecord(existing).config;
    const mergedConfig = body.config
      ? {
          ...currentConfig,
          ...Object.fromEntries(
            Object.entries(body.config).filter(([, value]) => !(typeof value === "string" && value.trim() === ""))
          )
        }
      : currentConfig;

    if (body.config) {
      parseChannelConfig(type, mergedConfig);
    }

    const updated = await prisma.channel.update({
      where: {
        id
      },
      data: {
        name: body.name ?? existing.name,
        config: body.config ? encryptChannelConfig(type, mergedConfig) : existing.config
      }
    });

    return NextResponse.json({
      channel: serializeChannel(updated)
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await prisma.channel.delete({
      where: {
        id
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
