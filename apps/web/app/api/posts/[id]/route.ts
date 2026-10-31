import { NextResponse } from "next/server";
import { prisma } from "@multipost/db";
import { updatePostSchema } from "@multipost/core";
import { handleApiError } from "../../../../lib/api";
import { getStorage, serializePostDetail } from "../../../../lib/server";

function isSortOrderCompatibilityError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("sortOrder");
}

function buildIncludeOptions(useSortOrder: boolean) {
  return {
    mediaAssets: {
      orderBy: useSortOrder
        ? [
            {
              sortOrder: "asc"
            },
            {
              createdAt: "asc"
            }
          ]
        : {
            createdAt: "asc"
          }
    },
    publishTargets: {
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
    }
  } as const;
}

async function findPostById(id: string) {
  try {
    return await prisma.post.findUnique({
      where: {
        id
      },
      include: buildIncludeOptions(true)
    } as any);
  } catch (error) {
    if (!isSortOrderCompatibilityError(error)) {
      throw error;
    }

    return prisma.post.findUnique({
      where: {
        id
      },
      include: buildIncludeOptions(false)
    } as any);
  }
}

async function updatePostById(id: string, body: { title?: string; content?: unknown }) {
  try {
    return await prisma.post.update({
      where: {
        id
      },
      data: {
        ...(body.title ? { title: body.title } : {}),
        ...(body.content ? { content: body.content } : {})
      },
      include: buildIncludeOptions(true)
    } as any);
  } catch (error) {
    if (!isSortOrderCompatibilityError(error)) {
      throw error;
    }

    return prisma.post.update({
      where: {
        id
      },
      data: {
        ...(body.title ? { title: body.title } : {}),
        ...(body.content ? { content: body.content } : {})
      },
      include: buildIncludeOptions(false)
    } as any);
  }
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const post = await findPostById(id);

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    return NextResponse.json({
      post: serializePostDetail(post)
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = updatePostSchema.parse(await request.json());
    const post = await updatePostById(id, body);

    return NextResponse.json({
      post: serializePostDetail(post)
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const post = await prisma.post.findUnique({
      where: {
        id
      },
      include: {
        mediaAssets: true
      }
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const storage = getStorage();
    for (const asset of post.mediaAssets) {
      await storage.deleteFile(asset.localPath);
    }

    await prisma.post.delete({
      where: {
        id
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
