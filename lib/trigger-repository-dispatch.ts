import { getOctokit, githubOwner, githubRepo } from "@/lib/github";

export async function triggerRepositoryDispatch(
  eventType:
    | "full-post-repost-public"
    | "full-post-repost-private"
    | "full-post-queue-public"
    | "full-post-queue-private"
    | "tag-videos",
  clientPayload: Record<string, unknown>
): Promise<void> {
  const octokit = getOctokit();
  await octokit.rest.repos.createDispatchEvent({
    owner: githubOwner(),
    repo: githubRepo(),
    event_type: eventType,
    client_payload: clientPayload,
  });
}

export async function triggerTagVideosWithQueue(
  clientPayload: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    const octokit = getOctokit();
    
    // Tagging can run immediately, no queue check needed
    // Start the workflow
    await octokit.rest.repos.createDispatchEvent({
      owner: githubOwner(),
      repo: githubRepo(),
      event_type: "tag-videos",
      client_payload: clientPayload,
    });

    return { success: true };
  } catch (e) {
    return { 
      success: false, 
      error: e instanceof Error ? e.message : "Unknown error" 
    };
  }
}
