import { waitUntil } from "@vercel/functions";

/**
 * After each repost-chunk step, schedule the next HTTP invocation so the job
 * keeps progressing without an open browser tab.
 *
 * On Vercel, `waitUntil` extends the serverless invocation so the follow-up
 * fetch runs reliably. Elsewhere `waitUntil` is a no-op; continuation may still
 * work locally while the Node process stays alive (`next dev`), but is not
 * guaranteed on arbitrary self-hosted setups.
 */
export function scheduleRepostChunkContinuation(jobId: string): void {
  const vercelUrl = process.env.VERCEL_URL;
  const base =
    vercelUrl != null && vercelUrl !== ""
      ? `https://${vercelUrl}`
      : `http://127.0.0.1:${process.env.PORT ?? "3000"}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const secret = process.env.CALLBACK_SECRET;
  if (secret) headers["x-internal-secret"] = secret;

  const promise = fetch(`${base}/api/repost-chunk`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jobId }),
  })
    .then(async (r) => {
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        console.error("[repost continuation]", r.status, t);
      }
    })
    .catch((err) => {
      console.error("[repost continuation]", err);
    });

  waitUntil(promise);
}
