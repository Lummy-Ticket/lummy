"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Mail, Phone, ShieldCheck, BadgeCheck, Bell, X, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useUser, useProfile, useAlerts, type PayoutBank,
} from "@/lib/mock";
import { PageContainer } from "@/components/layout/PageContainer";
import { isStaff, useAccessGuard, useHydrated } from "@/lib/access";
import { PageGate } from "@/components/layout/PageGate";
import { useAccountAlerts } from "@/lib/alerts/client";
import { useT } from "@/lib/i18n";
import { FEATURES } from "@/lib/features";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { isDemoEmail } from "@/lib/supabase/demo";
import { FRESH_SIGN_IN_MINUTES, PAYOUT_BANKS, payoutNumberOf } from "@/lib/profile/payout";
import { routeErrorText } from "@/lib/route-errors";

const BANKS: PayoutBank[] = [...PAYOUT_BANKS];

type DbProfile = { full_name: string; phone: string | null; payout_bank: string | null; payout_number: string | null; kyc: "unverified" | "verified" };
const PROFILE_COLUMNS = "full_name, phone, payout_bank, payout_number, kyc";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-6">
      {/* h2 under the page's h1, drawn at the size it had as an h3 (A5, UX review 5 Nov 2026) */}
      <h2 className="text-lg md:text-xl leading-tight font-semibold text-neutral-black mb-4">{title}</h2>
      {children}
    </div>
  );
}

