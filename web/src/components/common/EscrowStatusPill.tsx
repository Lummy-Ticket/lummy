import { Lock, CheckCircle2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { EscrowStatus } from "@/lib/mock";

const MAP = {
  LOCKED: { label: "Dana terkunci", cls: "bg-secondary-blue-soft text-lummy-500", Icon: Lock },
  RELEASED: { label: "Cair ke penjual", cls: "bg-secondary-green-soft text-secondary-green-dark", Icon: CheckCircle2 },
  REFUNDED: { label: "Dana dikembalikan", cls: "bg-secondary-blue-soft text-lummy-500", Icon: RotateCcw },
} as const;

export function EscrowStatusPill({ status, className }: { status: EscrowStatus; className?: string }) {
  const m = MAP[status];
  return (
    <Badge.Base className={cn("inline-flex items-center gap-1 text-xs w-fit font-medium", m.cls, className)}>
      <m.Icon className="w-3 h-3" /> {m.label}
    </Badge.Base>
  );
}
