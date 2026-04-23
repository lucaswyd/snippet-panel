import {
  postSeparatorToWebhook,
  deleteMessagesInChannel,
  deleteWebhookMessage,
  postSnippetNewWebhook,
  postSnippetToWebhookUrlWithIds,
  sleep,
} from "@/lib/discord";
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
  writeSnippetMessageIds,
} from "@/lib/snippets";

type ChannelTarget = "public" | "private";
type Mode = "full_public" | "full_private" | "queue_public" | "queue_private";

export type RunFullArchivePostOptions =
  | { mode: "full_public" }
  | { mode: "full_private" }
  | {
      mode: "queue_public";
      snippetPath: string;
      isNew: boolean;
      pingNewSnippet?: boolean;
      taggedMediaUrls?: string[];
    }
  | {
      mode: "queue_private";
      snippetPath: string;
    };

type SnippetRecord = { path: string; snippet: Snippet };

const FULL_SNIPPET_DELAY_MS = Number(
  process.env.FULL_ARCHIVE_SNIPPET_DELAY_MS ?? 2000
);
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

function channelIdForFullDelete(target: ChannelTarget): string {
  if (target === "public") {
    return process.env.PUBLIC_CHANNEL_ID ?? process.env.CHANNEL_A_ID ?? "";
  }
  return process.env.PRIVATE_CHANNEL_ID ?? process.env.CHANNEL_B_ID ?? "";
}

function mediaCountFor(target: ChannelTarget, s: Snippet): number {
  return target === "public"
    ? s.tagged_media?.length ?? 0
    : s.untagged_media?.length ?? 0;
}

function messagesFor(target: ChannelTarget, s: Snippet): string[] {
  return target === "public"
    ? buildSwapChannelMessages(s)
    : buildPrivateChannelMessages(s);
}

async function loadSortedRecords(): Promise<SnippetRecord[]> {
  const octokit = getOctokit();
  const paths = await listSnippetPaths(octokit);
  const out: SnippetRecord[] = [];
  for (const p of paths) {
    try {
      const s = await getSnippetAtPath(octokit, p);
      out.push({ path: p, snippet: s });
    } catch {
      /* skip bad file */
    }
  }
  out.sort((a, b) => {
    if (a.snippet.date !== b.snippet.date) {
      return a.snippet.date.localeCompare(b.snippet.date);
    }
    return a.snippet.title.localeCompare(b.snippet.title);
  });
  return out;
}

async function postAndPersistIds(
  rec: SnippetRecord,
  target: ChannelTarget,
  commitMsg: string
): Promise<{ separatorId: string }> {
  const octokit = getOctokit();
  const webhook = webhookFor(target);
  const ids = await postSnippetToWebhookUrlWithIds(
    webhook,
    messagesFor(target, rec.snippet)
  );
  const updated = await mutateSnippetAtPath(
    octokit,
    rec.path,
    commitMsg,
    (current) => writeSnippetMessageIds(current, target, ids)
  );
  rec.snippet = updated;
  return { separatorId: ids.separatorId };
}

async function restoreTrailingSeparator(
  rec: SnippetRecord,
  target: ChannelTarget
): Promise<void> {
  const currentSide = readSnippetMessageIds(rec.snippet)[target];
  if (!currentSide?.messageIds?.length) {
    return;
  }
  const octokit = getOctokit();
  const separatorId = await postSeparatorToWebhook(separatorWebhookFor(target));
  rec.snippet = await mutateSnippetAtPath(
    octokit,
    rec.path,
    `messageId ${target}: restore separator ${rec.snippet.title}`,
    (current) => {
      const side = readSnippetMessageIds(current)[target];
      if (!side?.messageIds?.length) return current;
      return writeSnippetMessageIds(current, target, {
        messageIds: side.messageIds,
        separatorId,
      });
    }
  );
}

async function deleteSnippetMessages(rec: SnippetRecord, target: ChannelTarget) {
  const webhook = webhookFor(target);
  const sepWebhook = separatorWebhookFor(target);
  const side = readSnippetMessageIds(rec.snippet)[target];
  const ids = side?.messageIds ?? [];
  for (const id of ids) {
    await deleteWebhookMessage(webhook, id);
  }
  if (side?.separatorId) {
    await deleteWebhookMessage(sepWebhook, side.separatorId);
  }
}

