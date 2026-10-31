import { NextResponse } from "next/server";
import { prisma } from "@multipost/db";
import { handleApiError } from "../../../../../../lib/api";
import { getStorage } from "../../../../../../lib/server";

export async function DELETE(_: Request, context: { params: Promise<{ id: string; mediaId: string }> }) {
  try {
    const { id, mediaId } = await context.params;
    const media = await prisma.mediaAsset.findFirst({
      where: {
        id: mediaId,
        postId: id
      }
    });

    if (!media) {
      return NextResponse.json({ error: "Media asset not found" }, { status: 404 });
    }

    await getStorage().deleteFile(media.localPath);
    await prisma.mediaAsset.delete({
      where: {
        id: mediaId
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
