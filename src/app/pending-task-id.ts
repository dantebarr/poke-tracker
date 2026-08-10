// A synthetic id for a task that only exists optimistically, still waiting
// on `createTaskAction` to hand back the real one — never a real database
// id, so any control that would send a write for this id (complete, edit,
// delete) must refuse to fire while it's still pending. Shared by the field
// log's row list and the mobile task detail screen, both of which render
// from the same optimistic task list (#28, extended by #29).
export const PENDING_ID_PREFIX = "pending-";

export function isPendingTaskId(id: string): boolean {
  return id.startsWith(PENDING_ID_PREFIX);
}
