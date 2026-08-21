/**
 * Shown while a guarded page works out whether this visitor belongs here.
 * It is deliberately quiet: a redirect is usually a fraction of a second away,
 * and a spinner that flashes on every navigation reads worse than a blank.
 */
export function PageGate() {
  return <div className="pt-28 pb-16 min-h-[50vh]" aria-busy />;
}
