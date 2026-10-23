import { UploadPartCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** RT's per-part bar: presigned UploadPart URLs last 15 minutes. */
export const PRESIGNED_UPLOAD_PART_EXPIRES_SECONDS = 900;

export class PresignedUploadPartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PresignedUploadPartError";
  }
}

export interface SignUploadPartInput {
  bucket: string;
  key: string;
  uploadId: string;
  partNumber: number;
  contentLength: number;
  /** Base64 SHA-256 of the part body. Sent as a signed `x-amz-checksum-sha256` header. */
  checksumSha256?: string;
}

/**
 * Sign one UploadPart PUT.
 *
 * `Content-Length` is a signed header (`X-Amz-SignedHeaders` includes `content-length`).
 * `@aws-sdk/s3-request-presigner` 3.1146.0 does not hoist that header into the query
 * string, so the integer is covered by the signature rather than copied into the URL.
 * A PUT whose Content-Length differs from this value fails SigV4 when the store checks it.
 */
export async function signUploadPartUrl(
  client: S3Client,
  input: SignUploadPartInput,
  expiresInSeconds = PRESIGNED_UPLOAD_PART_EXPIRES_SECONDS,
): Promise<string> {
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > PRESIGNED_UPLOAD_PART_EXPIRES_SECONDS) {
    throw new PresignedUploadPartError("Upload part URLs expire within 900 seconds.");
  }
  if (!Number.isInteger(input.partNumber) || input.partNumber < 1 || input.partNumber > 10_000) {
    throw new PresignedUploadPartError("Part number is outside 1..10000.");
  }
  if (!Number.isInteger(input.contentLength) || input.contentLength < 0) {
    throw new PresignedUploadPartError("Content-Length must be a non-negative integer.");
  }
  const signableHeaders = new Set(["content-length"]);
  const unhoistableHeaders = new Set<string>();
  if (input.checksumSha256 !== undefined) {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.checksumSha256)) {
      throw new PresignedUploadPartError("Checksum SHA-256 must be base64.");
    }
    signableHeaders.add("x-amz-checksum-sha256");
    unhoistableHeaders.add("x-amz-checksum-sha256");
  }
  return getSignedUrl(
    client,
    new UploadPartCommand({
      Bucket: input.bucket,
      Key: input.key,
      UploadId: input.uploadId,
      PartNumber: input.partNumber,
      ContentLength: input.contentLength,
      ChecksumSHA256: input.checksumSha256,
    }),
    {
      expiresIn: expiresInSeconds,
      signableHeaders,
      unhoistableHeaders,
    },
  );
}

/** True when this installed SDK accepts per-part ChecksumSHA256 on UploadPart. */
export function uploadPartChecksumSha256Supported(): boolean {
  const command = new UploadPartCommand({
    Bucket: "b",
    Key: "k",
    UploadId: "u",
    PartNumber: 1,
    ChecksumSHA256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  });
  return typeof command.input.ChecksumSHA256 === "string";
}
