"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function CreatePostButton() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState("Новый черновик");

  function openDialog() {
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
    setTitle("Новый черновик");
  }

  async function handleCreate() {
    setIsCreating(true);
    const response = await fetch("/api/posts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: title.trim() || "Новый черновик"
      })
    });
    const payload = (await response.json()) as { post: { id: string } };
    closeDialog();
    router.push(`/posts/${payload.post.id}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={isCreating}
        className="inline-flex rounded-full border border-accent bg-accent px-5 py-2.5 text-sm font-medium text-white transition-all duration-300 ease-out hover:-translate-y-0.5 disabled:opacity-60"
      >
        {isCreating ? "Создание..." : "Новый черновик"}
      </button>

      <dialog ref={dialogRef} className="w-full max-w-xl rounded-[2rem] border border-line bg-panel p-0 shadow-studio">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreate();
          }}
          className="grid gap-5 p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">Новый черновик</p>
              <h3 className="mt-2 text-2xl font-semibold">Введите название черновика</h3>
            </div>

            <button type="button" onClick={closeDialog} className="rounded-full border border-line px-4 py-2 text-sm">
              Закрыть
            </button>
          </div>

          <label className="grid gap-2 text-sm">
            <span className="font-medium">Название</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="rounded-2xl border border-line bg-input px-4 py-3"
              placeholder="Например: Анонс нового поста"
              required
              autoFocus
            />
          </label>

          <button
            type="submit"
            disabled={isCreating}
            className="inline-flex w-fit rounded-full border border-accent bg-accent px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {isCreating ? "Создание..." : "Создать"}
          </button>
        </form>
      </dialog>
    </>
  );
}
