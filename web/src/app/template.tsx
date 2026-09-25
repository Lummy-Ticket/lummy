// Re-mounts on every navigation, so each page fades in instead of snapping.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="lm-page">{children}</div>;
}
