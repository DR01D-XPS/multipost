import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@multipost/db";
import { handleApiError } from "../../../../../../lib/api";
import { serializeMediaAsset } from "../../../../../../lib/server";

const mediaOrderSchema = z.object({
  orderedMediaIds: z.array(z.string().min(1)).min(1)
});

function isSortOrderCompatibilityError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("sortOrder");
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = mediaOrderSchema.parse(await request.json());
    const assets = await prisma.mediaAsset.findMany({
      where: {
        postId: id
      },
      select: {
        id: true
      }
    });

    if (assets.length !== body.orderedMediaIds.length) {
      return NextResponse.json({ error: "Список медиа не совпадает с текущим постом." }, { status: 400 });
    }

    if (new Set(body.orderedMediaIds).size !== body.orderedMediaIds.length) {
      return NextResponse.json({ error: "Список медиа содержит дубликаты." }, { status: 400 });
    }

    const existingIds = new Set(assets.map((asset) => asset.id));
    for (const mediaId of body.orderedMediaIds) {
      if (!existingIds.has(mediaId)) {
        return NextResponse.json({ error: `Неизвестный media id: ${mediaId}` }, { status: 400 });
      }
    }

    try {
      await prisma.$transaction(
        body.orderedMediaIds.map((mediaId, index) =>
          prisma.mediaAsset.update({
            where: {
              id: mediaId
            },
            data: {
              sortOrder: index
            }
          } as any)
        )
      );
    } catch (error) {
      if (!isSortOrderCompatibilityError(error)) {
        throw error;
      }

      const fallbackAssets = await prisma.mediaAsset.findMany({
        where: {
          postId: id,
          id: {
            in: body.orderedMediaIds
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      });

      const byId = new Map(fallbackAssets.map((asset) => [asset.id, asset]));
      const orderedFallback = body.orderedMediaIds
        .map((mediaId) => byId.get(mediaId))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      return NextResponse.json({
        mediaAssets: orderedFallback.map((asset) => serializeMediaAsset(asset))
      });
    }

    const orderedAssets = await prisma.mediaAsset.findMany({
      where: {
        postId: id
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return NextResponse.json({
      mediaAssets: orderedAssets.map(serializeMediaAsset)
    });
  } catch (error) {
    return handleApiError(error);
  }
}
