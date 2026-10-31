"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChannelType } from "@multipost/core";
import type { ChannelView, TelegramEmojiPackView } from "../lib/server";
import { channelConfigLabels, channelTypeLabels } from "../lib/labels";
import { TelegramEmojiPacksManager } from "./telegram-emoji-packs-manager";
import { UiSelect, type UiSelectOption } from "./ui-select";

type ChannelConfigDraft = Record<string, string | number>;
type VkOauthResult = {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string | null;
  expiresIn: number | null;
  userId: string | number | null;
  scope: string | null;
  idToken: string | null;
};
type VkOauthCodePayload = {
  code: string;
  deviceId: string;
  state: string;
};
type VkOauthWindowMessage =
  | {
      type: "multipost-vk-id-oauth-code";
      payload: VkOauthCodePayload;
    }
  | {
      type: "multipost-vk-id-oauth-success";
      payload: VkOauthResult;
    }
  | {
      type: "multipost-vk-id-oauth-error";
      error: string;
    };

const secretConfigKeys = new Set(["accessToken", "botToken"]);

function defaultConfigForType(type: ChannelType): ChannelConfigDraft {
  switch (type) {
    case "VK_GROUP":
      return {
        groupId: "",
        accessToken: ""
      };
    case "TELEGRAM_CHANNEL":
      return {
        botToken: "",
        chatId: ""
      };
    case "MAX_CHAT":
      return {
        accessToken: "",
        chatId: ""
      };
  }
}

function buildEditableConfig(channel: ChannelView): ChannelConfigDraft {
  return Object.fromEntries(
    Object.entries(defaultConfigForType(channel.type)).map(([key, fallbackValue]) => {
      const value = channel.maskedConfig[key];
      return [key, secretConfigKeys.has(key) ? "" : (value ?? fallbackValue)];
    })
  ) as ChannelConfigDraft;
}

function isSecretConfigKey(key: string): boolean {
  return secretConfigKeys.has(key);
}

function getConfigFieldHint(type: ChannelType, key: string, dialogMode: "create" | "edit"): string | null {
  if (type === "VK_GROUP" && key === "accessToken") {
    return "Для API-публикации нужен user access token администратора сообщества. Если используете VK_PUBLISH_TRANSPORT=PLAYWRIGHT, поле можно оставить пустым.";
  }

  if (type === "VK_GROUP" && key === "groupId") {
    return "Укажите числовой ID сообщества без знака -.";
  }

  if (dialogMode === "edit" && isSecretConfigKey(key)) {
    return "Если оставить поле пустым, текущий токен сохранится.";
  }

  return null;
}

