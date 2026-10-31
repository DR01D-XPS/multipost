ALTER TABLE "MediaAsset"
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "postId" ORDER BY "createdAt" ASC, "id" ASC) - 1 AS row_number
  FROM "MediaAsset"
)
UPDATE "MediaAsset" AS media
SET "sortOrder" = ordered.row_number
FROM ordered
WHERE media."id" = ordered."id";

CREATE INDEX "MediaAsset_postId_sortOrder_idx" ON "MediaAsset"("postId", "sortOrder");
