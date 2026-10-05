import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_MS, sessionCookieOptions } from "./sessionToken";

export function attachSession(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(Math.floor(SESSION_TTL_MS / 1000)));
  return response;
}

export function clearSession(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return response;
}
