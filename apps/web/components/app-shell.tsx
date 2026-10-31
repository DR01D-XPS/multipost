"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { startTransition, type ReactNode } from "react";
import clsx from "clsx";
import { ThemeToggle } from "./theme-toggle";

const navItems = [
  { href: "/posts", label: "Посты" },
  { href: "/channels", label: "Каналы" },
  { href: "/analytics", label: "Аналитика" }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST"
    });

    startTransition(() => {
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 py-4 sm:px-6 lg:px-8">
      <header className="app-surface-elevated mb-6 rounded-[2rem] border border-line bg-panel px-5 py-5 shadow-studio backdrop-blur sm:px-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center rounded-full border border-ink/10 bg-accentSoft px-3 py-1 font-mono text-xs uppercase tracking-[0.24em] text-accent">
              Студия публикаций
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">Один пост на все соцсети</h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ThemeToggle />

            <nav className="flex flex-wrap gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "rounded-full border px-4 py-2 text-sm transition-all duration-300 ease-out will-change-transform hover:-translate-y-0.5",
                    pathname.startsWith(item.href)
                      ? "border-accent bg-accent text-white shadow-[0_8px_24px_rgba(15,139,109,0.28)]"
                      : "border-line bg-surface hover:border-accent/50 hover:bg-surfaceSoft"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <button
              type="button"
              onClick={logout}
              className="rounded-full border border-line bg-surface px-4 py-2 text-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-accentWarm hover:text-accentWarm"
            >
              Выйти
            </button>
          </div>
        </div>
      </header>

      <main className="app-page-fade flex-1">{children}</main>
    </div>
  );
}
