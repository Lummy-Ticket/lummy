/**
 * A GET of JSON for an effect, the way EntryPass reads its pass: the request is cancelled with the
 * effect (pass the effect's AbortController signal and abort it in the cleanup), and the body of an
 * error answer is let go instead of left unread. A body nobody reads keeps its request open, so a
 * test waiting for the network to go quiet waits forever, which React's double mount in development
 * made happen on every such page (3 Nov 2026).
 *
 * Null for an error answer, a body that is not JSON, a network failure, or an abort: the caller
 * shows its own fallback, after checking `signal.aborted` so an unmounted effect sets nothing.
 */
export async function getJson<T>(url: string, signal: AbortSignal, init?: RequestInit): Promise<T | null> {
  const r = await fetch(url, { ...init, signal }).catch(() => null);
  if (!r || signal.aborted) return null;
  if (!r.ok) {
    void r.body?.cancel().catch(() => {});
    return null;
  }
  return ((await r.json().catch(() => null)) as T | null) ?? null;
}
