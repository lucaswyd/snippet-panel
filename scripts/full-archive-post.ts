/**
 * Entry point for `.github/workflows/full-archive-post.yml`.
 * Env: FULL_POST_ACTION = full-post-repost | full-post-queue
 *      FULL_POST_CLIENT_PAYLOAD = JSON (queue mode)
 */
import { runFullArchivePost } from "../lib/run-full-archive-post";

async function main(): Promise<void> {
  const action = process.env.FULL_POST_ACTION;
  if (!action) {
    throw new Error("FULL_POST_ACTION is required");
  }

  if (action === "full-post-repost") {
    await runFullArchivePost({ mode: "repost" });
    return;
  }

  if (action === "full-post-queue") {
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
      mode: "queue",
      snippetPath: p.snippetPath,
      isNew: Boolean(p.isNew),
      taggedMediaUrls: Array.isArray(p.taggedMediaUrls)
        ? p.taggedMediaUrls
        : undefined,
    });
    return;
  }

  throw new Error(`Unknown FULL_POST_ACTION: ${action}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
