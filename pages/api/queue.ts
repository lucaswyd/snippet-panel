import type { NextApiRequest, NextApiResponse } from "next";
import { readQueue, removeQueueItem } from "@/lib/queue";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return res.status(200).json(readQueue());
  }
  if (req.method === "DELETE") {
    const id = req.query.id;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Missing id" });
    }
    const ok = removeQueueItem(id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    return res.status(200).json({ ok: true });
  }
  res.setHeader("Allow", "GET, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
