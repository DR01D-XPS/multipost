import { publishStatuses } from "@multipost/core";
import { prisma } from "@multipost/db";
import { CreatePostButton } from "../../components/create-post-button";
import { PostsFilters } from "../../components/posts-filters";
import { PostsHub } from "../../components/posts-hub";
import { serializePostSummary } from "../../lib/server";

export const dynamic = "force-dynamic";

export default async function PostsPage({
  searchParams
}: {
  searchParams: Promise<{ search?: string; status?: string }>;
}) {
  const params = await searchParams;
  const search = params.search?.trim();
  const status = publishStatuses.find((item) => item === params.status);

  const posts = await prisma.post.findMany({
    where: {
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
    },
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

  return (
    <div className="space-y-6">
      <section className="app-surface-elevated rounded-[2rem] border border-line bg-panel p-6 shadow-studio">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">Черновики</p>
            <h2 className="mt-2 text-3xl font-semibold">Управляйте постами и публикацией из одного места</h2>
          </div>

          <CreatePostButton />
        </div>

        <PostsFilters initialSearch={search} initialStatus={status ?? ""} />
      </section>

      <PostsHub initialPosts={posts.map(serializePostSummary)} />
    </div>
  );
}
