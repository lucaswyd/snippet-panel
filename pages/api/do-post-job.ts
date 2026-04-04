import type { NextApiRequest, NextApiResponse } from "next";
import {
  deleteMessagesInChannel,
  postSnippetNewWebhook,
  postSnippetSwapFlow,
  setRoleChannelOverwrite,
  sleep,
  VIEW_ROLE_ID,
} from "@/lib/discord";
import {
  getChannelsState,
  getOctokit,
  getSnippetAtPath,
  putChannelsState,
} from "@/lib/github";
import { loadSortedSnippetsFromGitHub } from "@/lib/processor";
import { readQueue, updateQueueItem } from "@/lib/queue";
import { sortSnippets } from "@/lib/snippets";

type Body = { queueId?: string; taggedMediaUrls?: string[] };

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

  const items = readQueue();
  const item = items.find((q) => q.id === queueId);
  if (!item) {
    return res.status(404).json({ error: "Queue item not found" });
  }

  try {
    await sleep(2000);

    const octokit = getOctokit();
    let sorted = await loadSortedSnippetsFromGitHub();

    if (body.taggedMediaUrls?.length) {
      const fresh = await getSnippetAtPath(octokit, item.snippetPath);
      if (!fresh.tagged_media?.length) {
        const withTags = { ...fresh, tagged_media: body.taggedMediaUrls };
        sorted = sortSnippets([
          ...sorted.filter(
            (s) => !(s.title === fresh.title && s.date === fresh.date)
          ),
          withTags,
        ]);
      }
    }

    const state = await getChannelsState(octokit);

    for (const s of sorted) {
      if (!(s.tagged_media?.length > 0)) continue;
      await postSnippetSwapFlow(state.blankChannelId, s);
    }

    await deleteMessagesInChannel(state.snippetChannelId);
    await setRoleChannelOverwrite(state.blankChannelId, VIEW_ROLE_ID, true);
    await setRoleChannelOverwrite(state.snippetChannelId, VIEW_ROLE_ID, false);
    await putChannelsState(
      octokit,
      {
        snippetChannelId: state.blankChannelId,
        blankChannelId: state.snippetChannelId,
      },
      "Swap channels after tagged snippet pipeline"
    );

    if (item.isNew) {
      const fresh = await getSnippetAtPath(octokit, item.snippetPath);
      if (fresh.tagged_media?.length) {
        await postSnippetNewWebhook(fresh);
      }
    }

    updateQueueItem(queueId, { status: "done" });
    return res.status(200).json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Post job failed";
    updateQueueItem(queueId, { status: "error", errorMessage: msg });
    return res.status(500).json({ error: msg });
  }
}
