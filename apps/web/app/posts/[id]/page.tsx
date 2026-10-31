import { notFound } from "next/navigation";
import { prisma } from "@multipost/db";
import { getMaskedChannels, getTelegramEmojiPacks, serializePostDetail } from "../../../lib/server";
import { PostStudio } from "../../../components/post-studio";

export const dynamic = "force-dynamic";

export default async function PostPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [post, channels, emojiPacks] = await Promise.all([
    prisma.post.findUnique({
      where: {
        id
      },
      include: {
        mediaAssets: {
          orderBy: {
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
      }
    }),
    getMaskedChannels(),
    getTelegramEmojiPacks()
  ]);

  if (!post) {
    notFound();
  }

  return (
    <PostStudio
      post={serializePostDetail(post)}
      channels={channels.map(({ id: channelId, name, type, maskedConfig }) => ({
        id: channelId,
        name,
        type,
        maskedConfig
      }))}
      emojiPacks={emojiPacks}
    />
  );
}
