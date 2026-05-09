export type ActionType = "tagging" | "posting_private" | "posting_public" | "reposting";

export interface ActionQueueItem {
  id: string;
  type: ActionType;
  status: "pending" | "running" | "done" | "error";
  queueId?: string;
  snippetPath?: string;
  jobId?: string;
  createdAt: string;
  errorMessage?: string;
}

// Simple in-memory action queue for serverless environment
let actionQueue: ActionQueueItem[] = [];
let isProcessing = false;

export function addAction(item: Omit<ActionQueueItem, "id" | "createdAt" | "status">): string {
  const action: ActionQueueItem = {
    ...item,
    id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  
  actionQueue.push(action);
  return action.id;
}

export function getActionQueue(): ActionQueueItem[] {
  return [...actionQueue];
}

export function updateAction(id: string, updates: Partial<ActionQueueItem>): boolean {
  const index = actionQueue.findIndex(item => item.id === id);
  if (index === -1) return false;
  
  actionQueue[index] = { ...actionQueue[index], ...updates };
  return true;
}

export function removeAction(id: string): boolean {
  const index = actionQueue.findIndex(item => item.id === id);
  if (index === -1) return false;
  
  actionQueue.splice(index, 1);
  return true;
}

export function getRunningActions(): ActionQueueItem[] {
  return actionQueue.filter(item => item.status === "running");
}

export function hasRunningActionType(type: ActionType): boolean {
  return actionQueue.some(item => item.status === "running" && item.type === type);
}

export function hasAnyRunningActions(): boolean {
  return actionQueue.some(item => item.status === "running");
}

export function getNextPendingAction(): ActionQueueItem | null {
  return actionQueue.find(item => item.status === "pending") || null;
}

export function canStartAction(type: ActionType): boolean {
  // No actions running, or the next pending action is of this type
  const running = getRunningActions();
  const nextPending = getNextPendingAction();
  
  if (running.length === 0) {
    return true;
  }
  
  // If there are running actions, only allow if this is the next in line
  return nextPending?.type === type;
}

export function markActionRunning(id: string): boolean {
  return updateAction(id, { status: "running" });
}

export function markActionDone(id: string): boolean {
  updateAction(id, { status: "done" });
  // Remove done actions after a short delay
  setTimeout(() => removeAction(id), 1000);
  return true;
}

export function markActionError(id: string, error: string): boolean {
  updateAction(id, { status: "error", errorMessage: error });
  return true;
}
