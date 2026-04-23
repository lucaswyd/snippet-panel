import type { NextApiRequest, NextApiResponse } from "next";
import {
  getOctokit,
  getSnippetAtPath,
  listSnippetPaths,
  mutateSnippetAtPath,
} from "@/lib/github";
import {
  buildPrivateChannelMessages,
  buildSwapChannelMessages,
  readSnippetMessageIds,
  type Snippet,
} from "@/lib/snippets";
import { editWebhookMessage } from "@/lib/discord";

type SnippetRecord = {
  path: string;
  snippet: Snippet;
};

type PatchBody = {
  path?: string;
  title?: string;
  titleConfirmed?: boolean;
  feat?: string;
  prod?: string;
  prodConfirmed?: boolean;
  date?: string;
  released?: boolean;
};

function webhookFor(target: "public" | "private"): string {
  if (target === "public") {
    return (
      process.env.WEBHOOK_PUBLIC_SNIPPETS ?? process.env.WEBHOOK_SNIPPETS ?? ""
    );
  }
  return process.env.WEBHOOK_PRIVATE_SNIPPETS ?? process.env.WEBHOOK_BLANK ?? "";
}

async function loadSnippetRecords(): Promise<SnippetRecord[]> {
  const octokit = getOctokit();
  const paths = await listSnippetPaths(octokit);
  const records = await Promise.all(
    paths.map(async (path) => {
      try {
        return { path, snippet: await getSnippetAtPath(octokit, path) };
      } catch {
        return null;
      }
    })
  );
  return records
    .filter((record): record is SnippetRecord => Boolean(record))
    .filter((record) => (record.snippet.untagged_media?.length ?? 0) > 0)
    .sort((a, b) => {
      if (a.snippet.date !== b.snippet.date) {
        return b.snippet.date.localeCompare(a.snippet.date);
      }
      return a.snippet.title.localeCompare(b.snippet.title);
    });
}

async function syncSnippetMessages(snippet: Snippet): Promise<void> {
  const store = readSnippetMessageIds(snippet);
  const tasks: Promise<void>[] = [];
  const privateWebhook = webhookFor("private");
  const publicWebhook = webhookFor("public");

  const privateIds = store.private?.messageIds ?? [];
  const privateMessages = buildPrivateChannelMessages(snippet);
  if (privateWebhook && privateIds.length === privateMessages.length) {
    privateIds.forEach((messageId, index) => {
      tasks.push(editWebhookMessage(privateWebhook, messageId, privateMessages[index]));
    });
  }

  const publicIds = store.public?.messageIds ?? [];
  const publicMessages = buildSwapChannelMessages(snippet);
  if (publicWebhook && publicIds.length === publicMessages.length) {
    publicIds.forEach((messageId, index) => {
      tasks.push(editWebhookMessage(publicWebhook, messageId, publicMessages[index]));
    });
  }

  await Promise.all(tasks);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "GET") {
    try {
      const records = await loadSnippetRecords();
      return res.status(200).json(records);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load snippets";
      return res.status(500).json({ error: msg });
    }
  }

  if (req.method === "PATCH") {
    let body: PatchBody;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    if (!body.path || typeof body.path !== "string") {
      return res.status(400).json({ error: "path required" });
    }

    try {
      const octokit = getOctokit();
      const updated = await mutateSnippetAtPath(
        octokit,
        body.path,
        `snippet edit: ${body.path.split("/").pop() ?? body.path}`,
        (current) => ({
          ...current,
          title:
            typeof body.title === "string" && body.title.trim()
              ? body.title.trim()
              : current.title,
          titleConfirmed:
            typeof body.titleConfirmed === "boolean"
              ? body.titleConfirmed
              : current.titleConfirmed,
          feat:
            typeof body.feat === "string"
              ? body.feat.trim() || undefined
              : current.feat,
          prod:
            typeof body.prod === "string" && body.prod.trim()
              ? body.prod.trim()
              : current.prod,
          prodConfirmed:
            typeof body.prodConfirmed === "boolean"
              ? body.prodConfirmed
              : current.prodConfirmed,
          date:
            typeof body.date === "string" && body.date
              ? body.date
              : current.date,
          released:
            typeof body.released === "boolean"
              ? body.released
              : current.released,
        })
      );
      await syncSnippetMessages(updated);
      return res.status(200).json({ ok: true, snippet: updated });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not update snippet";
      return res.status(500).json({ error: msg });
    }
  }

  res.setHeader("Allow", "GET, PATCH");
  return res.status(405).json({ error: "Method not allowed" });
}
