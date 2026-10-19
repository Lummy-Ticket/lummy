"use client";

import toast from "react-hot-toast";
import { Bell, BellRing, X, Check } from "lucide-react";
import { useAlerts, type EventItem } from "@/lib/mock";
import { useT } from "@/lib/i18n";

const CH_LABEL: Record<string, string> = { email: "email", whatsapp: "WhatsApp", telegram: "Telegram" };

export function NotifyCard({ event }: { event: EventItem }) {
  const t = useT();
  const subs = useAlerts((s) => s.subs);
  const channel = useAlerts((s) => s.channel);
  const subscribe = useAlerts((s) => s.subscribe);
  const unsubscribe = useAlerts((s) => s.unsubscribe);

  const eventSub = subs.find((s) => s.eventId === event.id && !s.tierId);

  return (
    <div className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5">
      <h4 className="font-semibold text-neutral-black flex items-center gap-2 mb-1">
        <Bell className="w-4 h-4 text-lummy-500" /> {t("Alerts & waitlist", "Notifikasi & waitlist")}
      </h4>
      <p className="text-xs text-neutral-gray mb-3">{t(`We will ping you on ${CH_LABEL[channel]}. Change it in your profile.`, `Kami kabari lewat ${CH_LABEL[channel]}. Ubah di profil.`)}</p>

      {eventSub ? (
        <button
          onClick={() => { unsubscribe(eventSub.id); toast(t("Alerts off", "Notifikasi dimatikan")); }}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-secondary-green-soft text-secondary-green-dark text-sm mb-4 cursor-pointer"
        >
          <span className="flex items-center gap-2"><Check className="w-4 h-4" /> {t("You will hear about new tickets", "Dikabari kalau ada tiket baru")}</span>
          <X className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={() => { subscribe({ eventId: event.id, eventTitle: event.title }); toast.success(t("Done, we will let you know", "Oke, nanti kami kabari")); }}
          className="w-full flex items-center gap-2 p-3 rounded-xl border border-lummy-500 text-lummy-500 text-sm hover:bg-secondary-blue-light transition mb-4 cursor-pointer"
        >
          <BellRing className="w-4 h-4" /> {t("Notify me about new tickets", "Kabari kalau ada tiket baru")}
        </button>
      )}

      <div className="text-xs text-neutral-gray mb-2">{t("Waitlist by tier", "Waitlist per tier")}</div>
      <div className="flex flex-col gap-2">
        {event.tiers.map((tier) => {
          const sub = subs.find((s) => s.eventId === event.id && s.tierId === tier.id);
          return (
            <div key={tier.id} className="flex items-center justify-between text-sm">
              <span className="text-neutral-black">{tier.name}</span>
              {sub ? (
                <button onClick={() => { unsubscribe(sub.id); toast(t("Left the waitlist", "Keluar dari waitlist")); }} className="text-xs text-secondary-green-dark flex items-center gap-1 cursor-pointer">
                  <Check className="w-3 h-3" /> {t("On the list", "Di waitlist")}
                </button>
              ) : (
                <button onClick={() => { subscribe({ eventId: event.id, eventTitle: event.title, tierId: tier.id, tierName: tier.name }); toast.success(t(`Joined the ${tier.name} waitlist`, `Masuk waitlist ${tier.name}`)); }} className="text-xs text-primary-navy font-medium cursor-pointer">
                  {t("Join waitlist", "Masuk waitlist")}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
