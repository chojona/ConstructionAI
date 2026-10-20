/**
 * Largest upload we accept, in bytes.
 *
 * Vercel Functions reject a request body above 4.5 MB (4_500_000 bytes) before
 * route code runs, and the response is not JSON. 4_400_000 stays under that
 * platform cap and leaves about 100 KB for multipart framing and form fields.
 * Desk copy says "4 MB", under that platform limit.
 */
export const MAX_UPLOAD_BYTES = 4_400_000;

/** Room for multipart boundaries and the other form fields on Content-Length. */
const UPLOAD_BODY_FRAMING_BYTES = 16_384;

export const UPLOAD_HELPER_TEXT = "PDF up to 4 MB. The file needs selectable text.";

export const UPLOAD_TOO_LARGE_MESSAGE = "This file is over 4 MB. For now, split it into smaller PDFs by discipline or sheet range. Large plan sets are coming soon.";

export function uploadFileTooLarge(file: { size: number } | null | undefined): boolean {
  return !!file && file.size > MAX_UPLOAD_BYTES;
}

export function uploadBodyTooLarge(request: { headers: { get(name: string): string | null } }): boolean {
  const raw = request.headers.get("content-length");
  if (!raw) return false;
  const length = Number(raw);
  return Number.isFinite(length) && length > MAX_UPLOAD_BYTES + UPLOAD_BODY_FRAMING_BYTES;
}

export function uploadTooLargeResponse(): Response {
  return Response.json(
    { error: { code: "FILE_TOO_LARGE", message: UPLOAD_TOO_LARGE_MESSAGE } },
    { status: 413 },
  );
}

export interface UploadAttempt {
  ok: boolean;
  /** Always false. Upload forms assign this so Processing… cannot stick. */
  pending: false;
  error: string;
  status: number | null;
  body: unknown;
}

function failed(error: string, status: number | null, body: unknown): UploadAttempt {
  return { ok: false, pending: false, error, status, body };
}

async function readJsonBody(response: Response): Promise<{ json: boolean; body: unknown }> {
  const type = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!type.includes("json")) return { json: false, body: null };
  try {
    return { json: true, body: await response.json() };
  } catch {
    return { json: false, body: null };
  }
}

function messageFrom(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") return "";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message.trim() : "";
}

/**
 * Client-side upload attempt for the revision and export forms.
 * Oversize files are rejected before `send`. Network errors, non-JSON bodies,
 * and 413 responses resolve (they do not throw) with `pending: false`.
 */
export async function completeUploadAttempt(input: {
  file: { size: number } | null;
  fallbackError: string;
  send: () => Promise<Response>;
}): Promise<UploadAttempt> {
  if (uploadFileTooLarge(input.file)) {
    return failed(UPLOAD_TOO_LARGE_MESSAGE, null, null);
  }
  try {
    const response = await input.send();
    if (response.status === 413) return failed(UPLOAD_TOO_LARGE_MESSAGE, 413, null);
    const parsed = await readJsonBody(response);
    if (!response.ok) {
      return failed(messageFrom(parsed.body) || input.fallbackError, response.status, parsed.body);
    }
    if (!parsed.json) return failed(input.fallbackError, response.status, null);
    return { ok: true, pending: false, error: "", status: response.status, body: parsed.body };
  } catch {
    return failed(input.fallbackError, null, null);
  }
}
