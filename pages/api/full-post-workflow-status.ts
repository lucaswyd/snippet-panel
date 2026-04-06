import type { NextApiRequest, NextApiResponse } from "next";
import { getOctokit, githubOwner, githubRepo } from "@/lib/github";

const WORKFLOW_FILE = "full-archive-post.yml";

/**
 * Poll the latest full-archive-post workflow run at or after `since` (ISO time).
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const since = req.query.since;
  if (!since || typeof since !== "string") {
    return res.status(400).json({ error: "since query required (ISO timestamp)" });
  }

  const sinceMs = Date.parse(since);
  if (Number.isNaN(sinceMs)) {
    return res.status(400).json({ error: "invalid since" });
  }

  try {
    const octokit = getOctokit();
    const owner = githubOwner();
    const repo = githubRepo();

    const { data } = await octokit.rest.actions.listWorkflowRuns({
      owner,
      repo,
      workflow_id: WORKFLOW_FILE,
      per_page: 15,
    });

    const runs = data.workflow_runs
      .filter((r) => Date.parse(r.created_at) >= sinceMs - 5000)
      .sort(
        (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
      );
    const run = runs[0];

    if (!run) {
      return res.status(200).json({
        found: false,
        status: "pending" as const,
      });
    }

    const running = run.status === "queued" || run.status === "in_progress";
    const done = run.status === "completed";
    const failed = done && run.conclusion === "failure";
    const success = done && run.conclusion === "success";

    return res.status(200).json({
      found: true,
      status: run.status,
      conclusion: run.conclusion,
      htmlUrl: run.html_url,
      running,
      done,
      failed,
      success,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to list workflow runs";
    return res.status(500).json({ error: msg });
  }
}
