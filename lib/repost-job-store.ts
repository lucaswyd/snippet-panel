import { getOctokit, readRepostJobFromGitHub, writeRepostJobToGitHub } from "@/lib/github";
import type { RepostJobState } from "@/lib/queue";

/** Vercel: multiple serverless instances + /tmp not shared → persist job in repo via GitHub API. */
function repostJobUsesGithub(): boolean {
  return Boolean(process.env.VERCEL);
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
