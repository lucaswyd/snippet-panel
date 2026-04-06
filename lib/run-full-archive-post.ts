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
    opts.mode === "repost"
      ? "Swap channels after full post (repost)"
      : "Swap channels after tagged snippet pipeline"
  );

  if (opts.mode === "queue" && opts.isNew) {
    const fresh = await getSnippetAtPath(octokit, opts.snippetPath);
    if (fresh.tagged_media?.length) {
      await postSnippetNewWebhook(fresh);
    }
  }
}
