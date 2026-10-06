import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { isDomainError } from "@/lib/domain/errors";

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
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "The request body is not valid JSON." } },
      { status: 400 },
    );
  }
  console.error(error);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
    { status: 500 },
  );
}
