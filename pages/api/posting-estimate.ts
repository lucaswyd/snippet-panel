import type { NextApiRequest, NextApiResponse } from "next";
import {
  estimatePostingDurations,
  type PostingEstimateApiResponse,
} from "@/lib/posting-estimates";
import { loadSortedSnippetsFromGitHub } from "@/lib/processor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const snippets = await loadSortedSnippetsFromGitHub();
    const est = estimatePostingDurations(snippets);
    const taggedCount = snippets.filter(
      (s) => (s.tagged_media?.length ?? 0) > 0
    ).length;

    const body: PostingEstimateApiResponse = {
      taggedSnippetCount: taggedCount,
      repost: est.repost,
      queueFullPipeline: est.queueFullPipeline,
      taggingNote: est.taggingNote,
    };
    return res.status(200).json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Estimate failed";
    return res.status(500).json({ error: msg });
  }
}
