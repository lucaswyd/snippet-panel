import fs from "fs";
import path from "path";
import {
  getFileContentOptional,
  getOctokit,
  mutateJsonFile,
} from "@/lib/github";
import type { QueueItem, Snippet } from "@/lib/snippets";

/**
 * Vercel serverless FS is read-only except /tmp. Local dev uses ./state.
 */
function stateDir(): string {
  if (process.env.VERCEL) {
    return path.join("/tmp", "snippet-panel-state");
  }
  return path.join(process.cwd(), "state");
}

const STATE_DIR = stateDir();
const QUEUE_FILE = path.join(STATE_DIR, "queue.json");
const QUEUE_STATE_PATH = "state/queue.json";

function ensureStateDir(): void {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

function hasGitHubQueueBacking(): boolean {
  return Boolean(
    process.env.GITHUB_TOKEN &&
      process.env.GITHUB_REPO_OWNER &&
      process.env.GITHUB_REPO_NAME
  );
}

function normalizeQueueItem(item: QueueItem): QueueItem {
  return {
    ...item,
    pingNewSnippet: Boolean(item.pingNewSnippet),
  };
}

function readQueueLocal(): QueueItem[] {
  try {
    ensureStateDir();
    if (!fs.existsSync(QUEUE_FILE)) return [];
    const raw = fs.readFileSync(QUEUE_FILE, "utf8");
    const items = JSON.parse(raw) as QueueItem[];
    return Array.isArray(items) ? items.map(normalizeQueueItem) : [];
  } catch {
    return [];
  }
}

function writeQueueLocal(items: QueueItem[]): void {
  ensureStateDir();
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(items, null, 2), "utf8");
}

export async function readQueue(): Promise<QueueItem[]> {
  if (!hasGitHubQueueBacking()) {
    return readQueueLocal();
  }

  try {
    const octokit = getOctokit();
    const file = await getFileContentOptional(octokit, QUEUE_STATE_PATH);
    if (!file) return [];
    const items = JSON.parse(file.content) as QueueItem[];
    return Array.isArray(items) ? items.map(normalizeQueueItem) : [];
  } catch {
    return [];
  }
}

export async function writeQueue(items: QueueItem[]): Promise<void> {
  const normalized = items.map(normalizeQueueItem);
  if (!hasGitHubQueueBacking()) {
    writeQueueLocal(normalized);
    return;
  }
  const octokit = getOctokit();
  await mutateJsonFile(
    octokit,
    QUEUE_STATE_PATH,
    `queue: sync (${normalized.length})`,
    [] as QueueItem[],
    () => normalized
  );
}

export async function updateQueueItem(
  id: string,
  patch: Partial<QueueItem>
): Promise<QueueItem | null> {
  let updated: QueueItem | null = null;

  if (!hasGitHubQueueBacking()) {
    const items = readQueueLocal();
    const i = items.findIndex((q) => q.id === id);
    if (i < 0) return null;
    items[i] = normalizeQueueItem({ ...items[i], ...patch });
    updated = items[i];
    writeQueueLocal(items);
    return updated;
  }

  const octokit = getOctokit();
  await mutateJsonFile(
    octokit,
    QUEUE_STATE_PATH,
    `queue: update ${id.slice(0, 8)}`,
    [] as QueueItem[],
    (items) => {
      const next = Array.isArray(items) ? [...items] : [];
      const i = next.findIndex((q) => q.id === id);
      if (i < 0) return next;
      next[i] = normalizeQueueItem({ ...next[i], ...patch });
      updated = next[i];
      return next;
    }
  );
  return updated;
}

export async function pushQueueItem(item: QueueItem): Promise<void> {
  const normalized = normalizeQueueItem(item);
  if (!hasGitHubQueueBacking()) {
    const items = readQueueLocal();
    items.push(normalized);
    writeQueueLocal(items);
    return;
  }
  const octokit = getOctokit();
  await mutateJsonFile(
    octokit,
    QUEUE_STATE_PATH,
    `queue: add ${item.id.slice(0, 8)}`,
    [] as QueueItem[],
    (items) => [...(Array.isArray(items) ? items : []), normalized]
  );
}

export async function removeQueueItem(id: string): Promise<boolean> {
  let removed = false;

  if (!hasGitHubQueueBacking()) {
    const items = readQueueLocal();
    const next = items.filter((q) => q.id !== id);
    removed = next.length !== items.length;
    if (removed) writeQueueLocal(next);
    return removed;
  }

  const octokit = getOctokit();
  await mutateJsonFile(
    octokit,
    QUEUE_STATE_PATH,
    `queue: remove ${id.slice(0, 8)}`,
    [] as QueueItem[],
    (items) => {
      const next = (Array.isArray(items) ? items : []).filter((q) => q.id !== id);
      removed = next.length !== (Array.isArray(items) ? items.length : 0);
      return next;
    }
  );
  return removed;
}

export type RepostStep =
  | "loading"
  | "posting"
  | "deleting"
  | "permissions"
  | "done";

export interface RepostJobState {
  jobId: string;
  status: "running" | "done" | "error";
  step: RepostStep;
  snippetsTotal: number;
  snippetsPosted: number;
  messagesTotal: number;
  messagesDeleted: number;
  errorMessage: string | null;
  blankChannelId: string;
  snippetChannelId: string;
  /** Set at job creation; used to update channels.json without re-fetching during repost. */
  channelsStateSha?: string;
  /** Filled in loading step; all posting chunks read only this (no GitHub snippet list). */
  cachedSnippets?: Snippet[];
  _postIndex?: number;
}
