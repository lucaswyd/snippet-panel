import { Octokit } from "octokit";
import type { Snippet } from "@/lib/snippets";

export interface ChannelsState {
  snippetChannelId: string;
  blankChannelId: string;
}

function owner(): string {
  const o = process.env.GITHUB_REPO_OWNER;
  if (!o) throw new Error("GITHUB_REPO_OWNER is not set");
  return o;
}

function repo(): string {
  const n = process.env.GITHUB_REPO_NAME;
  if (!n) throw new Error("GITHUB_REPO_NAME is not set");
  return n;
}

export function getOctokit(): Octokit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  return new Octokit({ auth: token });
}

export async function getFileContent(
  octokit: Octokit,
  path: string
): Promise<{ content: string; sha: string }> {
  const { data } = await octokit.rest.repos.getContent({
    owner: owner(),
    repo: repo(),
    path,
  });
  if (Array.isArray(data) || !("content" in data)) {
    throw new Error(`Expected file at ${path}`);
  }
  const content = Buffer.from(data.content, "base64").toString("utf8");
  return { content, sha: data.sha };
}

export async function getChannelsState(octokit: Octokit): Promise<ChannelsState> {
  const { content } = await getFileContent(octokit, "state/channels.json");
  return JSON.parse(content) as ChannelsState;
}

export async function putChannelsState(
  octokit: Octokit,
  state: ChannelsState,
  message: string
): Promise<void> {
  const { sha } = await getFileContent(octokit, "state/channels.json");
  await octokit.rest.repos.createOrUpdateFileContents({
    owner: owner(),
    repo: repo(),
    path: "state/channels.json",
    message,
    content: Buffer.from(JSON.stringify(state, null, 2), "utf8").toString("base64"),
    sha,
  });
}

export async function listSnippetPaths(octokit: Octokit): Promise<string[]> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: owner(),
      repo: repo(),
      path: "snippets",
    });
    if (!Array.isArray(data)) return [];
    return data
      .filter((e) => e.type === "file" && e.name.endsWith(".json"))
      .map((e) => `snippets/${e.name}`);
  } catch {
    return [];
  }
}

export async function getSnippetAtPath(
  octokit: Octokit,
  path: string
): Promise<Snippet> {
  const { content } = await getFileContent(octokit, path);
  return JSON.parse(content) as Snippet;
}

export async function getAllSnippets(octokit: Octokit): Promise<Snippet[]> {
  const paths = await listSnippetPaths(octokit);
  const out: Snippet[] = [];
  for (const p of paths) {
    try {
      out.push(await getSnippetAtPath(octokit, p));
    } catch {
      /* skip bad files */
    }
  }
  return out;
}

export async function createOrUpdateSnippetFile(
  octokit: Octokit,
  path: string,
  snippet: Snippet,
  message: string
): Promise<void> {
  const body = JSON.stringify(snippet, null, 2);
  let sha: string | undefined;
  try {
    const cur = await getFileContent(octokit, path);
    sha = cur.sha;
  } catch {
    sha = undefined;
  }
  await octokit.rest.repos.createOrUpdateFileContents({
    owner: owner(),
    repo: repo(),
    path,
    message,
    content: Buffer.from(body, "utf8").toString("base64"),
    ...(sha ? { sha } : {}),
  });
}

export async function findSnippetPathByQueueId(
  octokit: Octokit,
  queueId: string
): Promise<string | null> {
  const paths = await listSnippetPaths(octokit);
  for (const p of paths) {
    try {
      const s = await getSnippetAtPath(octokit, p);
      if (s._queueId === queueId) return p;
    } catch {
      /* continue */
    }
  }
  return null;
}

export { owner as githubOwner, repo as githubRepo };
