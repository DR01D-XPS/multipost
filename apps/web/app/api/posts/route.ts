import { NextResponse } from "next/server";
import { createPostSchema, emptyDocument, publishStatuses } from "@multipost/core";
import { Prisma, prisma } from "@multipost/db";
import { handleApiError } from "../../../lib/api";
import { serializePostSummary } from "../../../lib/server";

const postCreateSchema = createPostSchema.partial({
  title: true,
  content: true
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim();
    const statusParam = url.searchParams.get("status");
    const status = publishStatuses.find((item) => item === statusParam);

    const where: Prisma.PostWhereInput = {
      ...(search
        ? {
            title: {
              contains: search,
              mode: "insensitive"
            }
          }
        : {}),
      ...(status
        ? {
            publishTargets: {
              some: {
                status
              }
            }
          }
        : {})
    };

    const posts = await prisma.post.findMany({
      where,
      orderBy: {
        updatedAt: "desc"
      },
      include: {
        publishTargets: {
          include: {
            channel: {
              select: {
                id: true,
                name: true,
                type: true
              }
            }
          },
          orderBy: {
            createdAt: "asc"
          }
        }
      }
    });

    return NextResponse.json({
      posts: posts.map(serializePostSummary)
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const rawBody = (await request.json().catch(() => ({}))) as unknown;
    const body = postCreateSchema.parse(rawBody);

    const post = await prisma.post.create({
      data: {
        title: body.title ?? "Новый черновик",
        content: body.content ?? emptyDocument
      }
    });

    return NextResponse.json({
      post: serializePostSummary(post)
    });
  } catch (error) {
    return handleApiError(error);
  }
}
