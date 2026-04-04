import fs from "fs";
import path from "path";
import type { QueueItem } from "@/lib/snippets";

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
const REPOST_FILE = path.join(STATE_DIR, "repost-job.json");

function ensureStateDir(): void {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

export function readQueue(): QueueItem[] {
  try {
    ensureStateDir();
    if (!fs.existsSync(QUEUE_FILE)) return [];
    const raw = fs.readFileSync(QUEUE_FILE, "utf8");
    return JSON.parse(raw) as QueueItem[];
  } catch {
    return [];
  }
}

export function writeQueue(items: QueueItem[]): void {
  ensureStateDir();
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(items, null, 2), "utf8");
}

export function updateQueueItem(
  id: string,
  patch: Partial<QueueItem>
): QueueItem | null {
  const items = readQueue();
  const i = items.findIndex((q) => q.id === id);
  if (i < 0) return null;
  items[i] = { ...items[i], ...patch };
  writeQueue(items);
  return items[i];
}

export function pushQueueItem(item: QueueItem): void {
  const items = readQueue();
  items.push(item);
  writeQueue(items);
}

export function removeQueueItem(id: string): boolean {
  const items = readQueue();
  const next = items.filter((q) => q.id !== id);
  if (next.length === items.length) return false;
  writeQueue(next);
  return true;
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
  _postIndex?: number;
}

export function readRepostJob(): RepostJobState | null {
  try {
    ensureStateDir();
    if (!fs.existsSync(REPOST_FILE)) return null;
    const raw = fs.readFileSync(REPOST_FILE, "utf8");
    return JSON.parse(raw) as RepostJobState;
  } catch {
    return null;
  }
}

export function writeRepostJob(job: RepostJobState): void {
  ensureStateDir();
  fs.writeFileSync(REPOST_FILE, JSON.stringify(job, null, 2), "utf8");
}

export function clearRepostJob(): void {
  try {
    if (fs.existsSync(REPOST_FILE)) fs.unlinkSync(REPOST_FILE);
  } catch {
    /* ignore */
  }
}
