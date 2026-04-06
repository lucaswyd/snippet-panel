import type { NextApiRequest, NextApiResponse } from "next";
import { updateQueueItem, readQueue } from "@/lib/queue";
import { triggerRepositoryDispatch } from "@/lib/trigger-repository-dispatch";

type Body = {
  queueId?: string;
  taggedMediaUrls?: string[];
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = req.headers["x-callback-secret"];
  if (secret !== process.env.CALLBACK_SECRET) {
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

  const items = readQueue();
  const item = items.find((q) => q.id === queueId);
  if (!item) {
    return res.status(404).json({ error: "Queue item not found" });
  }

  updateQueueItem(queueId, { status: "posting" });

  try {
    await triggerRepositoryDispatch("full-post-queue", {
      queueId,
      snippetPath: item.snippetPath,
      isNew: item.isNew,
      taggedMediaUrls: body.taggedMediaUrls ?? [],
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Failed to start full-post workflow";
    updateQueueItem(queueId, { status: "error", errorMessage: msg });
    return res.status(500).json({ error: msg });
  }

  return res.status(200).json({ ok: true, accepted: true });
}
