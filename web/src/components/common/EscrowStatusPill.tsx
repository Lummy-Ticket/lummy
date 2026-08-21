import { Lock, CheckCircle2, RotateCcw, AlertTriangle, Hourglass, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { EscrowPhase } from "@/lib/mock";

const MAP: Record<EscrowPhase, { label: string; cls: string; Icon: typeof Lock }> = {
  PRE_EVENT: { label: "Funds locked", cls: "bg-secondary-blue-soft text-lummy-500", Icon: Lock },
  WINDOW_OPEN: { label: "Dispute window open", cls: "bg-secondary-gold-soft text-secondary-brown-dark", Icon: Timer },
  WINDOW_CLOSED: { label: "Releasing to seller", cls: "bg-secondary-blue-soft text-lummy-500", Icon: Hourglass },
  IN_REVIEW: { label: "Under review", cls: "bg-secondary-orange-soft text-secondary-orange-dark", Icon: AlertTriangle },
  RELEASED: { label: "Paid to seller", cls: "bg-secondary-green-soft text-secondary-green-dark", Icon: CheckCircle2 },
  REFUNDED: { label: "Refunded to you", cls: "bg-secondary-blue-soft text-lummy-500", Icon: RotateCcw },
};

export function EscrowStatusPill({ phase, className }: { phase: EscrowPhase; className?: string }) {
  const m = MAP[phase];
  return (
    <Badge.Base className={cn("inline-flex items-center gap-1 text-xs w-fit font-medium", m.cls, className)}>
      <m.Icon className="w-3 h-3" /> {m.label}
    </Badge.Base>
  );
}