async function runFullForTarget(target: ChannelTarget): Promise<void> {
  const records = await loadSortedRecords();
  const list = records.filter((r) => mediaCountFor(target, r.snippet) > 0);
  const channelId = channelIdForFullDelete(target);
  if (!channelId) {
    throw new Error(
      `Missing ${target === "public" ? "PUBLIC_CHANNEL_ID/CHANNEL_A_ID" : "PRIVATE_CHANNEL_ID/CHANNEL_B_ID"}`
    );
  }

  console.log(`[full-${target}] deleting channel history first…`);
  await deleteMessagesInChannel(channelId);

  for (let i = 0; i < list.length; i++) {
    const rec = list[i];
    console.log(`[full-${target}] ${i + 1}/${list.length} ${rec.snippet.title}`);
    const { separatorId } = await postAndPersistIds(
      rec,
      target,
      `messageId ${target}: ${rec.snippet.title} (${new Date().toISOString()})`
    );
    // Ensure the channel ends on a snippet, not a separator.
    if (i === list.length - 1) {
      await deleteWebhookMessage(separatorWebhookFor(target), separatorId);
    }
    await sleep(FULL_SNIPPET_DELAY_MS);
  }
}

async function runQueueForTarget(
  target: ChannelTarget,
  snippetPath: string,
  taggedMediaUrls?: string[],
  isNew?: boolean,
  pingNewSnippet?: boolean
): Promise<void> {
  const records = await loadSortedRecords();
  const targetRec = records.find((r) => r.path === snippetPath);
  if (!targetRec) throw new Error(`Snippet path not found: ${snippetPath}`);

  if (target === "public" && taggedMediaUrls?.length && !targetRec.snippet.tagged_media?.length) {
    targetRec.snippet = { ...targetRec.snippet, tagged_media: taggedMediaUrls };
  }

  const ordered = records.filter((r) => mediaCountFor(target, r.snippet) > 0);
  const insertAt = ordered.findIndex((r) => r.path === snippetPath);
  if (insertAt < 0) {
    throw new Error(
      `Target snippet has no ${target === "public" ? "tagged" : "untagged"} media`
    );
  }

  const isNewest = insertAt === ordered.length - 1;
  if (isNewest) {
    console.log(`[queue-${target}] newest item, append only`);
    const previous = ordered[ordered.length - 2];
    if (previous) {
      await restoreTrailingSeparator(previous, target);
      await sleep(QUEUE_SNIPPET_DELAY_MS);
    }
    const { separatorId } = await postAndPersistIds(
      targetRec,
      target,
      `messageId ${target}: append ${targetRec.snippet.title}`
    );
    await deleteWebhookMessage(separatorWebhookFor(target), separatorId);
  } else {
    const tail = ordered.slice(insertAt).filter((r) => r.path !== snippetPath);
    console.log(
      `[queue-${target}] insert at ${insertAt + 1}/${ordered.length}; rebuilding tail size ${tail.length}`
    );
    for (const r of tail) {
      await deleteSnippetMessages(r, target);
    }
    const inserted = await postAndPersistIds(
      targetRec,
      target,
      `messageId ${target}: insert ${targetRec.snippet.title}`
    );
    await sleep(QUEUE_SNIPPET_DELAY_MS);
    for (const r of tail) {
      const replay = await postAndPersistIds(
        r,
        target,
        `messageId ${target}: replay ${r.snippet.title}`
      );
      await sleep(QUEUE_SNIPPET_DELAY_MS);
      // If this is the last replayed snippet, delete the trailing separator.
      if (r.path === tail[tail.length - 1]?.path) {
        await deleteWebhookMessage(separatorWebhookFor(target), replay.separatorId);
      }
    }
    // If there was no tail (shouldn't happen in this branch), still delete separator.
    if (tail.length === 0) {
      await deleteWebhookMessage(separatorWebhookFor(target), inserted.separatorId);
    }
  }

  if (target === "public" && isNew) {
    const fresh = records.find((r) => r.path === snippetPath)?.snippet ?? targetRec.snippet;
    if (fresh.tagged_media?.length) {
      await postSnippetNewWebhook(fresh, Boolean(pingNewSnippet));
    }
  }
}

export async function runFullArchivePost(
  opts: RunFullArchivePostOptions
): Promise<void> {
  switch (opts.mode) {
    case "full_public":
      return runFullForTarget("public");
    case "full_private":
      return runFullForTarget("private");
    case "queue_private":
      return runQueueForTarget("private", opts.snippetPath);
    case "queue_public":
      return runQueueForTarget(
        "public",
        opts.snippetPath,
        opts.taggedMediaUrls,
        opts.isNew,
        opts.pingNewSnippet
      );
    default:
      return;
  }
}
