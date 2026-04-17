/** Snippet JSON as stored in /snippets/*.json */
export interface Snippet {
  createdAt: string;
  title: string;
  titleConfirmed: boolean;
  feat?: string;
  prod: string;
  prodConfirmed: boolean;
  date: string;
  released: boolean;
  untagged_media: string[];
  tagged_media: string[];
  /** Temporary, removed after GitHub Action tagging */
  _queueId?: string;
  /** Legacy — preserve in JSON */
  ping?: unknown;
  webhookSelected?: unknown;
  messageId?: unknown;
}

export type QueueStatus =
  | "pending"
  | "tagging"
  | "posting"
  | "posting_private"
  | "posting_public"
  | "done"
  | "error";

export interface QueueItem {
  id: string;
  /** Repo path e.g. snippets/Doin Good.json */
  snippetPath: string;
  snippet: Snippet;
  status: QueueStatus;
  errorMessage?: string;
  isNew: boolean;
  createdAt: string;
  rawFileUrls: string[];
}

export const BLANK_EMOJI = "<:blank:1442341014307082320>";
export const NEW_SNIPPET_ROLE_PING = "<@&1429640765692186714>";

export function linkLine(url: string): string {
  return `[${BLANK_EMOJI}](${url})`;
}

/** `date` is YYYY-MM-DD */
export function formatDateMMDDYY(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts.map((p) => parseInt(p, 10));
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return isoDate;
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  const yy = String(y).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

export function sortSnippets(snippets: Snippet[]): Snippet[] {
  return [...snippets].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.title.localeCompare(b.title);
  });
}

function buildTitleLine(s: Snippet): string {
  const t = `${s.title}${s.titleConfirmed ? "" : "*"}`;
  const feat = s.feat?.trim();
  if (feat) return `${t} (feat. ${feat})`;
  return t;
}

function buildProdLine(s: Snippet): string {
  const p = `${s.prod}${s.prodConfirmed ? "" : "*"}`;
  return `Prod. ${p}`;
}

/**
 * Discord message contents for one snippet (swap channels — no role ping).
 * Each string is one message `content` (max 2000 chars; we stay well under).
 */
export function buildSwapChannelMessages(s: Snippet): string[] {
  const urls = s.tagged_media ?? [];
  return buildSnippetMessagesWithUrls(s, urls);
}

/** Same text format, but uses untagged_media links (private channel). */
export function buildPrivateChannelMessages(s: Snippet): string[] {
  const urls = s.untagged_media ?? [];
  return buildSnippetMessagesWithUrls(s, urls);
}

function buildSnippetMessagesWithUrls(s: Snippet, urls: string[]): string[] {
  const preview = formatDateMMDDYY(s.date);
  const statusWord = s.released ? "Released" : "Unreleased";
  const statusPrefix = `**Status:** ${statusWord}`;

  const head = `${buildTitleLine(s)}\n${buildProdLine(s)}\n\n**First Previewed:** ${preview}`;

  if (urls.length === 0) {
    return [`${head}\n${statusPrefix}`];
  }

  const linkChunks: string[][] = [];
  for (let i = 0; i < urls.length; i += 5) {
    linkChunks.push(urls.slice(i, i + 5).map(linkLine));
  }

  const messages: string[] = [];
  const firstLinks = linkChunks[0].join(" ");
  messages.push(`${head}\n${statusPrefix} ${firstLinks}`);

  for (let c = 1; c < linkChunks.length; c++) {
    messages.push(linkChunks[c].join(" "));
  }

  return messages;
}

/**
 * Messages for WEBHOOK_NEW_SNIPPETS: same as swap, but the **last** message gets role ping prepended.
 */
export function buildNewSnippetsMessages(s: Snippet): string[] {
  const base = buildSwapChannelMessages(s);
  if (base.length === 0) return base;
  const last = base.length - 1;
  const withPing = `${NEW_SNIPPET_ROLE_PING} ${base[last]}`;
  return [...base.slice(0, last), withPing];
}

export function separatorMessage(): string {
  return "​";
}

/** Safe filename piece from title (underscores, alnum) — legacy helper. */
export function slugifyTitle(title: string): string {
  return (
    title
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 80) || "Untitled"
  );
}

/**
 * JSON file under `snippets/`, e.g. `Doin Good.json`.
 * Strips only characters illegal in paths (`\ / : * ? " < > |`).
 */
export function snippetFilename(title: string): string {
  const base = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return `${base || "Untitled"}.json`;
}
