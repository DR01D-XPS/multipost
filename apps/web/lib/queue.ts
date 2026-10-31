import type { Queue } from "bullmq";
import { createPublishQueue, getServerEnv, jobDelayUntil, publishJobName, type PublishJobPayload } from "@multipost/core";

const env = getServerEnv();
const globalForQueue = globalThis as unknown as {
  multipostQueue?: Queue<PublishJobPayload>;
};

export function getPublishQueue() {
  if (!globalForQueue.multipostQueue) {
    globalForQueue.multipostQueue = createPublishQueue(env.REDIS_URL);
  }

  return globalForQueue.multipostQueue;
}

export async function syncPublishTargetJob(input: {
  publishTargetId: string;
  publishTargetUpdatedAt: Date;
  mode: "DISABLED" | "NOW" | "SCHEDULED";
  scheduledAt?: Date | null;
}) {
  const queue = getPublishQueue();
  if (input.mode === "DISABLED") {
    return;
  }

  await queue.add(
    publishJobName,
    {
      publishTargetId: input.publishTargetId,
      publishTargetUpdatedAt: input.publishTargetUpdatedAt.toISOString(),
      triggeredBy: input.mode === "NOW" ? "NOW" : "SCHEDULED"
    },
    {
      jobId: `publish-target:${input.publishTargetId}:${input.publishTargetUpdatedAt.getTime()}`,
      delay: input.mode === "SCHEDULED" && input.scheduledAt ? jobDelayUntil(input.scheduledAt) : 0
    }
  );
}
