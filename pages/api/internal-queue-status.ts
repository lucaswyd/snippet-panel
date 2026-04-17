import type { NextApiRequest, NextApiResponse } from "next";
import { updateQueueItem } from "@/lib/queue";

type Body = {
  queueId?: string;
  status?: string;
  errorMessage?: string;
};

/** Internal: update a queue item's status from GitHub Actions. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
  const status = body.status;
  if (!status || typeof status !== "string") {
    return res.status(400).json({ error: "status required" });
  }
  const patch: { status: any; errorMessage?: string } = { status };
  if (typeof body.errorMessage === "string" && body.errorMessage.trim()) {
    patch.errorMessage = body.errorMessage.trim();
  }
  updateQueueItem(queueId, patch);
  return res.status(200).json({ ok: true });
}

