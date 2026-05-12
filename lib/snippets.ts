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

export interface SnippetMessageIds {
  messageIds: string[];
  separatorId?: string;
}

export interface SnippetMessageIdStore {
  public?: SnippetMessageIds;
  private?: SnippetMessageIds;
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
  pingNewSnippet: boolean;
  createdAt: string;
  rawFileUrls: string[];
}

export const BLANK_EMOJI = "⠀";
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
    const dateA = a.date ?? '';
    const dateB = b.date ?? '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const titleA = a.title ?? '';
    const titleB = b.title ?? '';
    return titleA.localeCompare(titleB);
  });
}

export function readSnippetMessageIds(s: Snippet): SnippetMessageIdStore {
  const cur = s.messageId;
  if (!cur) return {};
  if (typeof cur === "object" && cur !== null && !Array.isArray(cur)) {
    const o = cur as Record<string, unknown>;
    const parseSide = (v: unknown): SnippetMessageIds | undefined => {
      if (Array.isArray(v)) {
        return {
          messageIds: v.filter((x): x is string => typeof x === "string"),
        };
      }
      if (typeof v === "object" && v !== null) {
        const vv = v as Record<string, unknown>;
        const messageIds = Array.isArray(vv.messageIds)
          ? vv.messageIds.filter((x): x is string => typeof x === "string")
          : [];
        const separatorId =
          typeof vv.separatorId === "string" ? vv.separatorId : undefined;
        if (messageIds.length === 0 && !separatorId) return undefined;
        return { messageIds, separatorId };
      }
      return undefined;
    };
    return { public: parseSide(o.public), private: parseSide(o.private) };
  }
  if (Array.isArray(cur)) {
    return {
      public: { messageIds: cur.filter((x): x is string => typeof x === "string") },
    };
  }
  return {};
}

export function writeSnippetMessageIds(
  s: Snippet,
  target: "public" | "private",
  ids: SnippetMessageIds
): Snippet {
  const next: SnippetMessageIdStore = {
    ...readSnippetMessageIds(s),
    [target]: ids,
  };
  return { ...s, messageId: next };
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
  const titleLine = buildTitleLine(s);
  const metaBlock = `${buildProdLine(s)}\n**First Previewed:** ${preview}\n${statusPrefix}`;

  if (urls.length === 0) {
    return [`${titleLine}\n${metaBlock}`];
  }

  const linkChunks: string[][] = [];
  for (let i = 0; i < urls.length; i += 5) {
    linkChunks.push(urls.slice(i, i + 5).map(linkLine));
  }

  const messages: string[] = [];
  const firstLinks = linkChunks[0].join(" ");
  messages.push(`${titleLine}\n${firstLinks}\n${metaBlock}`);

  for (let c = 1; c < linkChunks.length; c++) {
    messages.push(linkChunks[c].join(" "));
  }

  return messages;
}

/**
 * Messages for WEBHOOK_NEW_SNIPPETS: same as swap, but the **last** message gets role ping prepended.
 */
export function buildNewSnippetsMessages(
  s: Snippet,
  includePing = true
): string[] {
  const base = buildSwapChannelMessages(s);
  if (base.length === 0) return base;
  if (!includePing) return base;
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

function sanitizeFilenameBase(title: string): string {
  return title
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/**
 * JSON file under `snippets/`, e.g. `Doin Good.json`.
 * Strips only characters illegal in paths (`\ / : * ? " < > |`).
 */
export function snippetFilename(title: string): string {
  const base = sanitizeFilenameBase(title);
  return `${base || "Untitled"}.json`;
}

export function snippetVideoFilename(
  title: string,
  index: number,
  extension: string
): string {
  const base = sanitizeFilenameBase(title) || "Untitled";
  const ext = extension.replace(/^\./, "").trim() || "mp4";
  return `${base} (Snippet ${index}).${ext}`;
}
