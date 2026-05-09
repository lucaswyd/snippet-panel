import type { NextApiRequest, NextApiResponse } from "next";
import { 
  getActionQueue, 
  addAction, 
  updateAction, 
  removeAction,
  canStartAction,
  markActionRunning,
  markActionDone,
  markActionError,
  type ActionType 
} from "@/lib/action-queue";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "GET") {
    return res.status(200).json(getActionQueue());
  }

  if (req.method === "POST") {
    const { type, queueId, snippetPath, jobId } = req.body;
    
    if (!type || !["tagging", "posting_private", "posting_public", "reposting"].includes(type)) {
      return res.status(400).json({ error: "Invalid action type" });
    }

    // Check if we can start this action
    if (!canStartAction(type as ActionType)) {
      return res.status(429).json({ error: "Another action is currently running" });
    }

    const actionId = addAction({ 
      type: type as ActionType, 
      queueId, 
      snippetPath, 
      jobId 
    });
    
    // Mark as running immediately
    markActionRunning(actionId);
    
    return res.status(200).json({ actionId, status: "running" });
  }

  if (req.method === "PATCH") {
    const { actionId, status, errorMessage } = req.body;
    
    if (!actionId) {
      return res.status(400).json({ error: "actionId required" });
    }

    let success = false;
    switch (status) {
      case "done":
        success = markActionDone(actionId);
        break;
      case "error":
        success = markActionError(actionId, errorMessage || "Unknown error");
        break;
      default:
        return res.status(400).json({ error: "Invalid status" });
    }

    if (!success) {
      return res.status(404).json({ error: "Action not found" });
    }

    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const { actionId } = req.query;
    
    if (!actionId || typeof actionId !== "string") {
      return res.status(400).json({ error: "actionId required" });
    }

    const success = removeAction(actionId);
    if (!success) {
      return res.status(404).json({ error: "Action not found" });
    }

    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
