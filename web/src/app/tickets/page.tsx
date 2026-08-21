"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Ticket, ChevronRight, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EscrowStatusPill } from "@/components/common/EscrowStatusPill";
import { PageContainer } from "@/components/layout/PageContainer";
import { useAccessGuard } from "@/lib/access";
import { PageGate } from "@/components/layout/PageGate";
import { useT, useFormatters } from "@/lib/i18n";
import {useOrders, phaseOf, msUntilRelease,
} from "@/lib/mock";

export default function TicketsPage() {
  const t = useT();
  const ready = useAccessGuard("account");
  const { formatIDR, formatEventDate, formatCountdown } = useFormatters();
  const orders = useOrders((s) => s.orders);
  const sweepAutoRelease = useOrders((s) => s.sweepAutoRelease);
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      sweepAutoRelease();
    }, 1000);
    return () => clearInterval(t);
  }, [sweepAutoRelease]);

  if (!ready) return <PageGate />;

  return (
    <PageContainer width="app">
      <h1 className="text-2xl md:text-3xl font-bold text-neutral-black">{t("My tickets", "Tiket saya")}</h1>
      <p className="text-neutral-gray text-sm mt-1 mb-6">{t("Everything you bought, with the state of the money.", "Semua yang kamu beli, lengkap dengan status dananya.")}</p>

      {!mounted ? (
        <p className="text-neutral-gray text-sm">{t("Loading...", "Memuat...")}</p>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center text-center py-16 gap-4">
          <span className="w-16 h-16 rounded-2xl bg-secondary-blue-soft text-lummy-500 grid place-items-center">
            <Ticket className="w-8 h-8" />
          </span>
          <p className="text-neutral-gray">{t("No tickets yet. Browse events and buy one that escrow protects.", "Belum ada tiket. Jelajah event dan beli yang dijaga escrow.")}</p>
          <Link href="/events"><Button.Primary>{t("Browse events", "Jelajah event")}</Button.Primary></Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {orders.map((o) => {
            const phase = phaseOf(o, now);
            const left = msUntilRelease(o, now);
            return (
              <Link
                key={o.id}
                href={`/tickets/${o.id}`}
                className="group bg-neutral-white rounded-2xl border-2 border-lummy-500 p-4 flex flex-col transition hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[4px_4px_0px_#245397]"
              >
                <div className="flex gap-4">
                  <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-lummy-500 shrink-0">
                    <Image src={o.eventImage} alt={o.eventTitle} fill className="object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-fredoka font-semibold text-neutral-black truncate">{o.eventTitle}</h3>
                    <p className="text-xs text-neutral-gray mt-0.5">{formatEventDate(o.eventDateISO)}</p>
                    <p className="text-xs text-neutral-gray">{o.tierName}{o.quantity > 1 ? ` · ${o.quantity} ${t("tickets", "tiket")}` : ""}</p>
                    <div className="mt-2"><EscrowStatusPill phase={phase} /></div>
                  </div>
                </div>

                {/* Live countdown only matters while the window is running */}
                {phase === "WINDOW_OPEN" && (
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-secondary-brown-dark bg-secondary-gold-soft rounded-lg px-2.5 py-1.5">
                    <Timer className="w-3.5 h-3.5 shrink-0" />
                    {t("Releases in", "Cair dalam")} <span className="font-mono font-semibold tabular-nums">{formatCountdown(left)}</span>
                  </div>
                )}

                {/* Spacer so the stub pins to the bottom when grid rows stretch */}
                <div className="grow min-h-4" aria-hidden />

                <div className="-mx-4 -mb-4 px-4 py-3 rounded-b-2xl bg-secondary-cream-light border-t-2 border-dashed border-neutral-light-gray-1 flex items-center justify-between">
                  <span className="text-xs text-neutral-gray">{t("Total paid", "Total dibayar")}</span>
                  <span className="font-fredoka font-bold text-lummy-500 flex items-center gap-1">
                    {formatIDR(o.amount)} <ChevronRight className="w-4 h-4 text-neutral-gray group-hover:text-primary-navy transition" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
