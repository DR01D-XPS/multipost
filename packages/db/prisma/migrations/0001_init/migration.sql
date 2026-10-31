CREATE TYPE "ChannelType" AS ENUM ('VK_GROUP', 'TELEGRAM_CHANNEL', 'MAX_CHAT');
CREATE TYPE "MediaKind" AS ENUM ('image', 'video', 'audio', 'file');
CREATE TYPE "PublishMode" AS ENUM ('DISABLED', 'NOW', 'SCHEDULED');
CREATE TYPE "PublishStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Channel" (
  "id" TEXT NOT NULL,
  "type" "ChannelType" NOT NULL,
  "name" TEXT NOT NULL,
  "config" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Post" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaAsset" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "kind" "MediaKind" NOT NULL,
  "localPath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "originalName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublishTarget" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "mode" "PublishMode" NOT NULL DEFAULT 'DISABLED',
  "scheduledAt" TIMESTAMP(3),
  "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
  "lastError" TEXT,
  "externalIds" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublishTarget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublishJobLog" (
  "id" TEXT NOT NULL,
  "publishTargetId" TEXT NOT NULL,
  "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "PublishStatus" NOT NULL,
  "requestPayload" JSONB,
  "responsePayload" JSONB,
  "errorStack" TEXT,
  CONSTRAINT "PublishJobLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "PublishTarget_postId_channelId_key" ON "PublishTarget"("postId", "channelId");
CREATE INDEX "Channel_type_idx" ON "Channel"("type");
CREATE INDEX "Post_updatedAt_idx" ON "Post"("updatedAt");
CREATE INDEX "MediaAsset_postId_idx" ON "MediaAsset"("postId");
CREATE INDEX "PublishTarget_status_idx" ON "PublishTarget"("status");
CREATE INDEX "PublishTarget_scheduledAt_idx" ON "PublishTarget"("scheduledAt");
CREATE INDEX "PublishJobLog_publishTargetId_runAt_idx" ON "PublishJobLog"("publishTargetId", "runAt" DESC);

ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_postId_fkey"
  FOREIGN KEY ("postId")
  REFERENCES "Post"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "PublishTarget"
  ADD CONSTRAINT "PublishTarget_postId_fkey"
  FOREIGN KEY ("postId")
  REFERENCES "Post"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "PublishTarget"
  ADD CONSTRAINT "PublishTarget_channelId_fkey"
  FOREIGN KEY ("channelId")
  REFERENCES "Channel"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "PublishJobLog"
  ADD CONSTRAINT "PublishJobLog_publishTargetId_fkey"
  FOREIGN KEY ("publishTargetId")
  REFERENCES "PublishTarget"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
