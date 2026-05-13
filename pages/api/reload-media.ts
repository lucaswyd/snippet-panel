import type { NextApiRequest, NextApiResponse } from "next";
import { editWebhookMessage, sleep } from "@/lib/discord";
import { getOctokit, getSnippetAtPath } from "@/lib/github";
import { buildPrivateChannelMessages, buildSwapChannelMessages, readSnippetMessageIds } from "@/lib/snippets";

type ChannelTarget = "private" | "public";

function webhookFor(target: ChannelTarget): string {
  if (target === "public") {
    return (
      process.env.WEBHOOK_PUBLIC_SNIPPETS ?? process.env.WEBHOOK_SNIPPETS ?? ""
    );
  }
  return process.env.WEBHOOK_PRIVATE_SNIPPETS ?? process.env.WEBHOOK_BLANK ?? "";
}

function separatorWebhookFor(target: ChannelTarget): string {
  if (target === "public") {
    return process.env.WEBHOOK_PUBLIC_SEPARATOR ?? webhookFor(target);
  }
  return process.env.WEBHOOK_PRIVATE_SEPARATOR ?? webhookFor(target);
}

type ReloadBody = {
  path: string;
  mediaUrl: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { path, mediaUrl } = req.body as ReloadBody;

  if (!path || typeof path !== "string") {
    return res.status(400).json({ error: "path required" });
  }

  if (!mediaUrl || typeof mediaUrl !== "string") {
    return res.status(400).json({ error: "mediaUrl required" });
  }

  try {
    const octokit = getOctokit();
    const snippet = await getSnippetAtPath(octokit, path);
    const messageIds = readSnippetMessageIds(snippet);

    // Helper function to reload messages for a specific target
    const reloadTarget = async (target: "private" | "public") => {
      const side = messageIds[target];
      if (!side?.messageIds?.length) return;

      const webhook = webhookFor(target);
      const messages = target === "public" 
        ? buildSwapChannelMessages(snippet)
        : buildPrivateChannelMessages(snippet);

      // Find the message index that contains the mediaUrl
      const messageIndex = messages.findIndex(msg => msg.includes(mediaUrl));
      if (messageIndex === -1) return;

      const messageId = side.messageIds[messageIndex];
      if (!messageId) return;

      // Edit to period first
      await editWebhookMessage(webhook, messageId, ".");
      await sleep(1000); // Wait a second between edits

      // Edit back to original content
      await editWebhookMessage(webhook, messageId, messages[messageIndex]);
    };

    // Reload for both private and public channels
    await Promise.all([
      reloadTarget("private"),
      reloadTarget("public")
    ]);

    return res.status(200).json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not reload media";
    return res.status(500).json({ error: msg });
  }
}
