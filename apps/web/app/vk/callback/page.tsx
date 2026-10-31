"use client";

import { useEffect, useState } from "react";

type VkOauthCodePayload = {
  code: string;
  deviceId: string;
  state: string;
};

type CallbackState =
  | { status: "loading"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type VkOauthWindowMessage =
  | {
      type: "multipost-vk-id-oauth-code";
      payload: VkOauthCodePayload;
    }
  | {
      type: "multipost-vk-id-oauth-error";
      error: string;
    };

function postToOpener(message: VkOauthWindowMessage) {
  if (typeof window === "undefined" || !window.opener) {
    return;
  }

  // Callback may run on a different origin than the main app window.
  window.opener.postMessage(message, "*");
}

export default function VkCallbackPage() {
  const [callbackState, setCallbackState] = useState<CallbackState>({
    status: "loading",
    message: "Завершаем авторизацию VK ID..."
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const deviceId = params.get("device_id");
    const state = params.get("state");
    const vkError = params.get("error");
    const vkErrorDescription = params.get("error_description");

    if (vkError) {
      const errorMessage = `VK ID вернул ошибку: ${vkErrorDescription ? `${vkError} (${vkErrorDescription})` : vkError}`;
      setCallbackState({
        status: "error",
        message: errorMessage
      });
      postToOpener({
        type: "multipost-vk-id-oauth-error",
        error: errorMessage
      });
      return;
    }

    if (!code || !deviceId || !state) {
      const errorMessage = "В callback URL не хватает параметров code/device_id/state.";
      setCallbackState({
        status: "error",
        message: errorMessage
      });
      postToOpener({
        type: "multipost-vk-id-oauth-error",
        error: errorMessage
      });
      return;
    }

    setCallbackState({
      status: "success",
      message: "Готово. Код авторизации передан в основное окно."
    });

    postToOpener({
      type: "multipost-vk-id-oauth-code",
      payload: {
        code,
        deviceId,
        state
      }
    });

    window.setTimeout(() => {
      window.close();
    }, 800);
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="rounded-[1.5rem] border border-line bg-panel p-6 shadow-studio">
        <h1 className="text-2xl font-semibold">VK ID callback</h1>
        <p className="mt-3 text-sm text-ink/75">{callbackState.message}</p>
      </div>
    </main>
  );
}

