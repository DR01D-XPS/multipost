import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { encryptJson, getServerEnv } from "@multipost/core";
import { handleApiError } from "../../../../../lib/api";

const VK_ID_OAUTH_COOKIE = "multipost_vk_id_oauth";
const DEFAULT_VK_ID_AUTHORIZE_URL = "https://id.vk.com/authorize";
const VK_ID_OAUTH_TTL_SECONDS = 15 * 60;

type VkOauthCookiePayload = {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  createdAt: number;
};

function base64UrlEncode(input: Buffer): string {
  return input
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function generateCodeVerifier() {
  return base64UrlEncode(randomBytes(64));
}

function generateCodeChallenge(codeVerifier: string) {
  return base64UrlEncode(createHash("sha256").update(codeVerifier).digest());
}

function resolveVkIdClientId() {
  const clientId = process.env.VK_ID_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("VK_ID_CLIENT_ID is not configured.");
  }

  return clientId;
}

function resolveVkIdRedirectUri(appBaseUrl: string) {
  const customRedirectUri = process.env.VK_ID_REDIRECT_URI?.trim();
  if (customRedirectUri) {
    return customRedirectUri;
  }

  return new URL("/vk/callback", appBaseUrl).toString();
}

function resolveVkIdScope() {
  const rawScope = process.env.VK_ID_SCOPE?.trim();
  const requestedScopes = (rawScope ?? "email phone")
    .split(/[,\s]+/g)
    .map((scope) => scope.trim())
    .filter(Boolean);
  const allowedScopes = new Set(["email", "phone"]);
  const validScopes = requestedScopes.filter((scope) => allowedScopes.has(scope));
  if (validScopes.length === 0) {
    return "email phone";
  }

  return validScopes.join(" ");
}

function resolveVkIdAuthorizeUrl() {
  return process.env.VK_ID_AUTHORIZE_URL?.trim() || DEFAULT_VK_ID_AUTHORIZE_URL;
}

export async function POST(request: Request) {
  try {
    const env = getServerEnv();
    const clientId = resolveVkIdClientId();
    const redirectUri = resolveVkIdRedirectUri(env.APP_BASE_URL);
    const scope = resolveVkIdScope();

    const state = base64UrlEncode(randomBytes(32));
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const authorizeParams = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      scope
    });

    const cookiePayload: VkOauthCookiePayload = {
      state,
      codeVerifier,
      redirectUri,
      clientId,
      createdAt: Date.now()
    };

    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
    const isSecureRequest = forwardedProto === "https" || request.url.startsWith("https://");

    const response = NextResponse.json({
      authorizeUrl: `${resolveVkIdAuthorizeUrl()}?${authorizeParams.toString()}`,
      expiresInSeconds: VK_ID_OAUTH_TTL_SECONDS
    });

    response.cookies.set({
      name: VK_ID_OAUTH_COOKIE,
      value: encryptJson(cookiePayload, env.AUTH_COOKIE_SECRET),
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureRequest,
      path: "/",
      maxAge: VK_ID_OAUTH_TTL_SECONDS
    });

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
