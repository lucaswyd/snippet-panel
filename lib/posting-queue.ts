import { canStartAction, addAction, markActionRunning, markActionDone, markActionError } from "@/lib/action-queue";
import type { ActionType } from "@/lib/action-queue";

export async function waitForActionQueue(
  type: ActionType,
  queueId: string,
  snippetPath: string,
  maxWaitTime: number = 300000, // 5 minutes max wait
  retryInterval: number = 5000 // Check every 5 seconds
): Promise<{ success: boolean; actionId?: string; error?: string }> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    if (canStartAction(type)) {
      // We can start the action
      const actionId = addAction({ type, queueId, snippetPath });
      markActionRunning(actionId);
      return { success: true, actionId };
    }
    
    // Wait before checking again
    await new Promise(resolve => setTimeout(resolve, retryInterval));
  }
  
  // Timeout reached
  return { success: false, error: "Timeout waiting for action queue" };
}

export async function executeWithQueue<T>(
  type: ActionType,
  queueId: string,
  snippetPath: string,
  operation: () => Promise<T>
): Promise<{ success: boolean; result?: T; error?: string }> {
  // Wait for our turn in the queue
  const queueResult = await waitForActionQueue(type, queueId, snippetPath);
  if (!queueResult.success || !queueResult.actionId) {
    return { success: false, error: queueResult.error };
  }
  
  try {
    // Execute the operation
    const result = await operation();
    
    // Mark action as done
    markActionDone(queueResult.actionId);
    
    return { success: true, result };
  } catch (e) {
    // Mark action as error
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    markActionError(queueResult.actionId, errorMessage);
    
    return { success: false, error: errorMessage };
  }
}
