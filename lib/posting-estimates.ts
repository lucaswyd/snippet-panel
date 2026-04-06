import type { Snippet } from "@/lib/snippets";

/** After each successful webhook execute (`WEBHOOK_POST_GAP_MS` in discord.ts). */
export const DISCORD_WEBHOOK_GAP_SEC = 0.15;
/** After each successful bot REST call (`BOT_REST_GAP_MS` in discord.ts). */
export const DISCORD_BOT_GAP_SEC = 0.25;

/** GitHub read/write + Vercel round-trip per repost chunk (conservative). */
export const REPOST_CHUNK_OVERHEAD_SEC = 0.45;

/** Initial delay in `do-post-job` before posting. */
export const DO_POST_INITIAL_SLEEP_SEC = 2;

/**
 * Webhook posts for one snippet in swap flow (blank channel): body messages + separator.
 * Untagged snippets are skipped in repost / swap loop → 0.
 */
export function countSwapWebhookPosts(taggedUrlCount: number): number {
  if (taggedUrlCount <= 0) return 0;
  const body = Math.ceil(taggedUrlCount / 5);
  return body + 1;
}

/** Same message count as swap for the new-snippets announcement (plus separator). */
export function countNewSnippetsWebhookPosts(taggedUrlCount: number): number {
  return countSwapWebhookPosts(taggedUrlCount);
}

function taggedSnippets(snippets: Snippet[]): Snippet[] {
  return snippets.filter((s) => (s.tagged_media?.length ?? 0) > 0);
}

function sumSwapPosts(snippets: Snippet[]): number {
  let n = 0;
  for (const s of snippets) {
    n += countSwapWebhookPosts(s.tagged_media?.length ?? 0);
  }
  return n;
}

/**
 * Rough message count in the snippet channel before a full clear: proportional to
 * how much has been posted; used only for delete-phase time (very approximate).
 */
function guessChannelMessageCount(snippets: Snippet[]): number {
  const posts = sumSwapPosts(snippets);
  return Math.max(posts * 2, posts + 24);
}

/** Bulk-delete path: up to 100 per batch, bot REST pacing between batches. */
export function estimateBulkDeleteSeconds(approxMessageCount: number): number {
  if (approxMessageCount <= 0) return 5;
  const batches = Math.ceil(approxMessageCount / 100);
  return batches * (1.2 + DISCORD_BOT_GAP_SEC);
}

/** Permission overwrites + state commit (Discord + GitHub). */
export const PERMISSIONS_AND_STATE_SEC = 6;

function spread(seconds: number): { min: number; max: number } {
  return {
    min: Math.max(10, Math.round(seconds * 0.75)),
    max: Math.max(15, Math.round(seconds * 1.35)),
  };
}

/** JSON shape returned by `GET /api/posting-estimate`. */
export interface PostingEstimateApiResponse {
  taggedSnippetCount: number;
  repost: { min: number; max: number; summary: string };
  queueFullPipeline: { min: number; max: number; summary: string };
  taggingNote: string;
}

export interface RepostEstimate {
  /** Manual repost (chunked job): load → post each snippet → bulk-delete batches → permissions. */
  repost: { min: number; max: number; summary: string };
  /** One queue item after tagging: full swap repost + clear channel + permissions + optional new channel. */
  queueFullPipeline: { min: number; max: number; summary: string };
  /** GitHub Actions FFmpeg tagging only (not our API). */
  taggingNote: string;
}

export function estimatePostingDurations(snippets: Snippet[]): RepostEstimate {
  const withTags = taggedSnippets(snippets);
  const n = withTags.length;

  const swapPosts = sumSwapPosts(withTags);
  const postingDiscordSec = swapPosts * DISCORD_WEBHOOK_GAP_SEC;
  const msgGuess = guessChannelMessageCount(snippets);
  const repostChunks =
    1 + // loading
    n + // one snippet per chunk
    Math.ceil(msgGuess / 100) +
    1; // permissions
  const repostRaw =
    postingDiscordSec +
    repostChunks * REPOST_CHUNK_OVERHEAD_SEC +
    estimateBulkDeleteSeconds(msgGuess) +
    PERMISSIONS_AND_STATE_SEC;

  const deleteAllSec = estimateBulkDeleteSeconds(
    guessChannelMessageCount(snippets)
  );
  let maxNewChannelPosts = 0;
  for (const s of withTags) {
    const c = countNewSnippetsWebhookPosts(s.tagged_media?.length ?? 0);
    if (c > maxNewChannelPosts) maxNewChannelPosts = c;
  }
  const newExtra = maxNewChannelPosts * DISCORD_WEBHOOK_GAP_SEC;
  const queueRaw =
    DO_POST_INITIAL_SLEEP_SEC +
    postingDiscordSec +
    deleteAllSec +
    PERMISSIONS_AND_STATE_SEC +
    newExtra;

  const rs = spread(repostRaw);
  const qs = spread(queueRaw);

  return {
    repost: {
      min: rs.min,
      max: rs.max,
      summary: formatDurationRange(rs.min, rs.max),
    },
    queueFullPipeline: {
      min: qs.min,
      max: qs.max,
      summary: formatDurationRange(qs.min, qs.max),
    },
    taggingNote:
      "FFmpeg tagging in GitHub Actions usually takes a few minutes and can exceed 15 minutes for large or many files.",
  };
}

export function formatDurationRange(minSec: number, maxSec: number): string {
  if (maxSec <= 90) return `About ${Math.round((minSec + maxSec) / 2)}–${Math.ceil(maxSec)} sec`;
  const minM = Math.max(1, Math.round(minSec / 60));
  const maxM = Math.max(minM + 1, Math.round(maxSec / 60));
  if (minM === maxM) return `About ${minM} min`;
  return `About ${minM}–${maxM} min`;
}

export function formatDurationSingle(seconds: number): string {
  if (seconds < 90) return `~${Math.round(seconds)} sec`;
  const m = Math.round(seconds / 60);
  return `~${m} min`;
}
