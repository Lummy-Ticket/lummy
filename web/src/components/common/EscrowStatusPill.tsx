"use client";

import { Lock, CheckCircle2, RotateCcw, AlertTriangle, Hourglass, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { EscrowPhase } from "@/lib/mock";
import { useT } from "@/lib/i18n";

const MAP: Record<EscrowPhase, { en: string; id: string; cls: string; Icon: typeof Lock }> = {
  PRE_EVENT: { en: "Funds locked", id: "Dana terkunci", cls: "bg-secondary-blue-soft text-lummy-500", Icon: Lock },
  WINDOW_OPEN: { en: "Dispute window open", id: "Masa sengketa dibuka", cls: "bg-secondary-gold-soft text-secondary-brown-dark", Icon: Timer },
  WINDOW_CLOSED: { en: "Releasing to seller", id: "Sedang dicairkan", cls: "bg-secondary-blue-soft text-lummy-500", Icon: Hourglass },
  IN_REVIEW: { en: "Under review", id: "Sedang ditinjau", cls: "bg-secondary-orange-soft text-secondary-orange-dark", Icon: AlertTriangle },
  RELEASED: { en: "Paid to seller", id: "Cair ke penjual", cls: "bg-secondary-green-soft text-secondary-green-dark", Icon: CheckCircle2 },
  REFUNDED: { en: "Refunded to you", id: "Dana dikembalikan", cls: "bg-secondary-blue-soft text-lummy-500", Icon: RotateCcw },
};

export function EscrowStatusPill({ phase, className }: { phase: EscrowPhase; className?: string }) {
  const t = useT();
  const m = MAP[phase];
  return (
    <Badge.Base className={cn("inline-flex items-center gap-1 text-xs w-fit font-medium", m.cls, className)}>
      <m.Icon className="w-3 h-3" /> {t(m.en, m.id)}
    </Badge.Base>
  );
}
