"use client";

import { Check, Lock, Flag, Banknote, RotateCcw, Hourglass, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { EscrowPhase, Order } from "@/lib/mock";

type State = "done" | "now" | "next";

/**
 * Where the buyer's money is, as four stops. The pill says the state in words; this
 * shows how far along it is and what comes next.
 */
export function EscrowSteps({ order, phase, windowText }: { order: Order; phase: EscrowPhase; windowText: string }) {
  const t = useT();
  const cancelled = order.autoRefundReason === "EVENT_CANCELLED";
  const movedOut = order.autoRefundReason === "EVENT_POSTPONED";
  const refunded = phase === "REFUNDED";
  const settled = phase === "RELEASED" || refunded;

  const reached: Record<EscrowPhase, number> = {
    PRE_EVENT: 1,
    WINDOW_OPEN: 2,
    IN_REVIEW: 2,
    WINDOW_CLOSED: 3,
    RELEASED: 4,
    REFUNDED: 4,
  };
  const at = reached[phase];
  const state = (i: number): State => (i < at || (settled && i === at) ? "done" : i === at ? "now" : "next");

  const steps = [
    { Icon: Check, label: t("Paid", "Dibayar"), sub: "QRIS" },
    { Icon: Lock, label: t("In escrow", "Di escrow"), sub: t("until the show ends", "sampai acara selesai") },
    cancelled
      ? { Icon: Flag, label: t("Show cancelled", "Acara batal"), sub: t("by the organiser", "oleh penyelenggara") }
      : movedOut
      ? { Icon: Flag, label: t("Show postponed", "Acara diundur"), sub: t("you chose the money", "kamu pilih dana kembali") }
      : phase === "IN_REVIEW"
      ? { Icon: Flag, label: t("Claim filed", "Klaim diajukan"), sub: t("an arbiter decides", "arbiter memutus") }
      : {
          Icon: Flag,
          label: t("Show over", "Acara selesai"),
          sub: at > 2 ? t("window closed", "masa sengketa tutup") : t(`${windowText} to raise a problem`, `${windowText} untuk melapor`),
        },
    refunded
      ? { Icon: RotateCcw, label: t("Money back", "Uang kembali"), sub: t("to you", "ke kamu") }
      : phase === "IN_REVIEW"
      ? { Icon: Scale, label: t("Verdict", "Putusan"), sub: t("refund or payout", "refund atau cair") }
      : phase === "WINDOW_CLOSED"
      ? { Icon: Hourglass, label: t("Paying out", "Sedang cair"), sub: t("to the seller", "ke penjual") }
      : { Icon: Banknote, label: t("Seller paid", "Penjual dibayar"), sub: settled ? t("done", "selesai") : t("after the window", "setelah masa sengketa") },
  ];

  return (
    <ol className="relative grid grid-cols-4 gap-1" aria-label={t("Where your money is", "Posisi uangmu")}>
      {steps.map((s, i) => {
        const st = state(i);
        return (
          <li key={i} className="relative flex flex-col items-center text-center gap-1.5 min-w-0" aria-current={st === "now" ? "step" : undefined}>
            {/* Connector to the next stop: solid once travelled, dashed ahead */}
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-[17px] left-[calc(50%+22px)] right-[calc(-50%+22px)] border-t-2",
                  state(i + 1) === "next" ? "border-dashed border-neutral-light-gray-1" : "border-primary-navy"
                )}
              />
            )}
            <span
              className={cn(
                "relative w-9 h-9 rounded-full grid place-items-center border-2 shrink-0",
                st === "done" && (refunded && i === 3 ? "bg-neutral-gray border-neutral-gray text-white" : "bg-primary-navy border-primary-navy text-white"),
                st === "now" && "bg-primary-sky border-primary-navy text-primary-navy-dark",
                st === "next" && "bg-neutral-white border-dashed border-neutral-light-gray-1 text-neutral-gray"
              )}
            >
              {st === "now" && <span aria-hidden className="absolute -inset-0.5 rounded-full border-2 border-primary-navy motion-safe:animate-ping opacity-30" />}
              <s.Icon className="w-4 h-4" />
            </span>
            <span className={cn("text-xs font-semibold leading-tight", st === "next" ? "text-neutral-gray" : "text-neutral-black")}>{s.label}</span>
            <span className="text-[11px] text-neutral-gray leading-tight hidden sm:block">{s.sub}</span>
          </li>
        );
      })}
    </ol>
  );
}
