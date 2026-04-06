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
import { sortSnippets } from "@/lib/snippets";

export type RunFullArchivePostOptions =
  | { mode: "repost" }
  | {
      mode: "queue";
      snippetPath: string;
      isNew: boolean;
      taggedMediaUrls?: string[];
    };

/**
 * Post every tagged snippet to the blank channel, clear the snippet channel,
 * swap visibility, and commit channel IDs to GitHub — same work as the legacy
 * chunked repost and as do-post-job.
 */
export async function runFullArchivePost(
  opts: RunFullArchivePostOptions
): Promise<void> {
  if (opts.mode === "queue") {
    await sleep(2000);
  }

  const octokit = getOctokit();
  let sorted = await loadSortedSnippetsFromGitHub();

  if (opts.mode === "queue") {
    if (opts.taggedMediaUrls?.length) {
      const fresh = await getSnippetAtPath(octokit, opts.snippetPath);
      if (!fresh.tagged_media?.length) {
        const withTags = { ...fresh, tagged_media: opts.taggedMediaUrls };
        sorted = sortSnippets([
          ...sorted.filter(
            (s) => !(s.title === fresh.title && s.date === fresh.date)
          ),
          withTags,
        ]);
      }
    }
  }

  const state = await getChannelsState(octokit);

  const toPost = sorted.filter((s) => (s.tagged_media?.length ?? 0) > 0);
  const n = toPost.length;
  console.log(`[full-archive-post] posting ${n} snippet(s) to blank channel ${state.blankChannelId}`);

  for (let i = 0; i < toPost.length; i++) {
    const s = toPost[i];
    console.log(
      `[full-archive-post] ${i + 1}/${n} — ${s.title} (${(s.tagged_media?.length ?? 0)} links)`
    );
    await postSnippetSwapFlow(state.blankChannelId, s);
  }

  console.log("[full-archive-post] deleting messages in snippet channel…");

  await deleteMessagesInChannel(state.snippetChannelId);
  console.log("[full-archive-post] updating channel permissions…");
  await setRoleChannelOverwrite(state.blankChannelId, VIEW_ROLE_ID, true);
  await setRoleChannelOverwrite(state.snippetChannelId, VIEW_ROLE_ID, false);
  console.log("[full-archive-post] committing channels.json…");
  await putChannelsState(
    octokit,
    {
      snippetChannelId: state.blankChannelId,
      blankChannelId: state.snippetChannelId,
    },
    opts.mode === "repost"
      ? "Swap channels after full post (repost)"
      : "Swap channels after tagged snippet pipeline"
  );

  if (opts.mode === "queue" && opts.isNew) {
    const fresh = await getSnippetAtPath(octokit, opts.snippetPath);
    if (fresh.tagged_media?.length) {
      console.log("[full-archive-post] new-snippet webhook…");
      await postSnippetNewWebhook(fresh);
    }
  }

  console.log("[full-archive-post] done");
}
