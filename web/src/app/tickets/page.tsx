"use client";

import Link from "next/link";
import Image from "next/image";
import { Ticket, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EscrowStatusPill } from "@/components/common/EscrowStatusPill";
import { useOrders, formatIDR, formatEventDate } from "@/lib/mock";

export default function TicketsPage() {
  const orders = useOrders((s) => s.orders);

  return (
    <div className="max-w-4xl mx-auto px-5 lg:px-10 pt-28 pb-10">
      <h1 className="text-2xl md:text-3xl font-bold text-neutral-black mb-6">Tiket saya</h1>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center text-center py-16 gap-4">
          <span className="w-16 h-16 rounded-2xl bg-secondary-blue-soft text-lummy-500 grid place-items-center">
            <Ticket className="w-8 h-8" />
          </span>
          <p className="text-neutral-gray">Belum ada tiket. Jelajah event dan beli yang dijaga escrow.</p>
          <Link href="/events"><Button.Primary>Jelajah event</Button.Primary></Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/tickets/${o.id}`}
              className="bg-neutral-white rounded-2xl border border-neutral-light-gray-1 p-4 flex items-center gap-4 hover:border-lummy-500 transition"
            >
              <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-neutral-light-gray-1 shrink-0">
                <Image src={o.eventImage} alt={o.eventTitle} fill className="object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-fredoka font-semibold text-neutral-black truncate">{o.eventTitle}</h3>
                <p className="text-xs text-neutral-gray">{formatEventDate(o.eventDateISO)} · {o.tierName}</p>
                <div className="mt-1.5"><EscrowStatusPill status={o.escrowStatus} /></div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-fredoka font-bold text-lummy-500">{formatIDR(o.amount)}</div>
                <ChevronRight className="w-4 h-4 text-neutral-gray inline-block mt-1" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