export function ChannelsManager({
  initialChannels,
  initialEmojiPacks
}: {
  initialChannels: ChannelView[];
  initialEmojiPacks: TelegramEmojiPackView[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const vkOauthPopupRef = useRef<Window | null>(null);
  const [channels, setChannels] = useState(initialChannels);
  const [name, setName] = useState("");
  const [type, setType] = useState<ChannelType>("TELEGRAM_CHANNEL");
  const [config, setConfig] = useState<ChannelConfigDraft>(defaultConfigForType("TELEGRAM_CHANNEL"));
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [messageByChannelId, setMessageByChannelId] = useState<Record<string, string>>({});
  const telegramChannels = useMemo(
    () => channels.filter((channel) => channel.type === "TELEGRAM_CHANNEL").map(({ id, name }) => ({ id, name })),
    [channels]
  );

  const configEntries = useMemo(() => Object.entries(config), [config]);
  const channelTypeOptions = useMemo<UiSelectOption<ChannelType>[]>(
    () =>
      (Object.entries(channelTypeLabels) as Array<[ChannelType, string]>).map(([value, label]) => ({
        value,
        label
      })),
    []
  );

  useEffect(() => {
    const exchangeVkOauthCode = async (payload: VkOauthCodePayload) => {
      setMessageByChannelId((current) => ({
        ...current,
        form: "Обмениваем код VK ID на токен..."
      }));

      const response = await fetch("/api/vk/oauth/exchange", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const exchangePayload = (await response.json().catch(() => ({}))) as VkOauthResult & {
        error?: string;
      };

      if (!response.ok || !exchangePayload.accessToken) {
        setMessageByChannelId((current) => ({
          ...current,
          form: exchangePayload.error ?? "Не удалось получить VK token через VK ID."
        }));
        return;
      }

      setConfig((current) => ({
        ...current,
        accessToken: exchangePayload.accessToken
      }));
      setMessageByChannelId((current) => ({
        ...current,
        form: "VK token получен и автоматически подставлен в поле."
      }));
    };

    const handleVkOauthMessage = (event: MessageEvent<unknown>) => {
      if (!event.data || typeof event.data !== "object") {
        return;
      }

      if (vkOauthPopupRef.current && event.source !== vkOauthPopupRef.current) {
        return;
      }

      const message = event.data as Partial<VkOauthWindowMessage>;
      if (message.type === "multipost-vk-id-oauth-code") {
        const payload = message.payload;
        if (
          !payload ||
          typeof payload.code !== "string" ||
          typeof payload.deviceId !== "string" ||
          typeof payload.state !== "string"
        ) {
          return;
        }

        void exchangeVkOauthCode(payload);
        if (vkOauthPopupRef.current && !vkOauthPopupRef.current.closed) {
          vkOauthPopupRef.current.close();
        }
        vkOauthPopupRef.current = null;
        return;
      }

      if (message.type === "multipost-vk-id-oauth-success") {
        const payload = message.payload;
        if (!payload || typeof payload.accessToken !== "string" || payload.accessToken.length === 0) {
          return;
        }

        setConfig((current) => ({
          ...current,
          accessToken: payload.accessToken
        }));
        setMessageByChannelId((current) => ({
          ...current,
          form: "VK token получен и автоматически подставлен в поле."
        }));
        return;
      }

      if (message.type === "multipost-vk-id-oauth-error") {
        setMessageByChannelId((current) => ({
          ...current,
          form: message.error ?? "Не удалось получить VK token через VK ID."
        }));
      }
    };

    window.addEventListener("message", handleVkOauthMessage);
    return () => {
      window.removeEventListener("message", handleVkOauthMessage);
    };
  }, []);

  async function startVkOauthFlow() {
    if (type !== "VK_GROUP") {
      return;
    }

    setMessageByChannelId((current) => ({
      ...current,
      form: "Открываем VK ID..."
    }));

    const response = await fetch("/api/vk/oauth/start", {
      method: "POST"
    });
    const payload = (await response.json().catch(() => ({}))) as {
      authorizeUrl?: string;
      error?: string;
    };

    if (!response.ok || !payload.authorizeUrl) {
      setMessageByChannelId((current) => ({
        ...current,
        form: payload.error ?? "Не удалось запустить VK ID OAuth поток."
      }));
      return;
    }

    const popup = window.open(
      payload.authorizeUrl,
      "multipost-vk-id-oauth",
      "width=560,height=760,menubar=no,toolbar=no,location=yes,resizable=yes,scrollbars=yes,status=no"
    );

    if (!popup) {
      setMessageByChannelId((current) => ({
        ...current,
        form: "Браузер заблокировал popup. Разрешите всплывающие окна и повторите."
      }));
      return;
    }

    vkOauthPopupRef.current = popup;
    popup.focus();
    setMessageByChannelId((current) => ({
      ...current,
      form: "Подтвердите вход в VK ID в открывшемся окне. После этого токен подставится автоматически."
    }));
  }

  function openCreateDialog() {
    setDialogMode("create");
    setEditingChannelId(null);
    resetForm();
    dialogRef.current?.showModal();
  }

  function openEditDialog(channel: ChannelView) {
    setDialogMode("edit");
    setEditingChannelId(channel.id);
    setType(channel.type);
    setName(channel.name);
    setConfig(buildEditableConfig(channel));
    setMessageByChannelId((current) => ({
      ...current,
      form: ""
    }));
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
    if (vkOauthPopupRef.current && !vkOauthPopupRef.current.closed) {
      vkOauthPopupRef.current.close();
    }
    resetForm();
  }

  function resetForm(nextType: ChannelType = "TELEGRAM_CHANNEL") {
    setType(nextType);
    setName("");
    setConfig(defaultConfigForType(nextType));
    setDialogMode("create");
    setEditingChannelId(null);
    setMessageByChannelId((current) => ({
      ...current,
      form: ""
    }));
  }

  function buildConfigPayload() {
    return Object.fromEntries(
      Object.entries(config)
        .filter(([key, value]) => !isSecretConfigKey(key) || String(value).trim().length > 0)
        .map(([key, value]) => [key, key === "groupId" ? Number(value) : value])
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    const isEdit = dialogMode === "edit" && editingChannelId;
    const response = await fetch(isEdit ? `/api/channels/${editingChannelId}` : "/api/channels", {
      method: isEdit ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...(isEdit ? {} : { type }),
        name,
        config: buildConfigPayload()
      })
    });

    const payload = (await response.json().catch(() => ({}))) as {
      channel?: ChannelView;
      error?: string;
    };

    if (!response.ok || !payload.channel) {
      setMessageByChannelId((current) => ({
        ...current,
        form: payload.error ?? (isEdit ? "Не удалось обновить канал." : "Не удалось создать канал.")
      }));
      setIsSaving(false);
      return;
    }

    setChannels((current) => {
      if (isEdit) {
        return current.map((channel) => (channel.id === payload.channel!.id ? payload.channel! : channel));
      }

      return [payload.channel!, ...current];
    });
    setMessageByChannelId((current) => ({
      ...current,
      form: ""
    }));
    setIsSaving(false);
    closeDialog();
    resetForm();
  }

  async function handleDelete(channelId: string) {
    if (!window.confirm("Удалить этот канал?")) {
      return;
    }

    const response = await fetch(`/api/channels/${channelId}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      setMessageByChannelId((current) => ({
        ...current,
        [channelId]: "Не удалось удалить канал."
      }));
      return;
    }

    setChannels((current) => current.filter((channel) => channel.id !== channelId));
  }

  async function handleTest(channelId: string) {
    setMessageByChannelId((current) => ({
      ...current,
      [channelId]: "Проверка канала..."
    }));

    const response = await fetch(`/api/channels/${channelId}/test`, {
      method: "POST"
    });
    const payload = (await response.json().catch(() => ({}))) as { message?: string; error?: string };

    setMessageByChannelId((current) => ({
      ...current,
      [channelId]: payload.message ?? payload.error ?? "Проверка завершена."
    }));
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-line bg-panel p-6 shadow-studio">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <h1 className="text-4xl font-semibold sm:text-5xl">Каналы</h1>

          <button
            type="button"
            onClick={openCreateDialog}
            className="inline-flex rounded-full border border-accent bg-accent px-5 py-2.5 text-sm font-medium text-white"
          >
            Добавить канал
          </button>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {channels.map((channel) => (
          <article key={channel.id} className="rounded-[1.75rem] border border-line bg-surface p-5 backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">{channelTypeLabels[channel.type]}</p>
                <h3 className="mt-2 text-xl font-semibold">{channel.name}</h3>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openEditDialog(channel)}
                  className="rounded-full border border-line bg-surfaceSoft px-4 py-2 text-sm hover:border-accent"
                >
                  Редактировать
                </button>
                <button
                  type="button"
                  onClick={() => handleTest(channel.id)}
                  className="rounded-full border border-line bg-surfaceSoft px-4 py-2 text-sm hover:border-accent"
                >
                  Проверить
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(channel.id)}
                  className="rounded-full border border-line bg-surfaceSoft px-4 py-2 text-sm hover:border-accentWarm hover:text-accentWarm"
                >
                  Удалить
                </button>
              </div>
            </div>

            <dl className="mt-4 grid gap-2 text-sm">
              {Object.entries(channel.maskedConfig).map(([key, value]) => (
                <div
                  key={key}
                  className="grid gap-2 rounded-2xl border border-line/70 bg-surfaceSoft px-4 py-3 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)] sm:items-start"
                >
                  <dt className="font-medium text-ink/80">{channelConfigLabels[key] ?? key}</dt>
                  <dd className="min-w-0 break-all font-mono text-xs text-ink/70 sm:text-right">{String(value)}</dd>
                </div>
              ))}
            </dl>

            {messageByChannelId[channel.id] ? <p className="mt-3 text-sm text-ink/70">{messageByChannelId[channel.id]}</p> : null}
          </article>
        ))}
      </div>

      <TelegramEmojiPacksManager initialPacks={initialEmojiPacks} telegramChannels={telegramChannels} />

      <dialog ref={dialogRef} className="w-full max-w-2xl rounded-[2rem] border border-line bg-panel p-0 shadow-studio">
        <form onSubmit={handleSubmit} className="grid gap-5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">
                {dialogMode === "edit" ? "Редактирование канала" : "Новый канал"}
              </p>
              <h3 className="mt-2 text-2xl font-semibold">
                {dialogMode === "edit" ? "Изменить данные публикации" : "Добавить учетные данные для публикации"}
              </h3>
            </div>

            <button type="button" onClick={closeDialog} className="rounded-full border border-line px-4 py-2 text-sm">
              Закрыть
            </button>
          </div>

          <label className="grid gap-2 text-sm">
            <span className="font-medium">Тип</span>
            <UiSelect
              value={type}
              onChange={(nextType) => {
                setType(nextType);
                setConfig(defaultConfigForType(nextType));
              }}
              options={channelTypeOptions}
              disabled={dialogMode === "edit"}
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium">Отображаемое имя</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded-2xl border border-line bg-input px-4 py-3"
              placeholder="Например: Основной Telegram-канал"
              required
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            {configEntries.map(([key, value]) => (
              <label key={key} className="grid gap-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{channelConfigLabels[key] ?? key}</span>
                  {type === "VK_GROUP" && key === "accessToken" ? (
                    <button
                      type="button"
                      onClick={startVkOauthFlow}
                      className="rounded-full border border-line bg-surfaceSoft px-3 py-1 text-xs font-medium hover:border-accent hover:text-accent"
                    >
                      Получить через VK ID
                    </button>
                  ) : null}
                </div>
                <input
                  value={String(value)}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      [key]: event.target.value
                    }))
                  }
                  className="rounded-2xl border border-line bg-input px-4 py-3"
                  placeholder={dialogMode === "edit" && isSecretConfigKey(key) ? "Оставьте пустым, чтобы сохранить токен" : undefined}
                  required={(dialogMode === "create" || !isSecretConfigKey(key)) && !(type === "VK_GROUP" && key === "accessToken")}
                />
                {getConfigFieldHint(type, key, dialogMode) ? (
                  <span className="text-xs text-ink/55">{getConfigFieldHint(type, key, dialogMode)}</span>
                ) : null}
              </label>
            ))}
          </div>

          {messageByChannelId.form ? <p className="text-sm text-rose-700">{messageByChannelId.form}</p> : null}

          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex w-fit rounded-full border border-accent bg-accent px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {isSaving ? "Сохранение..." : dialogMode === "edit" ? "Сохранить изменения" : "Сохранить канал"}
          </button>
        </form>
      </dialog>
    </div>
  );
}
