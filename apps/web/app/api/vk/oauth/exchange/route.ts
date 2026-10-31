import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptJson, getServerEnv } from "@multipost/core";
import { z } from "zod";
import { handleApiError } from "../../../../../lib/api";

const VK_ID_OAUTH_COOKIE = "multipost_vk_id_oauth";
const VK_ID_TOKEN_URL = "https://id.vk.ru/oauth2/auth";
const VK_ID_OAUTH_TTL_MS = 15 * 60 * 1000;

type VkOauthCookiePayload = {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  createdAt: number;
};

type VkIdTokenSuccessResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  user_id?: string | number;
  scope?: string;
  id_token?: string;
};

type VkIdTokenErrorResponse = {
  error: string;
  error_description?: string;
};

const exchangeBodySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  deviceId: z.string().min(1)
});

function clearVkOauthCookie(response: NextResponse) {
  response.cookies.set({
    name: VK_ID_OAUTH_COOKIE,
    value: "",
    path: "/",
    maxAge: 0
  });
}

export async function POST(request: Request) {
  try {
    const env = getServerEnv();
    const body = exchangeBodySchema.parse(await request.json());
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(VK_ID_OAUTH_COOKIE)?.value;

    if (!cookieValue) {
      return NextResponse.json(
        {
          error: "VK OAuth session not found. Start authorization again from Channels page."
        },
        { status: 400 }
      );
    }

    let oauthPayload: VkOauthCookiePayload;
    try {
      oauthPayload = decryptJson<VkOauthCookiePayload>(cookieValue, env.AUTH_COOKIE_SECRET);
    } catch {
      return NextResponse.json(
        {
          error: "VK OAuth session is invalid. Start authorization again."
        },
        { status: 400 }
      );
    }

    if (Date.now() - oauthPayload.createdAt > VK_ID_OAUTH_TTL_MS) {
      const response = NextResponse.json(
        {
          error: "VK OAuth session expired. Start authorization again."
        },
        { status: 400 }
      );
      clearVkOauthCookie(response);
      return response;
    }

    if (oauthPayload.state !== body.state) {
      return NextResponse.json(
        {
          error: "VK OAuth state mismatch. Start authorization again."
        },
        { status: 400 }
      );
    }

    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      code_verifier: oauthPayload.codeVerifier,
      redirect_uri: oauthPayload.redirectUri,
      code: body.code,
      client_id: oauthPayload.clientId,
      device_id: body.deviceId,
      state: body.state
    });

    const vkResponse = await fetch(VK_ID_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: tokenParams
    });

    const payload = (await vkResponse.json()) as VkIdTokenSuccessResponse | VkIdTokenErrorResponse;

    if (!vkResponse.ok || ("error" in payload && payload.error)) {
      const errorDescription =
        "error_description" in payload && payload.error_description
          ? `${payload.error}: ${payload.error_description}`
          : "error" in payload && payload.error
            ? payload.error
            : `HTTP ${vkResponse.status}`;

      return NextResponse.json(
        {
          error: `VK ID token exchange failed: ${errorDescription}`
        },
        { status: 400 }
      );
    }

    if (!("access_token" in payload) || typeof payload.access_token !== "string" || payload.access_token.length === 0) {
      return NextResponse.json(
        {
          error: "VK ID token exchange returned an unexpected payload."
        },
        { status: 400 }
      );
    }

    const response = NextResponse.json({
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? null,
      tokenType: payload.token_type ?? null,
      expiresIn: payload.expires_in ?? null,
      userId: payload.user_id ?? null,
      scope: payload.scope ?? null,
      idToken: payload.id_token ?? null
    });

    clearVkOauthCookie(response);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
