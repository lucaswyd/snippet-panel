import type { NextApiRequest, NextApiResponse } from "next";
import { updateQueueItem, readQueue } from "@/lib/queue";
import { triggerRepositoryDispatch } from "@/lib/trigger-repository-dispatch";
import { findSnippetPathByQueueId, getOctokit } from "@/lib/github";

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

  const item = (await readQueue()).find((q) => q.id === queueId);
  const snippetPath =
    item?.snippetPath ??
    (await findSnippetPathByQueueId(getOctokit(), queueId));
  const isNew = item?.isNew ?? false;
  const pingNewSnippet = item?.pingNewSnippet ?? false;

  // The /tmp queue can disappear on Vercel cold starts — still dispatch posting.
  if (item) {
    await updateQueueItem(queueId, { status: "posting_public" });
  }

  try {
    await triggerRepositoryDispatch("full-post-queue-public", {
      queueId,
      snippetPath,
      isNew,
      pingNewSnippet,
      taggedMediaUrls: body.taggedMediaUrls ?? [],
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Failed to start full-post workflow";
    if (item) {
      await updateQueueItem(queueId, { status: "error", errorMessage: msg });
    }
    return res.status(500).json({ error: msg });
  }

  return res.status(200).json({ ok: true, accepted: true });
}
