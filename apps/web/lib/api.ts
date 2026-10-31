import { ZodError } from "zod";
import { NextResponse } from "next/server";
import { ConnectorError } from "@multipost/connectors/types";

export function handleApiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Ошибка валидации",
        issues: error.issues
      },
      { status: 400 }
    );
  }

  if (error instanceof ConnectorError) {
    console.error("[api] connector error", error);
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        details: error.details
      },
      { status: error.retryable ? 503 : 400 }
    );
  }

  if (error instanceof Error) {
    console.error("[api] unexpected error", error);
    return NextResponse.json(
      {
        error: error.message
      },
      { status: 500 }
    );
  }

  console.error("[api] unknown error", error);
  return NextResponse.json(
    {
      error: "Неизвестная ошибка сервера"
    },
    { status: 500 }
  );
}
