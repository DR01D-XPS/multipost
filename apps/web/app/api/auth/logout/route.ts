import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@multipost/core";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    path: "/",
    maxAge: 0
  });

  return response;
}

