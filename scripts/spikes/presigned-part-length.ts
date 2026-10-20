/**
 * CON-125 PR 0. Probe whether a non-production Neon Object Storage bucket
 * enforces Content-Length on a presigned UploadPart URL, and whether a
 * mismatched x-amz-checksum-sha256 is rejected.
 *
 * Refuses to run unless all of these are set, and refuses production-looking
 * names, VERCEL_ENV=production, and NODE_ENV=production:
 *   SPIKE_STORAGE_ENV=nonprod
 *   SPIKE_BUCKET=<neon-branch bucket; the only bucket this script writes>
 *   SPIKE_ENDPOINT=<https neon-branch origin, no path or query>
 *   OBJECT_STORAGE_ENDPOINT or AWS_ENDPOINT_URL_S3 equal to SPIKE_ENDPOINT
 *   OBJECT_STORAGE_ACCESS_KEY_ID / OBJECT_STORAGE_SECRET_ACCESS_KEY
 *     or AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
 *   OBJECT_STORAGE_REGION or AWS_REGION (default us-east-1)
 *
 * OBJECT_STORAGE_* wins over the AWS_* / DOCUMENT_STORAGE_BUCKET names, same
 * as lib/storage/objectStore.ts. The script still writes only SPIKE_BUCKET.
 * Path-style addressing is forced on. The multipart upload is aborted in a
 * finally block. Presigned URLs are never printed.
 *
 *   SPIKE_STORAGE_ENV=nonprod \
 *   SPIKE_BUCKET=branch-spike \
 *   SPIKE_ENDPOINT='https://<branch>.neon.tech' \
 *   AWS_ENDPOINT_URL_S3='https://<branch>.neon.tech' \
 *   AWS_ACCESS_KEY_ID='...' \
 *   AWS_SECRET_ACCESS_KEY='...' \
 *   node --import tsx scripts/spikes/presigned-part-length.ts
 */
import { redactSecrets, runPresignedPartLengthProbe, SpikeStorageRefused } from "../../lib/storage/presignedPartLengthProbe";

try {
  const report = await runPresignedPartLengthProbe();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  const finished = report.attempts.filter((attempt) => attempt.name === "exact" || attempt.name === "over" || attempt.name === "under");
  if (!report.aborted || report.abortError || finished.length < 3) process.exitCode = 1;
} catch (error) {
  const message = error instanceof SpikeStorageRefused
    ? error.message
    : error instanceof Error && error.message.startsWith("Refusing to run:")
      ? error.message
      : "Spike failed before it could abort.";
  process.stdout.write(`${JSON.stringify({ refused: true, message: redactSecrets(message) })}\n`);
  process.exitCode = 1;
}
