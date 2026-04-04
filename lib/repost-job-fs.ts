import fs from "fs";
import path from "path";
import type { RepostJobState } from "@/lib/queue";

function stateDir(): string {
  if (process.env.VERCEL) {
    return path.join("/tmp", "snippet-panel-state");
  }
  return path.join(process.cwd(), "state");
}

const REPOST_FILE = path.join(stateDir(), "repost-job.json");

function ensureStateDir(): void {
  const dir = stateDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function readRepostJobSync(): RepostJobState | null {
  try {
    ensureStateDir();
    if (!fs.existsSync(REPOST_FILE)) return null;
    const raw = fs.readFileSync(REPOST_FILE, "utf8");
    return JSON.parse(raw) as RepostJobState;
  } catch {
    return null;
  }
}

export function writeRepostJobSync(job: RepostJobState): void {
  ensureStateDir();
  fs.writeFileSync(REPOST_FILE, JSON.stringify(job, null, 2), "utf8");
}
