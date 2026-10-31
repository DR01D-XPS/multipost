import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

export type SaveFileInput = {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
};

export type StoredFile = {
  relativePath: string;
  absolutePath: string;
  size: number;
  mimeType: string;
  originalName: string;
};

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "-").replace(/-+/g, "-").toLowerCase();
}

function normalizeRelativePath(relativePath: string): string {
  const normalized = path.normalize(relativePath).replaceAll("\\", "/");
  if (normalized.startsWith("../") || normalized === "..") {
    throw new Error("Invalid storage path");
  }

  return normalized;
}

export class LocalFileStorage {
  constructor(private readonly root: string) {}

  async saveFile(input: SaveFileInput): Promise<StoredFile> {
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const safeName = sanitizeFilename(input.originalName || "upload.bin");
    const uniqueName = `${Date.now()}-${randomBytes(4).toString("hex")}-${safeName}`;
    const relativePath = normalizeRelativePath(path.posix.join(year, month, uniqueName));
    const absolutePath = path.resolve(this.root, relativePath);

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.buffer);

    return {
      relativePath,
      absolutePath,
      size: input.buffer.byteLength,
      mimeType: input.mimeType,
      originalName: input.originalName
    };
  }

  getAbsolutePath(relativePath: string): string {
    return path.resolve(this.root, normalizeRelativePath(relativePath));
  }

  async readFile(relativePath: string): Promise<Buffer> {
    return readFile(this.getAbsolutePath(relativePath));
  }

  async deleteFile(relativePath: string): Promise<void> {
    await rm(this.getAbsolutePath(relativePath), { force: true });
  }
}
