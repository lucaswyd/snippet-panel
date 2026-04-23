import type { NextApiRequest, NextApiResponse } from "next";
import { readQueue, updateQueueItem } from "@/lib/queue";
import { triggerRepositoryDispatch } from "@/lib/trigger-repository-dispatch";

type Body = {
  queueId?: string;
  snippetPath?: string;
};

/** Called by tag-videos workflow before FFmpeg tagging: post untagged snippet to private channel. */
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
  const snippetPath = body.snippetPath;
  if (!queueId || typeof queueId !== "string") {
    return res.status(400).json({ error: "queueId required" });
  }
  if (!snippetPath || typeof snippetPath !== "string") {
    return res.status(400).json({ error: "snippetPath required" });
  }

  const item = (await readQueue()).find((q) => q.id === queueId);
  if (item) {
    await updateQueueItem(queueId, { status: "posting_private" });
  }
  try {
    await triggerRepositoryDispatch("full-post-queue-private", {
      queueId,
      snippetPath,
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to dispatch private queue post";
    if (item) await updateQueueItem(queueId, { status: "error", errorMessage: msg });
    return res.status(500).json({ error: msg });
  }
}
