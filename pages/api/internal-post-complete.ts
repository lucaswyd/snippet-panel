import type { NextApiRequest, NextApiResponse } from "next";
import { updateQueueItem } from "@/lib/queue";

type Body = {
  queueId?: string;
  ok?: boolean;
  errorMessage?: string;
};

/**
 * Called from GitHub Actions when the full-post-queue workflow finishes.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (req.headers["x-internal-secret"] !== process.env.CALLBACK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let body: Body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const queueId = body.queueId;
  if (!queueId || typeof queueId !== "string") {
    return res.status(400).json({ error: "queueId required" });
  }

  if (body.ok === true) {
    await updateQueueItem(queueId, { status: "done" });
    return res.status(200).json({ ok: true });
  }

  const err =
    typeof body.errorMessage === "string" && body.errorMessage.trim()
      ? body.errorMessage.trim()
      : "Workflow failed";
  await updateQueueItem(queueId, { status: "error", errorMessage: err });
  return res.status(200).json({ ok: true });
}
