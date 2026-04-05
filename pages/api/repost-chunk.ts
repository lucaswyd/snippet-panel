import type { NextApiRequest, NextApiResponse } from "next";
import {
  deleteNextMessageBatch,
  postSnippetSwapFlow,
  setRoleChannelOverwrite,
  sleep,
  VIEW_ROLE_ID,
} from "@/lib/discord";
import { getOctokit, getChannelsState, putChannelsState } from "@/lib/github";
import { loadSortedSnippetsFromGitHub } from "@/lib/processor";
import { readRepostJob, writeRepostJob } from "@/lib/repost-job-store";
import type { RepostJobState } from "@/lib/queue";

/**
 * One snippet per chunk keeps each invocation under Vercel time limits.
 * Each HTTP call must run only ONE step (loading | posting | deleting | permissions).
 */
const CHUNK_SNIPPETS = 1;

type Body = { jobId?: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body: Body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const jobId = body.jobId;
  if (!jobId || typeof jobId !== "string") {
    return res.status(400).json({ error: "jobId required" });
  }

  /** GitHub read-after-write can lag; repost-start may have just committed. */
  let job: Awaited<ReturnType<typeof readRepostJob>> = null;
  const deadline = Date.now() + 8000;
  for (;;) {
    job = await readRepostJob();
    if (job && job.jobId === jobId) break;
    if (Date.now() >= deadline) break;
    await sleep(200);
  }
  if (!job || job.jobId !== jobId) {
    return res.status(404).json({ error: "Job not found" });
  }

  if (job.status !== "running") {
    return res.status(200).json(stripJob(job));
  }

  try {
    if (job.step === "loading") {
      const sorted = await loadSortedSnippetsFromGitHub();
      job.snippetsTotal = sorted.length;
      job.step = "posting";
      job._postIndex = 0;
      job.snippetsPosted = 0;
      await writeRepostJob(job);
      return jsonJob();
    }

    if (job.step === "posting") {
      job = (await readRepostJob())!;
      const sorted = await loadSortedSnippetsFromGitHub();
      const start = job._postIndex ?? 0;
      const batch = sorted.slice(start, start + CHUNK_SNIPPETS);
      for (const s of batch) {
        if (!(s.tagged_media?.length > 0)) continue;
        await postSnippetSwapFlow(job.blankChannelId, s);
      }
      const next = start + batch.length;
      job._postIndex = next;
      job.snippetsPosted = next;
      if (next >= sorted.length) {
        job.step = "deleting";
      }
      await writeRepostJob(job);
      return jsonJob();
    }

    if (job.step === "deleting") {
      job = (await readRepostJob())!;
      const n = await deleteNextMessageBatch(job.snippetChannelId);
      job.messagesDeleted = (job.messagesDeleted ?? 0) + n;
      if (n === 0) {
        job.step = "permissions";
      }
      await writeRepostJob(job);
      return jsonJob();
    }

    if (job.step === "permissions") {
      job = (await readRepostJob())!;
      const octokit = getOctokit();
      const state = await getChannelsState(octokit);
      await setRoleChannelOverwrite(state.blankChannelId, VIEW_ROLE_ID, true);
      await setRoleChannelOverwrite(state.snippetChannelId, VIEW_ROLE_ID, false);
      await putChannelsState(
        octokit,
        {
          snippetChannelId: state.blankChannelId,
          blankChannelId: state.snippetChannelId,
        },
        "Swap channels after manual repost"
      );
      job.step = "done";
      job.status = "done";
      await writeRepostJob(job);
      return jsonJob();
    }

    return jsonJob();

    async function jsonJob() {
      const finalJob = await readRepostJob();
      return res.status(200).json(stripJob(finalJob!));
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Chunk failed";
    const cur = await readRepostJob();
    if (cur && cur.jobId === jobId) {
      cur.status = "error";
      cur.errorMessage = msg;
      cur.step = "done";
      await writeRepostJob(cur);
      return res.status(500).json(stripJob(cur));
    }
    return res.status(500).json({ error: msg });
  }
}

function stripJob(j: RepostJobState) {
  const { _postIndex: _i, ...rest } = j;
  void _i;
  return rest;
}
