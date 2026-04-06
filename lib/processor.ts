import { getAllSnippets, getOctokit } from "@/lib/github";
import type { Snippet } from "@/lib/snippets";
import {
  sortSnippetList,
  tryLoadSnippetsFromPublicBundle,
  tryLoadSnippetsFromWorkspace,
} from "@/lib/snippet-sources";

/**
 * Prefer local `snippets/` on dev, optional build bundle on Vercel (env), else GitHub
 * (1 REST list + raw fetches per file — not N REST content calls).
 */
export async function loadSortedSnippetsFromGitHub(): Promise<Snippet[]> {
  const bundle = tryLoadSnippetsFromPublicBundle();
  if (bundle !== null) {
    return sortSnippetList(bundle);
  }

  const local = tryLoadSnippetsFromWorkspace();
  if (local !== null) {
    return sortSnippetList(local);
  }

  const octokit = getOctokit();
  const all = await getAllSnippets(octokit);
  return sortSnippetList(all);
}
