import { prisma } from "@multipost/db";
import type { PublishStatus } from "@multipost/core";
import { AnalyticsFilters } from "../../components/analytics-filters";

export const dynamic = "force-dynamic";

type StatusCounts = Record<PublishStatus, number>;

function buildStatusCounts(): StatusCounts {
  return {
    DRAFT: 0,
    SCHEDULED: 0,
    PUBLISHING: 0,
    PUBLISHED: 0,
    FAILED: 0
  };
}

function parseDate(value: string | undefined, fallback: Date): Date {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed;
}

function toDateInputValue(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default async function AnalyticsPage({
  searchParams
}: {
  searchParams: Promise<{
    channelId?: string;
    postId?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const params = await searchParams;
  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setDate(today.getDate() - 30);

  const from = parseDate(params.from, defaultFrom);
  const to = parseDate(params.to, today);
  const toEnd = new Date(to);
  toEnd.setHours(23, 59, 59, 999);

  const [channels, posts, targets] = await Promise.all([
    prisma.channel.findMany({
      select: {
        id: true,
        name: true,
        type: true
      },
      orderBy: {
        name: "asc"
      }
    }),
    prisma.post.findMany({
      select: {
        id: true,
        title: true
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 300
    }),
    prisma.publishTarget.findMany({
      where: {
        updatedAt: {
          gte: from,
          lte: toEnd
        },
        ...(params.channelId ? { channelId: params.channelId } : {}),
        ...(params.postId ? { postId: params.postId } : {})
      },
      include: {
        channel: {
          select: {
            id: true,
            name: true,
            type: true
          }
        },
        post: {
          select: {
            id: true,
            title: true
          }
        }
      },
      orderBy: {
        updatedAt: "desc"
      }
    })
  ]);

  const statusCounts = buildStatusCounts();
  const channelStats = new Map<
    string,
    {
      id: string;
      name: string;
      type: string;
      total: number;
      published: number;
      failed: number;
      scheduled: number;
    }
  >();
  const postStats = new Map<
    string,
    {
      id: string;
      title: string;
      total: number;
      published: number;
      failed: number;
      scheduled: number;
    }
  >();
  const timeline = new Map<string, { published: number; failed: number }>();

  for (const target of targets) {
    statusCounts[target.status] += 1;

    const channelEntry =
      channelStats.get(target.channelId) ??
      {
        id: target.channelId,
        name: target.channel?.name ?? "Неизвестный канал",
        type: target.channel?.type ?? "UNKNOWN",
        total: 0,
        published: 0,
        failed: 0,
        scheduled: 0
      };
    channelEntry.total += 1;
    if (target.status === "PUBLISHED") {
      channelEntry.published += 1;
    }
    if (target.status === "FAILED") {
      channelEntry.failed += 1;
    }
    if (target.status === "SCHEDULED") {
      channelEntry.scheduled += 1;
    }
    channelStats.set(target.channelId, channelEntry);

    const postEntry =
      postStats.get(target.postId) ??
      {
        id: target.postId,
        title: target.post?.title ?? "Пост",
        total: 0,
        published: 0,
        failed: 0,
        scheduled: 0
      };
    postEntry.total += 1;
    if (target.status === "PUBLISHED") {
      postEntry.published += 1;
    }
    if (target.status === "FAILED") {
      postEntry.failed += 1;
    }
    if (target.status === "SCHEDULED") {
      postEntry.scheduled += 1;
    }
    postStats.set(target.postId, postEntry);

    const dayKey = toDateInputValue(target.updatedAt);
    const dayEntry = timeline.get(dayKey) ?? { published: 0, failed: 0 };
    if (target.status === "PUBLISHED") {
      dayEntry.published += 1;
    }
    if (target.status === "FAILED") {
      dayEntry.failed += 1;
    }
    timeline.set(dayKey, dayEntry);
  }

  const totalTargets = targets.length;
  const successRate = totalTargets > 0 ? Math.round((statusCounts.PUBLISHED / totalTargets) * 100) : 0;
  const failedRate = totalTargets > 0 ? Math.round((statusCounts.FAILED / totalTargets) * 100) : 0;
  const topChannels = [...channelStats.values()].sort((left, right) => right.total - left.total).slice(0, 12);
  const topPosts = [...postStats.values()].sort((left, right) => right.total - left.total).slice(0, 20);
  const maxTimelineValue = Math.max(
    1,
    ...[...timeline.values()].map((item) => item.published + item.failed)
  );
  const timelineRows = [...timeline.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .slice(-20);

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-line bg-panel p-6 shadow-studio">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">Аналитика</p>
            <h2 className="mt-2 text-3xl font-semibold">Статистика каналов и постов</h2>
            <p className="mt-2 text-sm text-ink/70">
              Выберите канал, пост и промежуток времени. Метрики строятся по фактическим статусам публикаций и логам.
            </p>
          </div>
        </div>

        <AnalyticsFilters
          channels={channels.map((channel) => ({
            id: channel.id,
            name: channel.name
          }))}
          posts={posts.map((post) => ({
            id: post.id,
            title: post.title
          }))}
          initialChannelId={params.channelId ?? ""}
          initialPostId={params.postId ?? ""}
          initialFrom={toDateInputValue(from)}
          initialTo={toDateInputValue(to)}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[1.5rem] border border-line bg-surface p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-ink/55">Всего публикаций</p>
          <p className="mt-2 text-3xl font-semibold">{totalTargets}</p>
        </article>
        <article className="rounded-[1.5rem] border border-line bg-surface p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-ink/55">Успешно</p>
          <p className="mt-2 text-3xl font-semibold">{successRate}%</p>
          <p className="mt-1 text-sm text-ink/65">{statusCounts.PUBLISHED} публикаций</p>
        </article>
        <article className="rounded-[1.5rem] border border-line bg-surface p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-ink/55">Ошибки</p>
          <p className="mt-2 text-3xl font-semibold">{failedRate}%</p>
          <p className="mt-1 text-sm text-ink/65">{statusCounts.FAILED} неудачных</p>
        </article>
        <article className="rounded-[1.5rem] border border-line bg-surface p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-ink/55">В очереди</p>
          <p className="mt-2 text-3xl font-semibold">{statusCounts.SCHEDULED + statusCounts.PUBLISHING}</p>
          <p className="mt-1 text-sm text-ink/65">Запланировано и публикуется</p>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-[1.75rem] border border-line bg-surface p-5">
          <h3 className="text-xl font-semibold">Каналы</h3>
          <div className="mt-4 space-y-3">
            {topChannels.length === 0 ? (
              <p className="text-sm text-ink/65">Нет данных за выбранный период.</p>
            ) : (
              topChannels.map((item) => (
                <div key={item.id} className="rounded-2xl border border-line bg-surfaceSoft p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="mt-1 text-xs text-ink/60">{item.type}</p>
                    </div>
                    <p className="text-lg font-semibold">{item.total}</p>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <span className="rounded-xl bg-emerald-100 px-2 py-1 text-emerald-700">OK {item.published}</span>
                    <span className="rounded-xl bg-rose-100 px-2 py-1 text-rose-700">ERR {item.failed}</span>
                    <span className="rounded-xl bg-sky-100 px-2 py-1 text-sky-700">Q {item.scheduled}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="rounded-[1.75rem] border border-line bg-surface p-5">
          <h3 className="text-xl font-semibold">Динамика по дням</h3>
          <div className="mt-4 space-y-3">
            {timelineRows.length === 0 ? (
              <p className="text-sm text-ink/65">Нет данных за выбранный период.</p>
            ) : (
              timelineRows.map(([day, values]) => {
                const total = values.published + values.failed;
                const width = Math.max(6, Math.round((total / maxTimelineValue) * 100));

                return (
                  <div key={day}>
                    <div className="mb-1 flex items-center justify-between text-xs text-ink/65">
                      <span>{day}</span>
                      <span>
                        {values.published} / {values.failed}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-surfaceSoft">
                      <div className="h-2 rounded-full bg-accent transition-[width] duration-500" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </article>
      </section>

      <section className="rounded-[1.75rem] border border-line bg-surface p-5">
        <h3 className="text-xl font-semibold">Посты</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-ink/65">
                <th className="px-3 py-2 font-medium">Пост</th>
                <th className="px-3 py-2 font-medium">Всего</th>
                <th className="px-3 py-2 font-medium">Опубликовано</th>
                <th className="px-3 py-2 font-medium">Ошибки</th>
                <th className="px-3 py-2 font-medium">Запланировано</th>
              </tr>
            </thead>
            <tbody>
              {topPosts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-ink/60">
                    Нет данных по постам за выбранный период.
                  </td>
                </tr>
              ) : (
                topPosts.map((item) => (
                  <tr key={item.id} className="border-b border-line/60 last:border-b-0">
                    <td className="px-3 py-3">{item.title}</td>
                    <td className="px-3 py-3">{item.total}</td>
                    <td className="px-3 py-3 text-emerald-700">{item.published}</td>
                    <td className="px-3 py-3 text-rose-700">{item.failed}</td>
                    <td className="px-3 py-3 text-sky-700">{item.scheduled}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-line bg-panel p-5 text-sm text-ink/70">
        Статусы учитываются по выбранному интервалу времени и фильтрам. Для внешних метрик (охваты, просмотры, реакции) можно подключить
        отдельные источники данных позже.
      </section>
    </div>
  );
}
