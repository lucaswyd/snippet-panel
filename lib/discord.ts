import type { Snippet } from "@/lib/snippets";
import {
  buildNewSnippetsMessages,
  buildSwapChannelMessages,
  separatorMessage,
} from "@/lib/snippets";

const API = "https://discord.com/api/v10";

/** Webhook `wait=true` + Discord can be slow; cap stall time so CI doesn’t hang forever. */
const WEBHOOK_HTTP_TIMEOUT_MS = Number(
  process.env.DISCORD_WEBHOOK_HTTP_TIMEOUT_MS ?? 180_000
);
/** Bot REST (list/delete/overwrite). */
const BOT_HTTP_TIMEOUT_MS = Number(
  process.env.DISCORD_BOT_HTTP_TIMEOUT_MS ?? 120_000
);

/** Pacing after a successful webhook execute (429s wait via retry, not this). */
const WEBHOOK_POST_GAP_MS = 150;
/** Pacing after successful bot REST calls (429 handled in discordFetch). */
const BOT_REST_GAP_MS = 250;
const WEBHOOK_429_MAX_ATTEMPTS = 500;
/** Avoid sleeping hours on bad Retry-After values; log if capped. */
const WEBHOOK_429_MAX_WAIT_SEC = Number(
  process.env.DISCORD_WEBHOOK_429_MAX_WAIT_SEC ?? 900
);

function abortWithTimeout(
  ms: number,
  existing?: AbortSignal | null
): AbortSignal {
  const t = AbortSignal.timeout(ms);
  if (!existing) return t;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([t, existing]);
  }
  return t;
}

export const VIEW_CHANNEL_BIT = 1024;
export const VIEW_ROLE_ID = "1429636292110454816";

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Webhook execute: retry on 429 until success or hard cap (Discord Retry-After / JSON retry_after).
 */
