import type { NextApiRequest, NextApiResponse } from "next";
import { triggerRepositoryDispatch } from "@/lib/trigger-repository-dispatch";

/** Starts GitHub Actions full private (untagged) archive post. */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const dispatchedAt = new Date().toISOString();
    await triggerRepositoryDispatch("full-post-repost-private", {
      dispatchedAt,
    });
    return res.status(200).json({ ok: true, dispatchedAt });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Failed to trigger repository dispatch";
    return res.status(500).json({ error: msg });
  }
}
