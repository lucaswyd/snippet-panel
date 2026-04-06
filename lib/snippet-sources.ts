import fs from "fs";
import path from "path";
import type { Snippet } from "@/lib/snippets";
import { sortSnippets } from "@/lib/snippets";

/**
 * Local dev: read repo `snippets/*.json` from disk (zero GitHub).
 * Skipped on Vercel — deploy tree may lag behind latest commits.
 */
export function tryLoadSnippetsFromWorkspace(): Snippet[] | null {
  if (process.env.VERCEL) return null;
  if (process.env.SNIPPETS_SKIP_WORKSPACE === "1") return null;

  const dir = path.join(process.cwd(), "snippets");
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return null;
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const out: Snippet[] = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, f), "utf8");
      out.push(JSON.parse(raw) as Snippet);
    } catch {
      /* skip */
    }
  }
  return out;
}

/**
 * Built artifact from `scripts/bundle-snippets.mjs` — served as `/data/snippets.json`.
 * Optional fast path on Vercel when SNIPPETS_USE_BUILD_BUNDLE=1 (stale until redeploy).
 */
export function tryLoadSnippetsFromPublicBundle(): Snippet[] | null {
  if (process.env.SNIPPETS_USE_BUILD_BUNDLE !== "1") return null;

  const file = path.join(process.cwd(), "public", "data", "snippets.json");
  if (!fs.existsSync(file)) return null;

  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8")) as {
      snippets?: Snippet[];
    };
    return Array.isArray(j.snippets) ? j.snippets : [];
  } catch {
    return null;
  }
}

export function sortSnippetList(list: Snippet[]): Snippet[] {
  return sortSnippets(list);
}
