import type { NextApiRequest, NextApiResponse } from "next";
import { v4 as uuidv4 } from "uuid";
import {
  deleteWebhookMessage,
  editWebhookMessage,
  postSeparatorToWebhook,
  postSnippetToWebhookUrlWithIds,
  sleep,
} from "@/lib/discord";
import {
  deleteSnippetFile,
  getOctokit,
  getSnippetAtPath,
  listSnippetPaths,
  mutateSnippetAtPath,
} from "@/lib/github";
import {
  buildPrivateChannelMessages,
  buildSwapChannelMessages,
  readSnippetMessageIds,
  type QueueItem,
  type Snippet,
  writeSnippetMessageIds,
} from "@/lib/snippets";
import { pushQueueItem, updateQueueItem } from "@/lib/queue";
import { triggerRepositoryDispatch } from "@/lib/trigger-repository-dispatch";

type SnippetRecord = {
  path: string;
  snippet: Snippet;
};

type MediaPatch = {
  untaggedUrl?: string;
  taggedUrl?: string;
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
  media?: MediaPatch[];
};

type DeleteBody = {
  path?: string;
};

type ChannelTarget = "public" | "private";

const QUEUE_SNIPPET_DELAY_MS = Number(
  process.env.QUEUE_SNIPPET_DELAY_MS ?? 1200
);

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

function mediaCountFor(target: ChannelTarget, snippet: Snippet): number {
  return target === "public"
    ? snippet.tagged_media?.length ?? 0
    : snippet.untagged_media?.length ?? 0;
}

function messagesFor(target: ChannelTarget, snippet: Snippet): string[] {
  return target === "public"
    ? buildSwapChannelMessages(snippet)
    : buildPrivateChannelMessages(snippet);
}

async function loadOrderedSnippetRecords(): Promise<SnippetRecord[]> {
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
    .sort((a, b) => {
      if (a.snippet.date !== b.snippet.date) {
        return a.snippet.date.localeCompare(b.snippet.date);
      }
      return a.snippet.title.localeCompare(b.snippet.title);
    });
}

function buildUiRecords(records: SnippetRecord[]): SnippetRecord[] {
  return records
    .filter((record) => (record.snippet.untagged_media?.length ?? 0) > 0)
    .slice()
    .sort((a, b) => {
      if (a.snippet.date !== b.snippet.date) {
        return b.snippet.date.localeCompare(a.snippet.date);
      }
      return a.snippet.title.localeCompare(b.snippet.title);
    });
}

async function postAndPersistIds(
  rec: SnippetRecord,
  target: ChannelTarget,
  commitMsg: string
): Promise<{ separatorId: string }> {
  const octokit = getOctokit();
  const ids = await postSnippetToWebhookUrlWithIds(
    webhookFor(target),
    messagesFor(target, rec.snippet)
  );
  rec.snippet = await mutateSnippetAtPath(
    octokit,
    rec.path,
    commitMsg,
    (current) => writeSnippetMessageIds(current, target, ids)
  );
  return { separatorId: ids.separatorId };
}

async function deleteSnippetMessages(
  rec: SnippetRecord,
  target: ChannelTarget
): Promise<void> {
  const side = readSnippetMessageIds(rec.snippet)[target];
  for (const messageId of side?.messageIds ?? []) {
    await deleteWebhookMessage(webhookFor(target), messageId);
  }
  if (side?.separatorId) {
    await deleteWebhookMessage(separatorWebhookFor(target), side.separatorId);
  }
}

async function restoreTrailingSeparatorIfMissing(
  rec: SnippetRecord,
  target: ChannelTarget
): Promise<void> {
  const side = readSnippetMessageIds(rec.snippet)[target];
  if (!side?.messageIds?.length || side.separatorId) {
    return;
  }
  const octokit = getOctokit();
  const separatorId = await postSeparatorToWebhook(separatorWebhookFor(target));
  rec.snippet = await mutateSnippetAtPath(
    octokit,
    rec.path,
    `snippet sync ${target}: restore separator ${rec.snippet.title}`,
    (current) => {
      const currentSide = readSnippetMessageIds(current)[target];
      if (!currentSide?.messageIds?.length) return current;
      return writeSnippetMessageIds(current, target, {
        messageIds: currentSide.messageIds,
        separatorId,
      });
    }
  );
}

