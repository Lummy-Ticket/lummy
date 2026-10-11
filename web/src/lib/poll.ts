/**
 * Calls `load` every `intervalMs` while the page is visible, and at once when it becomes visible
 * again: a tab left open in the background costs the server and the public RPC nothing. Returns the
 * function that stops it.
 */
export function pollWhileVisible(load: () => void, intervalMs: number) {
  const tick = () => {
    if (document.visibilityState === "visible") load();
  };
  const timer = setInterval(tick, intervalMs);
  document.addEventListener("visibilitychange", tick);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", tick);
  };
}
