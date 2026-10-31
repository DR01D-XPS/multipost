import { Queue, Worker } from "bullmq";
import { ConnectorError, publishToChannel } from "@multipost/connectors";
import {
  createRedisConnection,
  decryptJson,
  getPlatformFromChannelType,
  getServerEnv,
  jobDelayUntil,
  LocalFileStorage,
  parseChannelConfig,
  publishJobName,
  publishQueueName,
  redactSecrets,
  resolveStorageRoot,
  richTextDocumentSchema,
  type PublishJobPayload,
  type ChannelType
} from "@multipost/core";
import { prisma } from "@multipost/db";
import { renderForPlatform } from "@multipost/renderers";

const env = getServerEnv();
const connection = createRedisConnection(env.REDIS_URL);
const queue = new Queue<PublishJobPayload>(publishQueueName, {
  connection,
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
const storage = new LocalFileStorage(resolveStorageRoot(env.STORAGE_ROOT));

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown worker error";
}

async function reconcilePendingTargets() {
  const pendingTargets = await prisma.publishTarget.findMany({
    where: {
      mode: {
        in: ["NOW", "SCHEDULED"]
      },
      status: {
        in: ["SCHEDULED", "PUBLISHING"]
      }
    },
    select: {
      id: true,
      mode: true,
      scheduledAt: true,
      updatedAt: true
    }
  });

  await Promise.all(
    pendingTargets.map((target) =>
      queue.add(
        publishJobName,
        {
          publishTargetId: target.id,
          publishTargetUpdatedAt: target.updatedAt.toISOString(),
          triggeredBy: target.mode === "NOW" ? "NOW" : "SCHEDULED"
        },
        {
          jobId: `publish-target:${target.id}:${target.updatedAt.getTime()}`,
          delay: target.mode === "SCHEDULED" && target.scheduledAt ? jobDelayUntil(target.scheduledAt) : 0
        }
      )
    )
  );

  console.log(`[worker] reconciled ${pendingTargets.length} pending targets`);
}
async function processPublishTarget(
  publishTargetId: string,
  expectedUpdatedAt: string,
  attemptsMade: number,
  attempts: number | undefined
) {
  const target = await prisma.publishTarget.findUnique({
    where: {
      id: publishTargetId
    },
    include: {
      channel: true,
      post: {
        include: {
          mediaAssets: {
            orderBy: {
              createdAt: "asc"
            }
          }
        }
      }
    }
  });

  if (!target) {
    return;
  }

  if (target.mode === "DISABLED") {
    return;
  }

  if (target.updatedAt.toISOString() !== expectedUpdatedAt) {
    return;
  }

  await prisma.publishTarget.update({
    where: {
      id: target.id
    },
    data: {
      status: "PUBLISHING",
      lastError: null
    }
  });

  try {
    const decryptedConfig = decryptJson(target.channel.config, env.CHANNEL_CONFIG_SECRET);
    const channelType = target.channel.type as unknown as ChannelType;
    const channel = {
      id: target.channel.id,
      type: channelType,
      name: target.channel.name,
      config: parseChannelConfig(channelType, decryptedConfig)
    };

    const content = richTextDocumentSchema.parse(target.post.content);
    const render = renderForPlatform(
      getPlatformFromChannelType(channel.type),
      content,
      target.post.mediaAssets.map((asset) => ({
        mimeType: asset.mimeType
      }))
    );

    const publishResult = await publishToChannel({
      channel,
      render,
      media: target.post.mediaAssets,
      storage
    });

    await prisma.$transaction([
      prisma.publishTarget.update({
        where: {
          id: target.id
        },
        data: {
          status: "PUBLISHED",
          lastError: null,
          externalIds: publishResult.externalIds ?? null
        }
      }),
      prisma.publishJobLog.create({
        data: {
          publishTargetId: target.id,
          status: "PUBLISHED",
          requestPayload: redactSecrets(publishResult.requestPayload),
          responsePayload: redactSecrets(publishResult.responsePayload)
        }
      })
    ]);
  } catch (error) {
    const message = toErrorMessage(error);
    const willRetry =
      error instanceof ConnectorError &&
      error.retryable &&
      typeof attempts === "number" &&
      attemptsMade + 1 < attempts;

    await prisma.$transaction([
      prisma.publishTarget.update({
        where: {
          id: target.id
        },
        data: {
          status: willRetry ? "SCHEDULED" : "FAILED",
          lastError: message
        }
      }),
      prisma.publishJobLog.create({
        data: {
          publishTargetId: target.id,
          status: "FAILED",
          errorStack: error instanceof Error ? error.stack ?? message : message
        }
      })
    ]);

    throw error;
  }
}

const worker = new Worker(
  publishQueueName,
  async (job) => {
    await processPublishTarget(
      job.data.publishTargetId,
      job.data.publishTargetUpdatedAt,
      job.attemptsMade,
      job.opts.attempts
    );
  },
  {
    connection,
    concurrency: 4
  }
);

worker.on("ready", () => {
  console.log(`[worker] ready on queue ${publishQueueName}`);
});

worker.on("completed", (job) => {
  console.log(`[worker] completed job ${job.id}`);
});

worker.on("failed", (job, error) => {
  console.error(`[worker] failed job ${job?.id ?? "unknown"}: ${toErrorMessage(error)}`);
});

const shutdown = async () => {
  await queue.close();
  await worker.close();
  await prisma.$disconnect();
  await connection.quit();
  process.exit(0);
};

await reconcilePendingTargets();

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
