import type { NextApiRequest, NextApiResponse } from "next";
import { readRepostJob } from "@/lib/queue";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const jobId = req.query.jobId;
  if (!jobId || typeof jobId !== "string") {
    return res.status(400).json({ error: "jobId required" });
  }
  const job = readRepostJob();
  if (!job || job.jobId !== jobId) {
    return res.status(404).json({ error: "Job not found" });
  }
  const { _postIndex: _p, ...rest } = job;
  void _p;
  return res.status(200).json(rest as Record<string, unknown>);
}
