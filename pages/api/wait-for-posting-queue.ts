import type { NextApiRequest, NextApiResponse } from "next";
import { waitForActionQueue } from "@/lib/posting-queue";
import type { ActionType } from "@/lib/action-queue";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (req.headers["x-internal-secret"] !== process.env.CALLBACK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { type, queueId, snippetPath } = req.body;
  
  if (!type || !["posting_private", "posting_public", "reposting"].includes(type)) {
    return res.status(400).json({ error: "Invalid action type" });
  }
  
  if (!queueId || typeof queueId !== "string") {
    return res.status(400).json({ error: "queueId required" });
  }
  
  if (!snippetPath || typeof snippetPath !== "string") {
    return res.status(400).json({ error: "snippetPath required" });
  }

  try {
    const result = await waitForActionQueue(
      type as ActionType,
      queueId,
      snippetPath
    );
    
    if (!result.success) {
      return res.status(429).json({ error: result.error });
    }
    
    return res.status(200).json({ 
      success: true, 
      actionId: result.actionId 
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown error";
    return res.status(500).json({ error });
  }
}
