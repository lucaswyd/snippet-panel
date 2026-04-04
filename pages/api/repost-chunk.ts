import type { NextApiRequest, NextApiResponse } from "next";
import {
  deleteNextMessageBatch,
  postSnippetSwapFlow,
  setRoleChannelOverwrite,
  VIEW_ROLE_ID,
} from "@/lib/discord";
import { getOctokit, getChannelsState, putChannelsState } from "@/lib/github";
import { loadSortedSnippetsFromGitHub } from "@/lib/processor";
import { readRepostJob, writeRepostJob } from "@/lib/repost-job-store";
import type { RepostJobState } from "@/lib/queue";

const CHUNK_SNIPPETS = 3;

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

  let job = await readRepostJob();
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
    }

    job = (await readRepostJob())!;
    if (job.step === "posting") {
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
    }

    job = (await readRepostJob())!;
    if (job.step === "deleting") {
      const n = await deleteNextMessageBatch(job.snippetChannelId);
      job.messagesDeleted = (job.messagesDeleted ?? 0) + n;
      if (n === 0) {
        job.step = "permissions";
      }
      await writeRepostJob(job);
    }

    job = (await readRepostJob())!;
    if (job.step === "permissions") {
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
    }

    const finalJob = await readRepostJob();
    return res.status(200).json(stripJob(finalJob!));
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