async function executeWebhookPost(
  fullUrl: string,
  jsonBody: Record<string, unknown>
): Promise<void> {
  for (let attempt = 0; attempt < WEBHOOK_429_MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(fullUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jsonBody),
        signal: abortWithTimeout(WEBHOOK_HTTP_TIMEOUT_MS),
      });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "AbortError" || name === "TimeoutError") {
        throw new Error(
          `Webhook request timed out after ${WEBHOOK_HTTP_TIMEOUT_MS}ms (raise DISCORD_WEBHOOK_HTTP_TIMEOUT_MS if Discord is legitimately slow)`
        );
      }
      throw e;
    }

    if (res.status === 429) {
      const headerRa = res.headers.get("retry-after");
      let waitSec = headerRa ? parseFloat(headerRa) : NaN;
      if (Number.isNaN(waitSec) || waitSec < 0) {
        try {
          const j = (await res.json()) as { retry_after?: number };
          waitSec =
            typeof j.retry_after === "number" ? j.retry_after : 1;
        } catch {
          waitSec = 1;
        }
      }
      if (waitSec > WEBHOOK_429_MAX_WAIT_SEC) {
        console.warn(
          `[discord] webhook 429 Retry-After ${waitSec}s capped to ${WEBHOOK_429_MAX_WAIT_SEC}s (attempt ${attempt + 1})`
        );
        waitSec = WEBHOOK_429_MAX_WAIT_SEC;
      } else if (attempt === 0 || attempt % 5 === 0) {
        console.warn(
          `[discord] webhook 429: waiting ${waitSec}s (attempt ${attempt + 1}/${WEBHOOK_429_MAX_ATTEMPTS})`
        );
      }
      await sleep(Math.ceil(waitSec * 1000) + 25);
      continue;
    }

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Webhook post failed: ${res.status} ${t}`);
    }
    return;
  }
  throw new Error(
    `Webhook post: exceeded ${WEBHOOK_429_MAX_ATTEMPTS} rate-limit retries`
  );
}

function botHeaders(): HeadersInit {
  const t = process.env.DISCORD_BOT_TOKEN;
  if (!t) throw new Error("DISCORD_BOT_TOKEN is not set");
  return {
    Authorization: `Bot ${t}`,
    "Content-Type": "application/json",
  };
}

async function discordFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: abortWithTimeout(BOT_HTTP_TIMEOUT_MS, init?.signal),
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "AbortError" || name === "TimeoutError") {
      throw new Error(
        `Discord API request timed out after ${BOT_HTTP_TIMEOUT_MS}ms (${url.slice(0, 80)}…)`
      );
    }
    throw e;
  }
  if (res.status === 429) {
    const ra = res.headers.get("retry-after");
    const ms = ra ? Math.ceil(parseFloat(ra) * 1000) : 1000;
    await sleep(ms);
    return discordFetch(url, init);
  }
  return res;
}

const DEFAULT_CHANNEL_A = "1490100886024880371";
const DEFAULT_CHANNEL_B = "1488379652668915885";

/** Webhook URL for a physical channel (A/B). WEBHOOK_SNIPPETS → A, WEBHOOK_BLANK → B. */
export function webhookUrlForChannelId(channelId: string): string {
  const a = process.env.CHANNEL_A_ID || DEFAULT_CHANNEL_A;
  const b = process.env.CHANNEL_B_ID || DEFAULT_CHANNEL_B;
  if (channelId === a) return process.env.WEBHOOK_SNIPPETS ?? "";
  if (channelId === b) return process.env.WEBHOOK_BLANK ?? "";
  return "";
}

async function postToWebhook(webhookUrl: string, content: string): Promise<void> {
  const url = webhookUrl.includes("?")
    ? `${webhookUrl}&wait=true`
    : `${webhookUrl}?wait=true`;
  await executeWebhookPost(url, { content });
  await sleep(WEBHOOK_POST_GAP_MS);
}

/** Post snippet sequence + separator via webhook (swap channels — not bot). */
export async function postSnippetToWebhookUrl(
  webhookUrl: string,
  messages: string[]
): Promise<void> {
  if (!webhookUrl) {
    throw new Error(
      "Missing webhook for this channel. Set WEBHOOK_SNIPPETS (channel A) and WEBHOOK_BLANK (channel B), plus CHANNEL_A_ID / CHANNEL_B_ID if non-default."
    );
  }
  for (const m of messages) {
    await postToWebhook(webhookUrl, m);
  }
  await postToWebhook(webhookUrl, separatorMessage());
}

export async function postSnippetSwapFlow(
  blankChannelId: string,
  s: Snippet
): Promise<void> {
  const wh = webhookUrlForChannelId(blankChannelId);
  const msgs = buildSwapChannelMessages(s);
  await postSnippetToWebhookUrl(wh, msgs);
}

/** Bot: only for operations webhooks cannot do (delete, permissions). */
export async function postChannelMessage(
  channelId: string,
  content: string
): Promise<void> {
  const res = await discordFetch(`${API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: botHeaders(),
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Discord post failed: ${res.status} ${t}`);
  }
  await sleep(BOT_REST_GAP_MS);
}

export async function postSnippetNewWebhook(s: Snippet): Promise<void> {
  const url = process.env.WEBHOOK_NEW_SNIPPETS;
  if (!url) throw new Error("WEBHOOK_NEW_SNIPPETS is not set");
  const base = url.includes("?") ? `${url}&wait=true` : `${url}?wait=true`;
  const msgs = buildNewSnippetsMessages(s);
  for (const m of msgs) {
    await executeWebhookPost(base, { content: m });
    await sleep(WEBHOOK_POST_GAP_MS);
  }
  await executeWebhookPost(base, { content: separatorMessage() });
  await sleep(WEBHOOK_POST_GAP_MS);
}

export interface DiscordMessage {
  id: string;
  timestamp: string;
}

export async function fetchChannelMessagesPage(
  channelId: string,
  before?: string
): Promise<DiscordMessage[]> {
  const q = new URLSearchParams({ limit: "100" });
  if (before) q.set("before", before);
  const res = await discordFetch(
    `${API}/channels/${channelId}/messages?${q}`,
    { headers: botHeaders() }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Discord list messages: ${res.status} ${t}`);
  }
  return (await res.json()) as DiscordMessage[];
}

