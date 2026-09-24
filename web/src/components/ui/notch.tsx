import { cn } from "@/lib/utils";

type Side = "top" | "bottom" | "left" | "right";

// Keep only the half of the circle that lies inside the ticket.
const CLIP: Record<Side, string> = {
  top: "[clip-path:inset(50%_0_0_0)]",
  bottom: "[clip-path:inset(0_0_50%_0)]",
  left: "[clip-path:inset(0_0_0_50%)]",
  right: "[clip-path:inset(0_50%_0_0)]",
};

/**
 * A half circle bitten out of a ticket's edge.
 *
 * Put its centre exactly on the ticket's OUTER edge, not on the middle of the border
 * line. The visible half then paints over the ticket's own outline, so the outline stops
 * at the bite instead of running across it, and the notch's border continues it as an
 * arc. `className` carries size, position, background (whatever sits behind the ticket)
 * and, for outlined tickets, the same border as the ticket.
 */
export function Notch({ side, className }: { side: Side; className: string }) {
  return <span aria-hidden className={cn("absolute z-10 rounded-full", CLIP[side], className)} />;
}