export default function ProfilePage() {
  const t = useT();
  const router = useRouter();
  const ready = useAccessGuard("account");
  const mounted = useHydrated();
  const user = useUser((s) => s.user);
  const { phone, kycVerified, payoutBank, payoutNumber, setPhone, verifyKyc, setPayout } = useProfile();
  const localSubs = useAlerts((s) => s.subs);
  const unsubscribe = useAlerts((s) => s.unsubscribe);

  // A real account reads and writes its own row in the database (RLS: only itself). A sample
  // persona keeps these details in this browser.
  const account = user?.account ? user : null;
  const accountId = account?.id;

  // Alerts too, once emails are live (lib/features.ts): the server keeps an account's and sends them.
  const serverAlerts = FEATURES.emails && !!account;
  const remote = useAccountAlerts(serverAlerts);
  const subs = serverAlerts ? remote.subs : localSubs;
  const removeAlert = (id: string) => {
    if (serverAlerts) {
      remote.unsubscribe(id).then(
        () => toast(t("Removed", "Dihapus")),
        () => toast.error(t("Could not save. Try again.", "Gagal menyimpan. Coba lagi."))
      );
      return;
    }
    unsubscribe(id);
    toast(t("Removed", "Dihapus"));
  };
  const [db, setDb] = useState<DbProfile | null>(null);
  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    void supabaseBrowser().then(async (sb) => {
      if (!sb) return;
      const { data } = await sb.from("profiles").select(PROFILE_COLUMNS).eq("id", accountId).maybeSingle();
      if (alive && data) setDb(data);
    });
    return () => {
      alive = false;
    };
  }, [accountId]);

  const savedPhone = account ? (db?.phone ?? "") : phone;
  const savedBank = account ? ((db?.payout_bank as PayoutBank | null) ?? null) : payoutBank;
  const savedNumber = account ? (db?.payout_number ?? "") : payoutNumber;
  const verified = account ? db?.kyc === "verified" : kycVerified;

  // Drafts are null until the field is touched, so what you see is whatever the
  // store holds, with no second copy to fall out of sync.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState<string | null>(null);
  const [bankDraft, setBankDraft] = useState<PayoutBank | null>(null);
  const [acctDraft, setAcctDraft] = useState<string | null>(null);
  const nameVal = nameDraft ?? (db?.full_name || user?.name || "");
  const phoneVal = phoneDraft ?? savedPhone;
  const bank = bankDraft ?? savedBank ?? "BCA";
  const acct = acctDraft ?? savedNumber;

  const saveRow = async (patch: Partial<DbProfile>) => {
    const { data, error } = await (await supabaseBrowser())!
      .from("profiles")
      .update(patch)
      .eq("id", account!.id)
      .select(PROFILE_COLUMNS)
      .maybeSingle();
    if (error || !data) {
      toast.error(t("Could not save. Try again.", "Gagal menyimpan. Coba lagi."));
      return null;
    }
    setDb(data);
    return data;
  };

  const savePersonal = async () => {
    if (!account) {
      setPhone(phoneVal);
      toast.success(t("Profile saved", "Profil disimpan"));
      return;
    }
    const saved = await saveRow({ full_name: nameVal.trim(), phone: phoneVal.trim() || null });
    if (!saved) return;
    setNameDraft(null);
    setPhoneDraft(null);
    useUser.getState().setAccount({ ...account, name: saved.full_name || account.name });
    toast.success(t("Profile saved", "Profil disimpan"));
  };

  // Set when the server asks for a fresh sign-in before the payout account may change.
  const [reauth, setReauth] = useState(false);
  const savePayout = async () => {
    if (!account) {
      setPayout(bank, acct);
      toast.success(t("Payout account saved", "Rekening disimpan"));
      return;
    }
    const number = payoutNumberOf(acct);
    if (!number) {
      toast.error(t("Account number: 6 to 20 digits.", "Nomor rekening: 6 sampai 20 angka."));
      return;
    }
    // Through the server, which wants a recent sign-in and emails the account (audit M7): the browser
    // can no longer write these two columns itself.
    const r = await fetch("/api/profile/payout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bank, number }),
    }).catch(() => null);
    const json = (r ? await r.json().catch(() => ({})) : {}) as { error?: string; error_en?: string; code?: string; payout_bank?: string | null; payout_number?: string | null };
    if (!r?.ok) {
      if (json.code === "reauth") setReauth(true);
      else toast.error(r ? routeErrorText(json, r.status) : t("Could not save. Try again.", "Gagal menyimpan. Coba lagi."));
      return;
    }
    setDb((d) => (d ? { ...d, payout_bank: json.payout_bank ?? bank, payout_number: json.payout_number ?? number } : d));
    setBankDraft(null);
    setAcctDraft(null);
    setReauth(false);
    toast.success(t("Payout account saved", "Rekening disimpan"));
  };

  // A sign-in older than FRESH_SIGN_IN_MINUTES cannot change the account: sign out, then back in by email.
  const signInAgain = async () => {
    await (await supabaseBrowser())?.auth.signOut();
    router.push("/login?next=/profile");
  };

  // A full screen tall until the browser has read who this is, like every guarded page: a short
  // "Loading..." here painted the footer mid-screen, which jumped away when the form came (CLS 0.62
  // on a throttled phone, UX review 5 Nov 2026).
  if (!mounted) return <PageGate />;

  if (!ready) return <PageGate />;

  return (
    <PageContainer width="app" className="flex flex-col gap-5">
      <h1 className="text-2xl md:text-3xl font-bold text-neutral-black">{t("Profile", "Profil")}</h1>

      {/* Personal details */}
      <Section title={t("Personal details", "Info pribadi")}>
        <div className="flex flex-col gap-4">
          {account ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-neutral-gray">{t("Name", "Nama")}</span>
              <input value={nameVal} onChange={(e) => setNameDraft(e.target.value)} maxLength={120} autoComplete="name" className="rounded-xl border border-lummy-500 px-4 py-3 text-sm text-neutral-black outline-none" />
            </label>
          ) : (
            <div>
              <span className="text-xs text-neutral-gray">{t("Name", "Nama")}</span>
              <div className="mt-1 px-4 py-3 rounded-xl bg-secondary-gray-soft text-sm text-neutral-black">{user?.name ?? "-"}</div>
            </div>
          )}
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
              <input value={phoneVal} onChange={(e) => setPhoneDraft(e.target.value)} inputMode="tel" placeholder="0812 3456 7890" className="w-full outline-none text-sm text-neutral-black" />
            </div>
          </label>
          <Button.Primary wrapperClass="w-fit" className="text-sm" onClick={() => void savePersonal()}>{t("Save", "Simpan")}</Button.Primary>
        </div>
      </Section>

      {/* Identity / PSrE. Only once e-signatures are contracted (FEATURES.eStamp): until then no
          provider stands behind it, and a one-click "verified" read as a feature that works. */}
      {FEATURES.eStamp && (
      <Section title={t("Identity verification", "Verifikasi identitas")}>
        {verified ? (
          <div className="flex items-center gap-3">
            <Badge.Base className="bg-secondary-green-soft text-secondary-green-dark text-sm inline-flex items-center gap-1"><BadgeCheck className="w-4 h-4" /> {t("Verified", "Terverifikasi")}</Badge.Base>
            {/* A sample persona verifies with one click, which no PSrE stands behind (lib/features.ts). */}
            <span className="text-sm text-neutral-gray">{t("via a licensed e-signature provider (PSrE)", "via PSrE berlisensi")}{!account && ` ${t("(sample)", "(contoh)")}`}</span>
          </div>
        ) : account ? (
          <p className="text-sm text-neutral-gray">
            {t(
              "A one-time check through a licensed e-signature provider (PSrE), so you can e-sign the letter of authorisation. That connection is not live yet, so accounts stay unverified for now.",
              "Verifikasi sekali lewat PSrE berlisensi, supaya kamu bisa tanda tangan surat kuasa secara elektronik. Sambungannya belum aktif, jadi akun untuk sementara belum terverifikasi."
            )}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-neutral-gray">
              {t(
                "A one-time check so you can e-sign the letter of authorisation. Your ID photo is processed by a licensed Indonesian e-signature provider (PSrE), Lummy never stores it.",
                "Verifikasi sekali supaya kamu bisa tanda tangan surat kuasa secara elektronik. Foto KTP diproses PSrE berlisensi, Lummy tidak pernah menyimpannya."
              )}
            </p>
            <Button.Primary wrapperClass="w-fit" className="text-sm flex items-center gap-2" onClick={() => { verifyKyc(); toast.success(t("Identity verified (demo)", "Identitas terverifikasi (demo)")); }}>
              <ShieldCheck className="w-4 h-4" /> {t("Verify identity", "Verifikasi identitas")}
            </Button.Primary>
          </div>
        )}
      </Section>
      )}

      {/* Alerts */}
      <Section title={t("Alerts & waitlist", "Notifikasi & waitlist")}>
        {/* Alerts go by email only (decided 23 Oct 2026, lib/features.ts): no WhatsApp, no Telegram. */}
        {!FEATURES.emails ? (
          <p data-alerts-soon className="text-sm text-neutral-gray mb-4">
            {t(
              `Coming soon: alerts by email to ${user?.email ?? "your sign-in address"}. Nothing is sent yet.`,
              `Segera: notifikasi lewat email ke ${user?.email ?? "alamat login-mu"}. Belum ada yang dikirim.`
            )}
          </p>
        ) : (
          <p className="text-sm text-neutral-gray mb-4">
            {!serverAlerts
              ? t("Sample persona: alerts are kept in this browser, and nothing is sent.", "Persona contoh: notifikasi tersimpan di browser ini, dan tidak ada yang dikirim.")
              : isDemoEmail(user?.email ?? "")
                ? // A demo address has no mailbox (lib/supabase/demo), so it is never written to.
                  t("Demo account: alerts are saved, but demo addresses never receive email.", "Akun demo: notifikasi tersimpan, tapi alamat demo tidak pernah menerima email.")
                : t(`Alerts go by email to ${user?.email}, your sign-in address.`, `Notifikasi dikirim lewat email ke ${user?.email}, alamat login-mu.`)}
          </p>
        )}
        <div className="text-xs text-neutral-gray mb-2">{t("Your subscriptions", "Langganan kamu")}</div>
        {remote.failed ? (
          <p className="text-sm text-neutral-gray">{t("Could not load your alerts. Reload to try again.", "Notifikasi gagal dimuat. Muat ulang untuk mencoba lagi.")}</p>
        ) : subs === null ? (
          <p className="text-sm text-neutral-gray">{t("Loading...", "Memuat...")}</p>
        ) : subs.length === 0 ? (
          <p className="text-sm text-neutral-gray">{t("Nothing yet. Join a waitlist or ask for alerts from an event page.", "Belum ada. Masuk waitlist atau minta dikabari dari halaman event.")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {subs.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-xl border border-neutral-light-gray-1">
                <div className="min-w-0">
                  <div className="text-sm text-neutral-black truncate">{s.eventTitle}</div>
                  <div className="text-xs text-neutral-gray flex items-center gap-1"><Bell className="w-3 h-3" /> {s.tierName ? t(`${s.tierName} waitlist`, `Waitlist ${s.tierName}`) : t("New ticket alerts", "Notifikasi tiket baru")}</div>
                </div>
                <button onClick={() => removeAlert(s.id)} className="text-neutral-gray hover:text-secondary-pink-dark cursor-pointer shrink-0"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Payout: every account can sell, so every customer has somewhere for the money to go. */}
      {user && !isStaff(user) && (
        <Section title={t("Payout account", "Rekening pencairan")}>
          <div className="flex flex-col gap-4">
            <div>
              <span className="text-xs text-neutral-gray">{t("Bank", "Bank")}</span>
              <div className="grid grid-cols-4 gap-2 mt-1.5">
                {BANKS.map((b) => (
                  <button key={b} onClick={() => setBankDraft(b)} className={`px-2 py-2 rounded-lg text-sm border cursor-pointer ${bank === b ? "bg-primary-navy text-white border-primary-navy" : "bg-neutral-white text-neutral-gray border-neutral-light-gray-1"}`}>{b}</button>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-neutral-gray">{t("Account number", "Nomor rekening")}</span>
              <div className="flex items-center gap-2 rounded-xl border border-lummy-500 px-4 py-3">
                <Building2 className="w-4 h-4 text-neutral-gray" />
                <input value={acct} onChange={(e) => setAcctDraft(e.target.value)} placeholder="1234567890" className="w-full outline-none text-sm text-neutral-black" />
              </div>
            </label>
            {savedBank && <p className="text-xs text-secondary-green-dark">{t("Saved", "Tersimpan")}: {savedBank} · {savedNumber}</p>}
            {!FEATURES.payouts && (
              <p data-payout-test className="text-xs text-neutral-gray">
                {t(
                  "Lummy is still in test mode, so no real money is paid out to this account yet.",
                  "Lummy masih mode uji, jadi belum ada uang sungguhan yang cair ke rekening ini."
                )}
              </p>
            )}
            {reauth && (
              <div data-payout-reauth className="rounded-xl bg-secondary-gray-soft px-4 py-3 text-xs text-neutral-black flex flex-col gap-2">
                <p>
                  {t(
                    `For your safety, the payout account can only be changed within ${FRESH_SIGN_IN_MINUTES} minutes of signing in. Sign in again by email, then save it.`,
                    `Demi keamanan, rekening hanya bisa diganti dalam ${FRESH_SIGN_IN_MINUTES} menit setelah masuk. Masuk ulang lewat email, lalu simpan lagi.`
                  )}
                </p>
                <Button.Ghost className="text-xs w-fit" onClick={() => void signInAgain()}>{t("Sign in again", "Masuk ulang")}</Button.Ghost>
              </div>
            )}
            <Button.Primary wrapperClass="w-fit" className="text-sm" onClick={() => void savePayout()}>{t("Save account", "Simpan rekening")}</Button.Primary>
          </div>
        </Section>
      )}
    </PageContainer>
  );
}
