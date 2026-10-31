import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="rounded-[2rem] border border-line bg-panel p-8 shadow-studio">
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">404</p>
      <h2 className="mt-3 text-3xl font-semibold">Эта страница не найдена.</h2>
      <p className="mt-3 max-w-xl text-sm text-ink/70">Маршрут не существует или страница была удалена.</p>
      <Link
        href="/posts"
        className="mt-6 inline-flex rounded-full border border-accent bg-accent px-5 py-2.5 text-sm font-medium text-white"
      >
        Вернуться к постам
      </Link>
    </div>
  );
}
