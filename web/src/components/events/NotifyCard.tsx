"use client";

import toast from "react-hot-toast";
import { Bell, BellRing, X, Check } from "lucide-react";
import { useAlerts, useUser, type EventItem } from "@/lib/mock";
import { useAccountAlerts } from "@/lib/alerts/client";
import { useT } from "@/lib/i18n";
import { FEATURES } from "@/lib/features";
import { isDemoEmail } from "@/lib/supabase/demo";

export function NotifyCard({ event }: { event: EventItem }) {
  const t = useT();
  const user = useUser((s) => s.user);
  const localSubs = useAlerts((s) => s.subs);
  const subscribe = useAlerts((s) => s.subscribe);
  const unsubscribe = useAlerts((s) => s.unsubscribe);
  // Once emails are live, an account's alerts are kept on the server, which sends them; a sample
  // persona's stay in this browser, and so does everyone's until then (not carried over: see
  // lib/alerts/client).
  const server = FEATURES.emails && !!user?.account;
  const remote = useAccountAlerts(server);
  const subs = server ? (remote.subs ?? []) : localSubs;
  const failed = () => toast.error(t("Could not save. Try again.", "Gagal menyimpan. Coba lagi."));

  const follow = (tier: { tierId: string; tierName: string } | null, done: string) => {
    if (server) {
      remote.subscribe({ eventId: event.id, tierId: tier?.tierId }).then(() => toast.success(done), failed);
      return;
    }
    subscribe({ eventId: event.id, eventTitle: event.title, ...tier });
    toast.success(done);
  };
  const unfollow = (id: string, done: string) => {
    if (server) {
      remote.unsubscribe(id).then(() => toast(done), failed);
      return;
    }
    unsubscribe(id);
    toast(done);
  };

  const eventSub = subs.find((s) => s.eventId === event.id && !s.tierId);

  return (
    <div className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5">
      <h4 className="font-semibold text-neutral-black flex items-center gap-2 mb-1">
        <Bell className="w-4 h-4 text-lummy-500" /> {t("Alerts & waitlist", "Notifikasi & waitlist")}
      </h4>
      {FEATURES.emails ? (
        <p className="text-xs text-neutral-gray mb-3">
          {!server
            ? t("Sample persona: your choice is kept in this browser, and nothing is sent.", "Persona contoh: pilihanmu tersimpan di browser ini, dan tidak ada yang dikirim.")
            : remote.failed
              ? t("Could not load your alerts. Reload to try again.", "Notifikasi gagal dimuat. Muat ulang untuk mencoba lagi.")
              : isDemoEmail(user?.email ?? "")
                ? // A demo address has no mailbox (lib/supabase/demo), so it is never written to.
                  t("Demo account: your choice is saved, but demo addresses never receive email.", "Akun demo: pilihanmu tersimpan, tapi alamat demo tidak pernah menerima email.")
                : t(`We email ${user?.email} when tickets appear. Stop any time here or in your profile.`, `Kami kirim email ke ${user?.email} saat ada tiket. Berhenti kapan saja di sini atau di profil.`)}
        </p>
      ) : (
        // Nothing is sent yet (lib/features.ts): say so, rather than promise a message.
        <p data-alerts-soon className="text-xs text-neutral-gray mb-3">
          {t(
            "Coming soon: an email when tickets appear. For now no email is sent; your choice is only kept in this browser.",
            "Segera hadir: notifikasi email saat ada tiket. Untuk sekarang belum ada email terkirim; pilihanmu cuma tersimpan di browser ini."
          )}
        </p>
      )}

      {eventSub ? (
        <button
          onClick={() => unfollow(eventSub.id, t("Alerts off", "Notifikasi dimatikan"))}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-secondary-green-soft text-secondary-green-dark text-sm mb-4 cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Check className="w-4 h-4" />
            {FEATURES.emails
              ? t("You will hear about new tickets", "Dikabari kalau ada tiket baru")
              : t("Following, saved in this browser", "Diikuti, tersimpan di browser ini")}
          </span>
          <X className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={() =>
            follow(
              null,
              FEATURES.emails
                ? t("Done, we will let you know", "Oke, nanti kami kabari")
                : t("Saved in this browser. No email is sent yet.", "Tersimpan di browser ini. Belum ada email terkirim.")
            )
          }
          className="w-full flex items-center gap-2 p-3 rounded-xl border border-lummy-500 text-lummy-500 text-sm hover:bg-secondary-blue-light transition mb-4 cursor-pointer"
        >
          <BellRing className="w-4 h-4" />{" "}
          {FEATURES.emails ? t("Notify me about new tickets", "Kabari kalau ada tiket baru") : t("Follow this show", "Ikuti acara ini")}
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
                <button onClick={() => unfollow(sub.id, t("Left the waitlist", "Keluar dari waitlist"))} className="text-xs text-secondary-green-dark flex items-center gap-1 cursor-pointer">
                  <Check className="w-3 h-3" /> {t("On the list", "Di waitlist")}
                </button>
              ) : (
                <button
                  onClick={() =>
                    follow(
                      { tierId: tier.id, tierName: tier.name },
                      FEATURES.emails
                        ? t(`Joined the ${tier.name} waitlist`, `Masuk waitlist ${tier.name}`)
                        : t(`On the ${tier.name} waitlist, saved in this browser. No email is sent yet.`, `Masuk waitlist ${tier.name}, tersimpan di browser ini. Belum ada email terkirim.`)
                    )
                  }
                  className="text-xs text-primary-navy font-medium cursor-pointer"
                >
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
