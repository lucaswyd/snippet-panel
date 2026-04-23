import type { NextApiRequest, NextApiResponse } from "next";
import { runFullArchivePost } from "@/lib/run-full-archive-post";
import { readQueue, updateQueueItem } from "@/lib/queue";

type Body = { queueId?: string; taggedMediaUrls?: string[] };

/** Legacy direct post (same machine as Vercel queue). Prefer GitHub Actions. */
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

  const items = await readQueue();
  const item = items.find((q) => q.id === queueId);
  if (!item) {
    return res.status(404).json({ error: "Queue item not found" });
  }

  try {
    await runFullArchivePost({
      mode: "queue_public",
      snippetPath: item.snippetPath,
      isNew: item.isNew,
      pingNewSnippet: item.pingNewSnippet,
      taggedMediaUrls: body.taggedMediaUrls,
    });

    await updateQueueItem(queueId, { status: "done" });
    return res.status(200).json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Post job failed";
    await updateQueueItem(queueId, { status: "error", errorMessage: msg });
    return res.status(500).json({ error: msg });
  }
}
