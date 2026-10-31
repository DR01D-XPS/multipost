"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username,
        password
      })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "Не удалось войти");
      setIsSubmitting(false);
      return;
    }

    router.push(nextPath || "/posts");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[2rem] border border-line bg-panel p-8 shadow-studio backdrop-blur">
      <div className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">Вход</p>
        <h1 className="mt-3 text-3xl font-semibold">Войдите, чтобы управлять постами и публикациями.</h1>
      </div>

      <div className="grid gap-4">
        <label className="grid gap-2 text-sm">
          <span className="font-medium">Логин</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="rounded-2xl border border-line bg-input px-4 py-3 outline-none transition focus:border-accent"
            autoComplete="username"
            required
          />
        </label>

        <label className="grid gap-2 text-sm">
          <span className="font-medium">Пароль</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-2xl border border-line bg-input px-4 py-3 outline-none transition focus:border-accent"
            autoComplete="current-password"
            required
          />
        </label>
      </div>

      {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-6 inline-flex rounded-full border border-accent bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#0a765d] disabled:opacity-60"
      >
        {isSubmitting ? "Вход..." : "Войти"}
      </button>
    </form>
  );
}
