"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Mail, Phone, ShieldCheck, BadgeCheck, Bell, X, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useUser, useProfile, useAlerts, type AlertChannel, type PayoutBank,
} from "@/lib/mock";
import { PageContainer } from "@/components/layout/PageContainer";
import { useT } from "@/lib/i18n";

const CHANNELS: { id: AlertChannel; label: string }[] = [
  { id: "email", label: "Email" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "telegram", label: "Telegram" },
];
const BANKS: PayoutBank[] = ["BCA", "Mandiri", "BNI", "BRI"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-6">
      <h3 className="font-fredoka font-semibold text-neutral-black mb-4">{title}</h3>
      {children}
    </div>
  );
}

export default function ProfilePage() {
  const t = useT();
  const [mounted, setMounted] = useState(false);
  const user = useUser((s) => s.user);
  const { phone, kycVerified, payoutBank, payoutNumber, setPhone, verifyKyc, setPayout } = useProfile();
  const channel = useAlerts((s) => s.channel);
  const setChannel = useAlerts((s) => s.setChannel);
  const subs = useAlerts((s) => s.subs);
  const unsubscribe = useAlerts((s) => s.unsubscribe);

  const [phoneVal, setPhoneVal] = useState("");
  const [bank, setBank] = useState<PayoutBank>("BCA");
  const [acct, setAcct] = useState("");

  useEffect(() => {
    setMounted(true);
    setPhoneVal(useProfile.getState().phone);
    if (useProfile.getState().payoutBank) setBank(useProfile.getState().payoutBank!);
    setAcct(useProfile.getState().payoutNumber);
  }, []);

  if (!mounted) return <div className="pt-28 pb-16 text-center text-neutral-gray">{t("Loading...", "Memuat...")}</div>;

  return (
    <PageContainer width="app" className="flex flex-col gap-5">
      <h1 className="text-2xl md:text-3xl font-bold text-neutral-black">{t("Profile", "Profil")}</h1>

      {/* Personal details */}
      <Section title={t("Personal details", "Info pribadi")}>
        <div className="flex flex-col gap-4">
          <div>
            <span className="text-xs text-neutral-gray">{t("Name", "Nama")}</span>
            <div className="mt-1 px-4 py-3 rounded-xl bg-secondary-gray-soft text-sm text-neutral-black">{user?.name ?? "-"}</div>
          </div>
          <div>
            <span className="text-xs text-neutral-gray">Email</span>
            <div className="mt-1 flex items-center gap-2 px-4 py-3 rounded-xl bg-secondary-gray-soft text-sm text-neutral-black">
              <Mail className="w-4 h-4 text-neutral-gray" /> {user?.email ?? "-"}
            </div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-neutral-gray">{t("WhatsApp number", "Nomor WhatsApp")}</span>
            <div className="flex items-center gap-2 rounded-xl border border-lummy-500 px-4 py-3">
              <Phone className="w-4 h-4 text-neutral-gray" />
              <input value={phoneVal} onChange={(e) => setPhoneVal(e.target.value)} className="w-full outline-none text-sm text-neutral-black" />
            </div>
          </label>
          <Button.Primary wrapperClass="w-fit" className="text-sm" onClick={() => { setPhone(phoneVal); toast.success(t("Profile saved", "Profil disimpan")); }}>{t("Save", "Simpan")}</Button.Primary>
        </div>
      </Section>

      {/* Identity / PSrE */}
      <Section title={t("Identity verification", "Verifikasi identitas")}>
        {kycVerified ? (
          <div className="flex items-center gap-3">
            <Badge.Base className="bg-secondary-green-soft text-secondary-green-dark text-sm inline-flex items-center gap-1"><BadgeCheck className="w-4 h-4" /> {t("Verified", "Terverifikasi")}</Badge.Base>
            <span className="text-sm text-neutral-gray">via Privy.id (PSrE)</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-neutral-gray">
              {t(
                "A one-time check so you can e-sign the letter of authorisation. Your ID photo is processed by a licensed Indonesian e-signature provider (Privy.id), Lummy never stores it.",
                "Verifikasi sekali supaya kamu bisa tanda tangan surat kuasa secara elektronik. Foto KTP diproses PSrE berlisensi (Privy.id), Lummy tidak pernah menyimpannya."
              )}
            </p>
            <Button.Primary wrapperClass="w-fit" className="text-sm flex items-center gap-2" onClick={() => { verifyKyc(); toast.success(t("Identity verified (demo)", "Identitas terverifikasi (demo)")); }}>
              <ShieldCheck className="w-4 h-4" /> {t("Verify identity", "Verifikasi identitas")}
            </Button.Primary>
          </div>
        )}
      </Section>

      {/* Alerts */}
      <Section title={t("Alerts & waitlist", "Notifikasi & waitlist")}>
        <div className="mb-4">
          <span className="text-xs text-neutral-gray">{t("Reach me on", "Dikabari lewat")}</span>
          <div className="grid grid-cols-3 gap-2 mt-1.5">
            {CHANNELS.map((c) => (
              <button key={c.id} onClick={() => { setChannel(c.id); toast.success(t(`Alerts via ${c.label}`, `Notifikasi lewat ${c.label}`)); }} className={`px-2 py-2 rounded-lg text-sm border cursor-pointer ${channel === c.id ? "bg-primary-navy text-white border-primary-navy" : "bg-neutral-white text-neutral-gray border-neutral-light-gray-1"}`}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="text-xs text-neutral-gray mb-2">{t("Your subscriptions", "Langganan kamu")}</div>
        {subs.length === 0 ? (
          <p className="text-sm text-neutral-gray">{t("Nothing yet. Join a waitlist or ask for alerts from an event page.", "Belum ada. Masuk waitlist atau minta dikabari dari halaman event.")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {subs.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-xl border border-neutral-light-gray-1">
                <div className="min-w-0">
                  <div className="text-sm text-neutral-black truncate">{s.eventTitle}</div>
                  <div className="text-xs text-neutral-gray flex items-center gap-1"><Bell className="w-3 h-3" /> {s.tierName ? t(`${s.tierName} waitlist`, `Waitlist ${s.tierName}`) : t("New ticket alerts", "Notifikasi tiket baru")}</div>
                </div>
                <button onClick={() => { unsubscribe(s.id); toast(t("Removed", "Dihapus")); }} className="text-neutral-gray hover:text-secondary-pink-dark cursor-pointer shrink-0"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Payout (seller) */}
      {user?.role === "SELLER" && (
        <Section title={t("Payout account", "Rekening pencairan")}>
          <div className="flex flex-col gap-4">
            <div>
              <span className="text-xs text-neutral-gray">{t("Bank", "Bank")}</span>
              <div className="grid grid-cols-4 gap-2 mt-1.5">
                {BANKS.map((b) => (
                  <button key={b} onClick={() => setBank(b)} className={`px-2 py-2 rounded-lg text-sm border cursor-pointer ${bank === b ? "bg-primary-navy text-white border-primary-navy" : "bg-neutral-white text-neutral-gray border-neutral-light-gray-1"}`}>{b}</button>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-neutral-gray">{t("Account number", "Nomor rekening")}</span>
              <div className="flex items-center gap-2 rounded-xl border border-lummy-500 px-4 py-3">
                <Building2 className="w-4 h-4 text-neutral-gray" />
                <input value={acct} onChange={(e) => setAcct(e.target.value)} placeholder="1234567890" className="w-full outline-none text-sm text-neutral-black" />
              </div>
            </label>
            {payoutBank && <p className="text-xs text-secondary-green-dark">{t("Saved", "Tersimpan")}: {payoutBank} · {payoutNumber}</p>}
            <Button.Primary wrapperClass="w-fit" className="text-sm" onClick={() => { setPayout(bank, acct); toast.success(t("Payout account saved", "Rekening disimpan")); }}>{t("Save account", "Simpan rekening")}</Button.Primary>
          </div>
        </Section>
      )}
    </PageContainer>
  );
}
