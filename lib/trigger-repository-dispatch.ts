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
    
    // Check if we can start tagging action
    const baseUrl = process.env.VERCEL_APP_URL || "http://localhost:3000";
    const response = await fetch(`${baseUrl}/api/action-queue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.CALLBACK_SECRET || "",
      },
      body: JSON.stringify({
        type: "tagging",
        queueId: clientPayload.queueId,
        snippetPath: clientPayload.snippetPath,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error || "Failed to queue action" };
    }

    const result = await response.json();
    if (result.error) {
      return { success: false, error: result.error };
    }

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
