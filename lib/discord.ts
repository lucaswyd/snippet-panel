import type { Snippet } from "@/lib/snippets";
import {
  buildNewSnippetsMessages,
  buildSwapChannelMessages,
  separatorMessage,
} from "@/lib/snippets";

const API = "https://discord.com/api/v10";

export const VIEW_CHANNEL_BIT = 1024;
export const VIEW_ROLE_ID = "1429636292110454816";

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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
  const res = await fetch(url, init);
  if (res.status === 429) {
    const ra = res.headers.get("retry-after");
    const ms = ra ? Math.ceil(parseFloat(ra) * 1000) : 1000;
    await sleep(ms);
    return discordFetch(url, init);
  }
  return res;
}

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
  await sleep(500);
}

/** Post snippet sequence + separator to a channel */
export async function postSnippetToChannel(
  channelId: string,
  messages: string[]
): Promise<void> {
  for (const m of messages) {
    await postChannelMessage(channelId, m);
  }
  await postChannelMessage(channelId, separatorMessage());
}

export async function postSnippetSwapFlow(
  blankChannelId: string,
  s: Snippet
): Promise<void> {
  const msgs = buildSwapChannelMessages(s);
  await postSnippetToChannel(blankChannelId, msgs);
}

export async function postSnippetNewWebhook(s: Snippet): Promise<void> {
  const url = process.env.WEBHOOK_NEW_SNIPPETS;
  if (!url) throw new Error("WEBHOOK_NEW_SNIPPETS is not set");
  const msgs = buildNewSnippetsMessages(s);
  for (const m of msgs) {
    const res = await fetch(`${url}?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: m }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`New snippets webhook failed: ${res.status} ${t}`);
    }
    await sleep(500);
  }
  await fetch(`${url}?wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: separatorMessage() }),
  });
  await sleep(500);
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
    await sleep(500);
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
  await sleep(500);
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
  await sleep(500);
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
    await sleep(500);
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
  await sleep(500);
}

