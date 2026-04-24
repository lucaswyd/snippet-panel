import type { NextApiRequest, NextApiResponse } from "next";
import { getSnippetAtPath, getOctokit } from "@/lib/github";
import { postSnippetNewWebhook } from "@/lib/discord";
import type { Snippet } from "@/lib/snippets";

type AnnounceBody = {
  path: string;
  mediaUrl: string;
  includePing: boolean;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body: AnnounceBody;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  if (!body.path || typeof body.path !== "string") {
    return res.status(400).json({ error: "path required" });
  }

  if (!body.mediaUrl || typeof body.mediaUrl !== "string") {
    return res.status(400).json({ error: "mediaUrl required" });
  }

  if (typeof body.includePing !== "boolean") {
    return res.status(400).json({ error: "includePing must be boolean" });
  }

  try {
    const octokit = getOctokit();
    const snippet = await getSnippetAtPath(octokit, body.path);
    
    // Create a minimal snippet object with just the single media URL
    const singleMediaSnippet: Snippet = {
      ...snippet,
      untagged_media: [body.mediaUrl],
      tagged_media: [],
    };
    
    await postSnippetNewWebhook(singleMediaSnippet, body.includePing);
    
    return res.status(200).json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not announce snippet";
    return res.status(500).json({ error: msg });
  }
}
