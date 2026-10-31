import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, createSessionToken, getServerEnv, matchesAdminCredentials } from "@multipost/core";

export async function POST(request: Request) {
  const env = getServerEnv();
  const body = ((await request.json().catch(() => ({}))) ?? {}) as {
    username?: string;
    password?: string;
  };

  if (
    !body.username ||
    !body.password ||
    !matchesAdminCredentials(
      body.username,
      body.password,
      env.AUTH_ADMIN_USERNAME,
      env.AUTH_ADMIN_PASSWORD
    )
  ) {
    return NextResponse.json(
      {
        error: "Неверный логин или пароль"
      },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: createSessionToken(body.username, env.AUTH_COOKIE_SECRET),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24
  });

  return response;
}
