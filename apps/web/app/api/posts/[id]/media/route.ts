import { NextResponse } from "next/server";
import { prisma } from "@multipost/db";
import { handleApiError } from "../../../../../lib/api";
import { getStorage, serializeMediaAsset } from "../../../../../lib/server";

function resolveMediaKind(mimeType: string): "image" | "video" | null {
  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  return null;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const formData = await request.formData();
    const files = formData.getAll("files");

    if (files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    const storage = getStorage();
    const uploadedAssets = [];

    for (const fileEntry of files) {
      if (!(fileEntry instanceof File)) {
        continue;
      }

      const mediaKind = resolveMediaKind(fileEntry.type);
      if (!mediaKind) {
        return NextResponse.json(
          {
            error: "Поддерживаются только изображения, GIF и видео."
          },
          { status: 400 }
        );
      }

      const stored = await storage.saveFile({
        originalName: fileEntry.name,
        mimeType: fileEntry.type,
        buffer: Buffer.from(await fileEntry.arrayBuffer())
      });

      const asset = await prisma.mediaAsset.create({
        data: {
          postId: id,
          kind: mediaKind,
          localPath: stored.relativePath,
          mimeType: stored.mimeType,
          size: stored.size,
          originalName: stored.originalName
        }
      });

      uploadedAssets.push(asset);
    }

    if (uploadedAssets.length === 0) {
      return NextResponse.json({ error: "Не удалось обработать загруженные файлы." }, { status: 400 });
    }

    return NextResponse.json({
      mediaAssets: uploadedAssets.map(serializeMediaAsset)
    });
  } catch (error) {
    return handleApiError(error);
  }
}
