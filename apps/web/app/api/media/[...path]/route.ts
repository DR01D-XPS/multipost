import { lookup } from "mime-types";
import { prisma } from "@multipost/db";
import { handleApiError } from "../../../../lib/api";
import { getStorage } from "../../../../lib/server";

function parseRange(rangeHeader: string, size: number): { start: number; end: number } | null {
  const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
  if (!match) {
    return null;
  }

  const startRaw = match[1];
  const endRaw = match[2];
  const start = startRaw ? Number(startRaw) : 0;
  const end = endRaw ? Number(endRaw) : size - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end >= size) {
    return null;
  }

  return {
    start,
    end
  };
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await context.params;
    const relativePath = path.join("/");
    const [mediaAsset, telegramEmoji] = await Promise.all([
      prisma.mediaAsset.findFirst({
        select: {
          mimeType: true
        },
        where: {
          localPath: relativePath
        }
      }),
      prisma.telegramEmoji.findFirst({
        select: {
          previewMimeType: true
        },
        where: {
          previewPath: relativePath
        }
      })
    ]);

    if (!mediaAsset && !telegramEmoji) {
      return new Response("Not found", { status: 404 });
    }

    const buffer = await getStorage().readFile(relativePath);
    const mimeType = mediaAsset?.mimeType ?? telegramEmoji?.previewMimeType ?? lookup(relativePath) ?? "application/octet-stream";

    const rangeHeader = request.headers.get("range");
    const parsedRange = rangeHeader ? parseRange(rangeHeader, buffer.byteLength) : null;

    if (parsedRange) {
      const sliced = buffer.subarray(parsedRange.start, parsedRange.end + 1);
      const slicedBody = new Uint8Array(sliced);
      return new Response(slicedBody, {
        status: 206,
        headers: {
          "Content-Type": String(mimeType),
          "Content-Length": String(slicedBody.byteLength),
          "Content-Range": `bytes ${parsedRange.start}-${parsedRange.end}/${buffer.byteLength}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=3600"
        }
      });
    }

    const body = new Uint8Array(buffer);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": String(mimeType),
        "Content-Length": String(body.byteLength),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600"
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}