async function editSnippetMessagesInPlace(
  rec: SnippetRecord,
  target: ChannelTarget
): Promise<void> {
  const side = readSnippetMessageIds(rec.snippet)[target];
  const ids = side?.messageIds ?? [];
  const messages = messagesFor(target, rec.snippet);
  if (ids.length !== messages.length) {
    throw new Error("Message count mismatch during in-place edit");
  }
  await Promise.all(
    ids.map((messageId, index) =>
      editWebhookMessage(webhookFor(target), messageId, messages[index])
    )
  );
}

async function rebuildTargetFromIndex(
  target: ChannelTarget,
  beforeOrdered: SnippetRecord[],
  afterOrdered: SnippetRecord[],
  startIndex: number
): Promise<void> {
  const previousTail = beforeOrdered.slice(startIndex);
  for (const rec of previousTail) {
    await deleteSnippetMessages(rec, target);
  }

  const nextTail = afterOrdered.slice(startIndex);
  if (nextTail.length === 0) {
    return;
  }

  const previous = afterOrdered[startIndex - 1];
  if (previous) {
    await restoreTrailingSeparatorIfMissing(previous, target);
    await sleep(QUEUE_SNIPPET_DELAY_MS);
  }

  for (let index = 0; index < nextTail.length; index++) {
    const rec = nextTail[index];
    const { separatorId } = await postAndPersistIds(
      rec,
      target,
      `snippet sync ${target}: replay ${rec.snippet.title}`
    );
    await sleep(QUEUE_SNIPPET_DELAY_MS);
    if (index === nextTail.length - 1) {
      await deleteWebhookMessage(separatorWebhookFor(target), separatorId);
    }
  }
}

async function syncTargetChange(
  target: ChannelTarget,
  path: string,
  beforeRecords: SnippetRecord[],
  afterRecords: SnippetRecord[]
): Promise<void> {
  const beforeOrdered = beforeRecords.filter(
    (record) => mediaCountFor(target, record.snippet) > 0
  );
  const afterOrdered = afterRecords.filter(
    (record) => mediaCountFor(target, record.snippet) > 0
  );

  const oldIndex = beforeOrdered.findIndex((record) => record.path === path);
  const newIndex = afterOrdered.findIndex((record) => record.path === path);

  if (oldIndex < 0 && newIndex < 0) {
    return;
  }

  const oldMessageCount =
    oldIndex >= 0 ? messagesFor(target, beforeOrdered[oldIndex].snippet).length : 0;
  const newMessageCount =
    newIndex >= 0 ? messagesFor(target, afterOrdered[newIndex].snippet).length : 0;

  if (
    oldIndex >= 0 &&
    newIndex >= 0 &&
    oldIndex === newIndex &&
    oldMessageCount === newMessageCount
  ) {
    await editSnippetMessagesInPlace(afterOrdered[newIndex], target);
    return;
  }

  const startIndex = Math.min(
    oldIndex >= 0 ? oldIndex : Number.POSITIVE_INFINITY,
    newIndex >= 0 ? newIndex : Number.POSITIVE_INFINITY
  );

  if (!Number.isFinite(startIndex)) {
    return;
  }

  await rebuildTargetFromIndex(target, beforeOrdered, afterOrdered, startIndex);
}

async function syncSnippetChange(
  path: string,
  beforeRecords: SnippetRecord[],
  afterRecords: SnippetRecord[]
): Promise<void> {
  await syncTargetChange("private", path, beforeRecords, afterRecords);
  await syncTargetChange("public", path, beforeRecords, afterRecords);
}

