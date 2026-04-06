import type { NextApiRequest, NextApiResponse } from "next";
import { v4 as uuidv4 } from "uuid";
import { createInitialRepostJob } from "@/lib/repost-job-store";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const jobId = uuidv4();
    await createInitialRepostJob(jobId);
    return res.status(200).json({ jobId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to start job";
    return res.status(500).json({ error: msg });
  }
}
