import { Queue } from "bullmq";
import IORedis from "ioredis";

export const publishQueueName = "publish-targets";
export const publishJobName = "publish-target";

export type PublishJobPayload = {
  publishTargetId: string;
  publishTargetUpdatedAt: string;
  triggeredBy: "NOW" | "SCHEDULED" | "RETRY";
};

export function createRedisConnection(redisUrl: string): IORedis {
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  });
}

export function createPublishQueue(redisUrl: string): Queue<PublishJobPayload> {
  return new Queue<PublishJobPayload>(publishQueueName, {
    connection: createRedisConnection(redisUrl),
    defaultJobOptions: {
      attempts: 6,
      backoff: {
        type: "exponential",
        delay: 3_000
      },
      removeOnComplete: 100,
      removeOnFail: 100
    }
  });
}

export function jobDelayUntil(when: Date): number {
  return Math.max(0, when.getTime() - Date.now());
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
