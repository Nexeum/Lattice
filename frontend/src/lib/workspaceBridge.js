/**
 * Tiny pub/sub bridge between the workspace page (room.js) and the right
 * sidebar (Right.js), which lives in a separate React tree.
 *
 * - Workspace info flows room.js -> Right.js via publish/subscribe.
 * - UI actions ("network", "create-node") flow Right.js -> room.js.
 */

const listeners = new Set();
const actionListeners = new Set();
let current = null;

/** Publish the latest workspace snapshot to all subscribers. */
export const publishWorkspaceInfo = (info) => {
  current = info;
  listeners.forEach((fn) => fn(current));
};

/** Clear the snapshot (called when leaving the workspace page). */
export const clearWorkspaceInfo = () => {
  current = null;
  listeners.forEach((fn) => fn(null));
};

/**
 * Subscribe to workspace info. The callback fires immediately with the
 * current value, then on every change. Returns an unsubscribe function.
 */
export const subscribeWorkspaceInfo = (fn) => {
  fn(current);
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Fire a named workspace action (e.g. 'network', 'create-node'). */
export const triggerWorkspaceAction = (name) => {
  actionListeners.forEach((fn) => fn(name));
};

/** Listen for workspace actions. Returns an unsubscribe function. */
export const onWorkspaceAction = (fn) => {
  actionListeners.add(fn);
  return () => actionListeners.delete(fn);
};
