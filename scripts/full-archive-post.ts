/**
 * Entry point for `.github/workflows/full-archive-post.yml`.
 * Env: FULL_POST_ACTION = full-post-repost-public | full-post-repost-private
 *                       | full-post-queue-public | full-post-queue-private
 *      FULL_POST_CLIENT_PAYLOAD = JSON (queue mode)
 */
import { runFullArchivePost } from "../lib/run-full-archive-post";

async function main(): Promise<void> {
  const action = process.env.FULL_POST_ACTION;
  if (!action) {
    throw new Error("FULL_POST_ACTION is required");
  }

  if (action === "full-post-repost-public") {
    await runFullArchivePost({ mode: "full_public" });
    return;
  }

  if (action === "full-post-repost-private") {
    await runFullArchivePost({ mode: "full_private" });
    return;
  }

  if (action === "full-post-queue-public") {
    const raw = process.env.FULL_POST_CLIENT_PAYLOAD;
    const p = raw
      ? (JSON.parse(raw) as {
          queueId?: string;
          snippetPath?: string;
          isNew?: boolean;
          taggedMediaUrls?: string[];
        })
      : {};
    if (!p.snippetPath || typeof p.snippetPath !== "string") {
      throw new Error("client_payload.snippetPath required");
    }
    await runFullArchivePost({
      mode: "queue_public",
      snippetPath: p.snippetPath,
      isNew: Boolean(p.isNew),
      taggedMediaUrls: Array.isArray(p.taggedMediaUrls)
        ? p.taggedMediaUrls
        : undefined,
    });
    return;
  }

  if (action === "full-post-queue-private") {
    const raw = process.env.FULL_POST_CLIENT_PAYLOAD;
    const p = raw
      ? (JSON.parse(raw) as { snippetPath?: string })
      : {};
    if (!p.snippetPath || typeof p.snippetPath !== "string") {
      throw new Error("client_payload.snippetPath required");
    }
    await runFullArchivePost({
      mode: "queue_private",
      snippetPath: p.snippetPath,
    });
    return;
  }

  throw new Error(`Unknown FULL_POST_ACTION: ${action}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
