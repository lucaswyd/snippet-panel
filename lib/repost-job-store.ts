import {
  createInitialRepostJobOnGitHub,
  getFileContent,
  getOctokit,
  readRepostJobFromGitHub,
  writeRepostJobToGitHub,
  type ChannelsState,
} from "@/lib/github";
import type { RepostJobState } from "@/lib/queue";

/** Vercel: multiple serverless instances + /tmp not shared → persist job in repo via GitHub API. */
function repostJobUsesGithub(): boolean {
  return Boolean(process.env.VERCEL);
}

/** Start a repost run (GitHub-backed on Vercel, local file otherwise). */
export async function createInitialRepostJob(jobId: string): Promise<void> {
  if (repostJobUsesGithub()) {
    const octokit = getOctokit();
    await createInitialRepostJobOnGitHub(octokit, jobId);
    return;
  }
  const octokit = getOctokit();
  const { content, sha } = await getFileContent(octokit, "state/channels.json");
  const state = JSON.parse(content) as ChannelsState;
  const job: RepostJobState = {
    jobId,
    status: "running",
    step: "loading",
    snippetsTotal: 0,
    snippetsPosted: 0,
    messagesTotal: 0,
    messagesDeleted: 0,
    errorMessage: null,
    blankChannelId: state.blankChannelId,
    snippetChannelId: state.snippetChannelId,
    channelsStateSha: sha,
    _postIndex: 0,
  };
  const { writeRepostJobSync } = await import("@/lib/repost-job-fs");
  writeRepostJobSync(job);
}

export async function readRepostJob(): Promise<RepostJobState | null> {
  if (repostJobUsesGithub()) {
    try {
      const octokit = getOctokit();
      return await readRepostJobFromGitHub(octokit);
    } catch {
      return null;
    }
  }
  const { readRepostJobSync } = await import("@/lib/repost-job-fs");
  return readRepostJobSync();
}

export async function writeRepostJob(job: RepostJobState): Promise<void> {
  if (repostJobUsesGithub()) {
    const octokit = getOctokit();
    await writeRepostJobToGitHub(octokit, job);
    return;
  }
  const { writeRepostJobSync } = await import("@/lib/repost-job-fs");
  writeRepostJobSync(job);
}
