import type { NextApiRequest, NextApiResponse } from "next";
import { v4 as uuidv4 } from "uuid";
import type { QueueItem, Snippet } from "@/lib/snippets";
import { snippetFilename } from "@/lib/snippets";
import { createOrUpdateSnippetFile, getOctokit } from "@/lib/github";
import { pushQueueItem, updateQueueItem } from "@/lib/queue";

type SubmitBody = {
  title: string;
  titleConfirmed: boolean;
  feat?: string;
  prod: string;
  prodConfirmed: boolean;
  date: string;
  released: boolean;
  isNew: boolean;
  rawFileUrls: string[];
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body: SubmitBody;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  if (!body.title?.trim() || !body.prod?.trim() || !body.date) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  if (!Array.isArray(body.rawFileUrls) || body.rawFileUrls.length === 0) {
    return res.status(400).json({ error: "At least one file URL required" });
  }

  const id = uuidv4();
  const createdAt = new Date().toISOString();
  const fileBase = snippetFilename(body.date, body.title);
  const snippetPath = `snippets/${fileBase}`;

  const snippet: Snippet = {
    createdAt,
    title: body.title.trim(),
    titleConfirmed: Boolean(body.titleConfirmed),
    prod: body.prod.trim(),
    prodConfirmed: Boolean(body.prodConfirmed),
    date: body.date,
    released: Boolean(body.released),
    untagged_media: [...body.rawFileUrls],
    tagged_media: [],
    _queueId: id,
  };
  const feat = body.feat?.trim();
  if (feat) snippet.feat = feat;

  const queueItem: QueueItem = {
    id,
    snippetPath,
    snippet: { ...snippet },
    status: "tagging",
    isNew: Boolean(body.isNew),
    createdAt,
    rawFileUrls: [...body.rawFileUrls],
  };

  pushQueueItem(queueItem);

  try {
    const octokit = getOctokit();
    await createOrUpdateSnippetFile(
      octokit,
      snippetPath,
      snippet,
      `Add snippet queue ${id}`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "GitHub commit failed";
    updateQueueItem(id, { status: "error", errorMessage: msg });
    return res.status(500).json({ error: msg });
  }

  return res.status(200).json({ id, status: "tagging" });
}
