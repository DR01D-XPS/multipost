import { NextResponse, type NextRequest } from "next/server";

const AUTH_COOKIE_NAME = "multipost_session";
const publicPaths = ["/login", "/api/auth/login", "/vk/callback"];

function isPublicPath(pathname: string): boolean {
  return publicPaths.includes(pathname) || pathname.startsWith("/_next") || pathname === "/favicon.ico";
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(`${normalized}${padding}`);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

async function verifySessionToken(token: string | undefined, secret: string | undefined) {
  if (!token || !secret) {
    return null;
  }

  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) {
    return null;
  }

  const expectedSignature = await sign(payloadPart, secret);
  if (expectedSignature !== signaturePart) {
    return null;
  }

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadPart))) as {
      exp: number;
    };

    if (payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await verifySessionToken(
    request.cookies.get(AUTH_COOKIE_NAME)?.value,
    process.env.AUTH_COOKIE_SECRET
  );

  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/posts", request.url));
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\..*).*)", "/api/:path*"]
};