function normalizeMedia(media: MediaPatch[] | undefined, current: Snippet): {
  untagged: string[];
  tagged: string[];
} {
  if (!Array.isArray(media)) {
    return {
      untagged: current.untagged_media,
      tagged: current.tagged_media,
    };
  }

  const cleaned = media.map((item) => ({
    untaggedUrl: typeof item.untaggedUrl === "string" ? item.untaggedUrl.trim() : "",
    taggedUrl: typeof item.taggedUrl === "string" ? item.taggedUrl.trim() : "",
  }));

  return {
    untagged: cleaned
      .map((item) => item.untaggedUrl)
      .filter((url) => Boolean(url)),
    tagged: cleaned
      .map((item) => item.taggedUrl)
      .filter((url) => Boolean(url)),
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "GET") {
    try {
      const records = await loadOrderedSnippetRecords();
      return res.status(200).json(buildUiRecords(records));
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
      const beforeRecords = await loadOrderedSnippetRecords();
      const octokit = getOctokit();
      const currentSnippet = await getSnippetAtPath(octokit, body.path);
      const media = normalizeMedia(body.media, currentSnippet);

      // Detect new untagged URLs
      const currentUntaggedSet = new Set(currentSnippet.untagged_media);
      const newUntaggedUrls = media.untagged.filter(
        (url) => !currentUntaggedSet.has(url)
      );

      let updated: Snippet;

      if (newUntaggedUrls.length > 0) {
        // New media added - add to queue for tagging/posting
        const id = uuidv4();
        const createdAt = new Date().toISOString();

        // Update snippet with new untagged media, keep existing tagged media
        updated = await mutateSnippetAtPath(
          octokit,
          body.path,
          `snippet edit: add media queue ${id}`,
          (current) => {
            return {
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
              untagged_media: media.untagged,
              tagged_media: media.tagged,
              _queueId: id,
            };
          }
        );

        // Add to queue
        const queueItem: QueueItem = {
          id,
          snippetPath: body.path,
          snippet: { ...updated },
          status: "tagging",
          isNew: false,
          pingNewSnippet: false,
          createdAt,
          rawFileUrls: newUntaggedUrls,
        };

        try {
          await pushQueueItem(queueItem);
        } catch (e) {
          const msg =
            e instanceof Error ? e.message : "Could not save queue (filesystem)";
          await updateQueueItem(id, { status: "error", errorMessage: msg });
          return res.status(500).json({ error: msg });
        }

        try {
          await triggerRepositoryDispatch("tag-videos", {
            snippetPath: body.path,
            queueId: id,
            isNew: false,
            pingNewSnippet: false,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Failed to trigger tag-videos workflow";
          await updateQueueItem(id, { status: "error", errorMessage: msg });
          return res.status(500).json({ error: msg });
        }
      } else {
        // No new media - normal update with Discord sync
        updated = await mutateSnippetAtPath(
          octokit,
          body.path,
          `snippet edit: ${body.path.split("/").pop() ?? body.path}`,
          (current) => {
            return {
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
              untagged_media: media.untagged,
              tagged_media: media.tagged,
            };
          }
        );
        const afterRecords = await loadOrderedSnippetRecords();
        await syncSnippetChange(body.path, beforeRecords, afterRecords);
      }

      return res.status(200).json({ ok: true, snippet: updated });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not update snippet";
      return res.status(500).json({ error: msg });
    }
  }

  if (req.method === "DELETE") {
    let body: DeleteBody;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    if (!body.path || typeof body.path !== "string") {
      return res.status(400).json({ error: "path required" });
    }

    try {
      const beforeRecords = await loadOrderedSnippetRecords();
      const octokit = getOctokit();
      await deleteSnippetFile(
        octokit,
        body.path,
        `snippet delete: ${body.path.split("/").pop() ?? body.path}`
      );
      const afterRecords = await loadOrderedSnippetRecords();
      await syncSnippetChange(body.path, beforeRecords, afterRecords);
      return res.status(200).json({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not delete snippet";
      return res.status(500).json({ error: msg });
    }
  }

  res.setHeader("Allow", "GET, PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
