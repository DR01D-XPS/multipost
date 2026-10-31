CREATE TABLE "TelegramEmojiPack" (
  "id" TEXT NOT NULL,
  "setName" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "stickerType" TEXT NOT NULL,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramEmojiPack_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramEmoji" (
  "id" TEXT NOT NULL,
  "packId" TEXT NOT NULL,
  "customEmojiId" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "telegramFileId" TEXT NOT NULL,
  "telegramFileUniqueId" TEXT NOT NULL,
  "previewPath" TEXT,
  "previewMimeType" TEXT,
  "width" INTEGER,
  "height" INTEGER,
  "isAnimated" BOOLEAN NOT NULL DEFAULT false,
  "isVideo" BOOLEAN NOT NULL DEFAULT false,
  "needsRepainting" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramEmoji_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramEmojiPack_setName_key" ON "TelegramEmojiPack"("setName");
CREATE UNIQUE INDEX "TelegramEmoji_customEmojiId_key" ON "TelegramEmoji"("customEmojiId");
CREATE INDEX "TelegramEmojiPack_updatedAt_idx" ON "TelegramEmojiPack"("updatedAt");
CREATE INDEX "TelegramEmoji_packId_sortOrder_idx" ON "TelegramEmoji"("packId", "sortOrder");

ALTER TABLE "TelegramEmoji"
  ADD CONSTRAINT "TelegramEmoji_packId_fkey"
  FOREIGN KEY ("packId")
  REFERENCES "TelegramEmojiPack"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
