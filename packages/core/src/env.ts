import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  APP_BASE_URL: z.string().url(),
  AUTH_ADMIN_USERNAME: z.string().min(1),
  AUTH_ADMIN_PASSWORD: z.string().min(1),
  AUTH_COOKIE_SECRET: z.string().min(16),
  CHANNEL_CONFIG_SECRET: z.string().min(16),
  STORAGE_ROOT: z.string().min(1),
  TELEGRAM_DEFAULT_PARSE_MODE: z.enum(["HTML", "MarkdownV2"]).default("HTML"),
  MAX_DEFAULT_FORMAT: z.enum(["markdown", "html"]).default("markdown"),
  VK_API_VERSION: z.string().default("5.199")
});

export type ServerEnv = z.infer<typeof envSchema>;

let cachedEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  cachedEnv = envSchema.parse(process.env);
  return cachedEnv;
}

function findWorkspaceRoot(start: string): string {
  let current = start;

  while (true) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return start;
    }

    current = parent;
  }
}

export function resolveStorageRoot(storageRoot: string): string {
  if (path.isAbsolute(storageRoot)) {
    return storageRoot;
  }

  return path.resolve(findWorkspaceRoot(process.cwd()), storageRoot);
}
