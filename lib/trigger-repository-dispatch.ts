import { getOctokit, githubOwner, githubRepo } from "@/lib/github";

export async function triggerRepositoryDispatch(
  eventType: "full-post-repost" | "full-post-queue",
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