/** All messages, oldest first (for consistent deletion) */
export async function fetchAllChannelMessages(
  channelId: string
): Promise<DiscordMessage[]> {
  const all: DiscordMessage[] = [];
  let before: string | undefined;
  for (;;) {
    const page = await fetchChannelMessagesPage(channelId, before);
    if (page.length === 0) break;
    all.push(...page);
    before = page[page.length - 1].id;
    await sleep(BOT_REST_GAP_MS);
  }
  return all;
}

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

async function deleteOneMessage(
  channelId: string,
  messageId: string
): Promise<void> {
  const res = await discordFetch(
    `${API}/channels/${channelId}/messages/${messageId}`,
    { method: "DELETE", headers: botHeaders() }
  );
  if (!res.ok && res.status !== 404) {
    const t = await res.text();
    throw new Error(`Discord delete one: ${res.status} ${t}`);
  }
  await sleep(BOT_REST_GAP_MS);
}

/** Delete up to 100 messages (one API page). Returns how many were deleted. */
export async function deleteNextMessageBatch(
  channelId: string
): Promise<number> {
  const page = await fetchChannelMessagesPage(channelId);
  if (page.length === 0) return 0;
  const ids = page.map((m) => m.id);
  if (ids.length === 1) {
    await deleteOneMessage(channelId, ids[0]);
    return 1;
  }
  const res = await discordFetch(
    `${API}/channels/${channelId}/messages/bulk-delete`,
    {
      method: "POST",
      headers: botHeaders(),
      body: JSON.stringify({ messages: ids }),
    }
  );
  if (!res.ok) {
    for (const id of ids) {
      await deleteOneMessage(channelId, id);
    }
  }
  await sleep(BOT_REST_GAP_MS);
  return ids.length;
}

export async function deleteMessagesInChannel(channelId: string): Promise<void> {
  const messages = await fetchAllChannelMessages(channelId);
  if (messages.length === 0) return;

  const now = Date.now();
  const idsNew = messages.filter((m) => {
    const t = new Date(m.timestamp).getTime();
    return now - t < FOURTEEN_DAYS_MS;
  });
  const idsOld = messages.filter((m) => {
    const t = new Date(m.timestamp).getTime();
    return now - t >= FOURTEEN_DAYS_MS;
  });

  for (let i = 0; i < idsNew.length; i += 100) {
    const batch = idsNew.slice(i, i + 100).map((m) => m.id);
    if (batch.length === 1) {
      await deleteOneMessage(channelId, batch[0]);
      continue;
    }
    const res = await discordFetch(
      `${API}/channels/${channelId}/messages/bulk-delete`,
      {
        method: "POST",
        headers: botHeaders(),
        body: JSON.stringify({ messages: batch }),
      }
    );
    if (!res.ok) {
      for (const id of batch) await deleteOneMessage(channelId, id);
    }
    await sleep(BOT_REST_GAP_MS);
  }

  for (const m of idsOld) {
    await deleteOneMessage(channelId, m.id);
  }
}

/** type 0 = role */
export async function setRoleChannelOverwrite(
  channelId: string,
  roleId: string,
  allowView: boolean
): Promise<void> {
  const body = allowView
    ? { type: 0, allow: String(VIEW_CHANNEL_BIT), deny: "0" }
    : { type: 0, allow: "0", deny: String(VIEW_CHANNEL_BIT) };
  const res = await discordFetch(
    `${API}/channels/${channelId}/permissions/${roleId}`,
    {
      method: "PUT",
      headers: botHeaders(),
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Discord overwrite: ${res.status} ${t}`);
  }
  await sleep(BOT_REST_GAP_MS);
}

