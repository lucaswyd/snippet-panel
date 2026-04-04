import type { NextApiRequest, NextApiResponse } from "next";
import { v4 as uuidv4 } from "uuid";
import { getChannelsState, getOctokit } from "@/lib/github";
import { writeRepostJob, type RepostJobState } from "@/lib/queue";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const octokit = getOctokit();
    const state = await getChannelsState(octokit);
    const jobId = uuidv4();
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
      _postIndex: 0,
    };
    writeRepostJob(job);
    return res.status(200).json({ jobId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to start job";
    return res.status(500).json({ error: msg });
  }
}
