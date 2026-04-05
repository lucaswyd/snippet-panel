import type { RepostJobState } from "@/lib/queue";

/** Strip internal / bulky fields from JSON returned to the client. */
export function stripRepostJobForApi(j: RepostJobState): Record<string, unknown> {
  const { _postIndex: _i, cachedSnippets: _c, ...rest } = j;
  void _i;
  void _c;
  return rest;
}
