import type { Snippet } from "@/lib/snippets";
import { sortSnippets } from "@/lib/snippets";
import { getAllSnippets, getOctokit } from "@/lib/github";

export async function loadSortedSnippetsFromGitHub(): Promise<Snippet[]> {
  const octokit = getOctokit();
  const all = await getAllSnippets(octokit);
  return sortSnippets(all);
}
