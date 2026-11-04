/**
 * Shown while a guarded page works out whether this visitor belongs here.
 * It is deliberately quiet: a redirect is usually a fraction of a second away,
 * and a spinner that flashes on every navigation reads worse than a blank. It is a full screen
 * tall, so the footer does not paint mid-screen and then jump when the page arrives (CLS 0.35 to
 * 0.39 on checkout and the ticket pages; UX audit, 4 Nov 2026).
 */
export function PageGate() {
  return <div className="pt-28 pb-16 min-h-[100svh]" aria-busy />;
}
