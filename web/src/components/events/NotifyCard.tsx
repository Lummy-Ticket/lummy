"use client";

import toast from "react-hot-toast";
import { Bell, BellRing, X, Check } from "lucide-react";
import { useAlerts, type EventItem } from "@/lib/mock";

const CH_LABEL: Record<string, string> = { email: "email", whatsapp: "WhatsApp", telegram: "Telegram" };

export function NotifyCard({ event }: { event: EventItem }) {
  const subs = useAlerts((s) => s.subs);
  const channel = useAlerts((s) => s.channel);
  const subscribe = useAlerts((s) => s.subscribe);
  const unsubscribe = useAlerts((s) => s.unsubscribe);

  const eventSub = subs.find((s) => s.eventId === event.id && !s.tierId);

  return (
    <div className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5">
      <h4 className="font-fredoka font-semibold text-neutral-black flex items-center gap-2 mb-1">
        <Bell className="w-4 h-4 text-lummy-500" /> Notifikasi &amp; waitlist
      </h4>
      <p className="text-xs text-neutral-gray mb-3">Kami kabari via {CH_LABEL[channel]}. Ubah di profil.</p>

      {eventSub ? (
        <button
          onClick={() => { unsubscribe(eventSub.id); toast("Berhenti langganan"); }}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-secondary-green-soft text-secondary-green-dark text-sm mb-4 cursor-pointer"
        >
          <span className="flex items-center gap-2"><Check className="w-4 h-4" /> Dikabari kalau ada tiket baru</span>
          <X className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={() => { subscribe({ eventId: event.id, eventTitle: event.title }); toast.success("Oke, kami kabari!"); }}
          className="w-full flex items-center gap-2 p-3 rounded-xl border border-lummy-500 text-lummy-500 text-sm hover:bg-secondary-blue-light transition mb-4 cursor-pointer"
        >
          <BellRing className="w-4 h-4" /> Kabari kalau ada tiket baru
        </button>
      )}

      <div className="text-xs text-neutral-gray mb-2">Waitlist per tier</div>
      <div className="flex flex-col gap-2">
        {event.tiers.map((t) => {
          const sub = subs.find((s) => s.eventId === event.id && s.tierId === t.id);
          return (
            <div key={t.id} className="flex items-center justify-between text-sm">
              <span className="text-neutral-black">{t.name}</span>
              {sub ? (
                <button onClick={() => { unsubscribe(sub.id); toast("Keluar waitlist"); }} className="text-xs text-secondary-green-dark flex items-center gap-1 cursor-pointer">
                  <Check className="w-3 h-3" /> Di waitlist
                </button>
              ) : (
                <button onClick={() => { subscribe({ eventId: event.id, eventTitle: event.title, tierId: t.id, tierName: t.name }); toast.success(`Masuk waitlist ${t.name}`); }} className="text-xs text-primary-navy font-medium cursor-pointer">
                  Masuk waitlist
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
