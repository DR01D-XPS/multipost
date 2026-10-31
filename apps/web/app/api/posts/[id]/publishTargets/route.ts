import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@multipost/db";
import { publishTargetMutationSchema } from "@multipost/core";
import { handleApiError } from "../../../../../lib/api";
import { syncPublishTargetJob } from "../../../../../lib/queue";
import { serializeTarget } from "../../../../../lib/server";

const publishTargetsBodySchema = z.object({
  targets: z.array(publishTargetMutationSchema).min(1)
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = publishTargetsBodySchema.parse(await request.json());
    const channels = await prisma.channel.findMany({
      where: {
        id: {
          in: body.targets.map((target) => target.channelId)
        }
      }
    });

    const channelIds = new Set(channels.map((channel) => channel.id));
    for (const target of body.targets) {
      if (!channelIds.has(target.channelId)) {
        return NextResponse.json(
          {
            error: `Канал не найден: ${target.channelId}`
          },
          { status: 400 }
        );
      }

      if (target.mode === "SCHEDULED" && !target.scheduledAt) {
        return NextResponse.json(
          {
            error: `Для запланированной публикации нужно указать дату и время: ${target.channelId}`
          },
          { status: 400 }
        );
      }
    }

    const updatedTargets = await prisma.$transaction(
      body.targets.map((target) =>
        prisma.publishTarget.upsert({
          where: {
            postId_channelId: {
              postId: id,
              channelId: target.channelId
            }
          },
          create: {
            postId: id,
            channelId: target.channelId,
            mode: target.mode,
            scheduledAt: target.mode === "SCHEDULED" && target.scheduledAt ? new Date(target.scheduledAt) : null,
            status: target.mode === "DISABLED" ? "DRAFT" : "SCHEDULED",
            lastError: null
          },
          update: {
            mode: target.mode,
            scheduledAt: target.mode === "SCHEDULED" && target.scheduledAt ? new Date(target.scheduledAt) : null,
            status: target.mode === "DISABLED" ? "DRAFT" : "SCHEDULED",
            lastError: null
          }
        })
      )
    );

    await Promise.all(
      updatedTargets.map((target) =>
        syncPublishTargetJob({
          publishTargetId: target.id,
          publishTargetUpdatedAt: target.updatedAt,
          mode: target.mode,
          scheduledAt: target.scheduledAt
        })
      )
    );

    const hydratedTargets = await prisma.publishTarget.findMany({
      where: {
        postId: id
      },
      include: {
        channel: {
          select: {
            id: true,
            name: true,
            type: true
          }
        },
        logs: {
          orderBy: {
            runAt: "desc"
          },
          take: 20
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return NextResponse.json({
      targets: hydratedTargets.map(serializeTarget)
    });
  } catch (error) {
    return handleApiError(error);
  }
}
