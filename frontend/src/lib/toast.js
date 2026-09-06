// Tiny pub/sub for toast notifications. Fire from anywhere with
// `toast.success("Saved")` — the <Toasts /> component renders them.

const listeners = new Set();
let nextId = 1;

export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const emit = (kind, message) => {
  const t = { id: nextId++, kind, message };
  listeners.forEach((fn) => fn(t));
};

export const toast = {
  success: (m) => emit("success", m),
  error: (m) => emit("error", m),
  info: (m) => emit("info", m),
};
