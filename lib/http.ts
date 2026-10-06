import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DomainError, isDomainError } from "@/lib/domain/errors";

const INVALID_JSON_BODY = "The request body is not valid JSON.";

/** Parse a route body. Only this call maps a JSON SyntaxError to a client error. */
export async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) throw new DomainError("INVALID_INPUT", INVALID_JSON_BODY, 400);
    throw error;
  }
}

export function errorResponse(error: unknown) {
  if (isDomainError(error)) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.httpStatus },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: error.issues[0]?.message ?? "Invalid request." } },
      { status: 400 },
    );
  }
  console.error(error);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
    { status: 500 },
  );
}
