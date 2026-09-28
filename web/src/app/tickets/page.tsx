"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Ticket, ChevronRight, Timer, Lock, Scale, CheckCircle2, RotateCcw, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EscrowStatusPill } from "@/components/common/EscrowStatusPill";
import { PageContainer } from "@/components/layout/PageContainer";
import { useAccessGuard, useHydrated } from "@/lib/access";
import { PageGate } from "@/components/layout/PageGate";
import { useT, useFormatters } from "@/lib/i18n";
import {
  useOrders, useUser, phaseOf, msUntilRelease, type Order, type EscrowPhase,
} from "@/lib/mock";
import { useAccountOrders } from "@/lib/orders/client";

export default function TicketsPage() {
  const t = useT();
  const ready = useAccessGuard("account");
  const { formatIDR, formatEventDate, formatCountdown } = useFormatters();

  // What this ticket's money is doing right now, in one line.
  const stateLine = (o: Order, phase: EscrowPhase) => {
    switch (phase) {
      case "WINDOW_OPEN":
        return { urgent: true, Icon: Timer, text: t("Releases in", "Cair dalam") };
      case "PRE_EVENT":
        return { urgent: false, Icon: Lock, text: t("Releases 48h after the show", "Cair 48 jam setelah acara") };
      case "IN_REVIEW":
        return { urgent: false, Icon: Scale, text: t("Waiting on a decision", "Menunggu putusan") };
      case "RELEASED":
        return {
          urgent: false, Icon: CheckCircle2,
          text: o.autoReleased
            ? t("No claim was filed, so the seller was paid", "Tidak ada klaim, jadi penjual dibayar")
            : t("Closed by a decision", "Ditutup lewat putusan"),
        };
      case "REFUNDED":
        return {
          urgent: false, Icon: RotateCcw,
          text: o.autoRefundReason === "EVENT_CANCELLED"
            ? t("Event cancelled, money returned", "Acara dibatalkan, dana kembali")
            : t("Money returned to you", "Dana kembali ke kamu"),
        };
      default:
        return { urgent: false, Icon: Hourglass, text: t("Releasing to the seller", "Sedang dicairkan ke penjual") };
    }
  };
  // Data follows who is signed in: an account's orders come from the database, a sample
  // persona's from this browser.
  const user = useUser((s) => s.user);
  const sample = useOrders((s) => s.orders);
  const { orders: mine, error: loadError, refresh } = useAccountOrders(user?.account ? { buyer: user.id } : null);
  const orders = user?.account ? mine : sample;
  const sweepAutoRelease = useOrders((s) => s.sweepAutoRelease);
  const mounted = useHydrated();
  const [now, setNow] = useState(() => Date.now());

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

      {mounted && !orders && loadError ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-neutral-gray text-sm">{t("Your tickets could not be loaded. Check your connection.", "Tiketmu gagal dimuat. Cek koneksimu.")}</p>
          <Button.Ghost className="text-sm" onClick={refresh}>{t("Try again", "Coba lagi")}</Button.Ghost>
        </div>
      ) : !mounted || !orders ? (
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
        <div data-reveal="stagger" className="grid sm:grid-cols-2 gap-4">
          {orders.map((o) => {
            const phase = phaseOf(o, now);
            const left = msUntilRelease(o, now);
            const line = stateLine(o, phase);
            return (
              <Link
                key={o.id}
                href={`/tickets/${o.id}`}
                className="group min-w-0 bg-neutral-white rounded-2xl border-2 border-lummy-500 p-4 flex flex-col transition duration-300 hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[4px_4px_0px_#245397] active:translate-x-0 active:translate-y-0 active:shadow-[1px_1px_0px_#245397] active:duration-100"
              >
                <div className="flex gap-4">
                  <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-lummy-500 shrink-0">
                    <Image src={o.eventImage} alt={o.eventTitle} fill sizes="80px" className="object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-fredoka font-semibold text-neutral-black leading-snug line-clamp-2">{o.eventTitle}</h3>
                    <p className="text-xs text-neutral-gray mt-0.5">{formatEventDate(o.eventDateISO)}</p>
                    <p className="text-xs text-neutral-gray">{o.tierName}{o.quantity > 1 ? ` · ${o.quantity} ${t("tickets", "tiket")}` : ""}</p>
                    <div className="mt-2"><EscrowStatusPill phase={phase} /></div>
                  </div>
                </div>

                {/* One state line on every card. Identical slot on all of them, so a
                    row with a ticking countdown cannot leave its neighbour hollow. */}
                <div
                  className={`mt-3 flex items-center gap-1.5 min-w-0 text-xs rounded-lg px-2.5 py-1.5 ${
                    line.urgent ? "bg-secondary-gold-soft text-secondary-brown-dark" : "bg-secondary-gray-soft text-neutral-gray"
                  }`}
                >
                  <line.Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate min-w-0">{line.text}</span>
                  {line.urgent && <span className="font-mono font-semibold tabular-nums ml-auto shrink-0">{formatCountdown(left)}</span>}
                </div>

                <div className="grow min-h-3" aria-hidden />

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
