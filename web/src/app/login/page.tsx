"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { AlertTriangle, Loader2, Mail, MailCheck } from "lucide-react";
import type { AuthError } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useUser, type Role } from "@/lib/mock";
import { useT } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { isDemoEmail } from "@/lib/supabase/demo";
import { supabasePublicEnv } from "@/lib/supabase/env";
import { safePath } from "@/lib/public-origin";

const ROLES: { role: Role; en: string; id: string; home: string }[] = [
  { role: "BUYER", en: "Buyer", id: "Pembeli", home: "/" },
  { role: "SELLER", en: "Seller", id: "Penjual", home: "/seller" },
  { role: "ADMIN", en: "Admin", id: "Admin", home: "/admin" },
];

function LoginInner() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const login = useUser((s) => s.login);
  // From the env, which the server and the browser see alike, so both render the same page.
  const accounts = !!supabasePublicEnv();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") === "link"
      ? t(
          "That sign-in link did not work. It may have expired, been used already, or been opened in another browser. Ask for a new one below.",
          "Link masuk itu tidak berlaku. Mungkin sudah kedaluwarsa, sudah dipakai, atau dibuka di browser lain. Minta link baru di bawah."
        )
      : null
  );
  const [role, setRole] = useState<Role>("BUYER");

  const explain = (e: AuthError) => {
    const msg = `${e.code ?? ""} ${e.message}`.toLowerCase();
    if (msg.includes("not authorized"))
      return t(
        "Sign-in emails are not open to everyone yet. You can explore with a sample account below.",
        "Email masuk belum dibuka untuk umum. Kamu bisa menjelajah dengan akun contoh di bawah."
      );
    if (e.status === 429 || msg.includes("rate limit"))
      return t("Too many sign-in emails just now. Try again in a few minutes.", "Terlalu banyak email masuk barusan. Coba lagi beberapa menit lagi.");
    return t("We could not send the email. Try again.", "Email gagal dikirim. Coba lagi.");
  };

  const sendLink = async () => {
    const address = email.trim();
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
      setError(t("Enter a valid email address.", "Masukkan alamat email yang benar."));
      return;
    }
    if (isDemoEmail(address)) {
      setError(t("Demo accounts open from the Dev Panel, not by email.", "Akun demo dibuka dari Dev Panel, bukan lewat email."));
      return;
    }
    const sb = supabaseBrowser();
    if (!sb) return;
    setSending(true);
    const next = safePath(params.get("next"));
    const { error: sendError } = await sb.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setSending(false);
    if (sendError) setError(explain(sendError));
    else setSentTo(address);
  };

  const sampleSignIn = () => {
    login(role);
    toast.success(t("Signed in with a sample account", "Masuk dengan akun contoh"));
    router.push(ROLES.find((r) => r.role === role)!.home);
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-5 pt-28 pb-16">
      <div className="w-full max-w-md bg-neutral-white rounded-3xl border border-lummy-500 shadow-lummy-lg p-8">
        <Image src="/assets/images/mascot.png" alt="" width={418} height={401} className="w-[84px] h-auto mx-auto mb-4" priority />
        <h1 className="text-2xl font-bold text-neutral-black text-center">{t("Sign in to Lummy", "Masuk ke Lummy")}</h1>
        <p className="text-neutral-gray text-sm text-center mt-1">{t("Just an email. No wallet, no seed phrase.", "Cukup email. Tanpa wallet, tanpa seed phrase.")}</p>

        {error && (
          <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl bg-secondary-orange-soft text-secondary-orange-dark text-sm p-3">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{error}</span>
          </div>
        )}

        {accounts &&
          (sentTo ? (
            <div className="mt-6 rounded-2xl bg-secondary-blue-extra p-5 text-center" data-login-state="sent">
              <MailCheck className="w-8 h-8 text-lummy-500 mx-auto" />
              <p className="font-fredoka font-semibold text-neutral-black mt-2">{t("Check your inbox", "Cek email kamu")}</p>
              <p className="text-sm text-neutral-gray mt-1">
                {t(
                  `We sent a sign-in link to ${sentTo}. Open it on this device, in this browser. It works once and expires in an hour.`,
                  `Link masuk sudah dikirim ke ${sentTo}. Buka di perangkat ini, di browser ini. Link hanya berlaku sekali dan kedaluwarsa dalam satu jam.`
                )}
              </p>
              <button onClick={() => { setSentTo(null); setEmail(""); }} className="mt-3 text-sm text-primary-navy font-medium cursor-pointer">
                {t("Use a different email", "Pakai email lain")}
              </button>
            </div>
          ) : (
            <form className="mt-6" noValidate onSubmit={(e) => { e.preventDefault(); void sendLink(); }}>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-neutral-gray">Email</span>
                <div className="flex items-center gap-2 rounded-xl border border-lummy-500 px-4 py-3">
                  <Mail className="w-4 h-4 text-neutral-gray" />
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="you@email.com" className="w-full outline-none text-sm text-neutral-black" />
                </div>
              </label>
              <Button.Primary type="submit" wrapperClass="w-full mt-4" className="w-full flex items-center justify-center gap-2" disabled={sending}>
                {sending && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("Email me a sign-in link", "Kirim link masuk ke email")}
              </Button.Primary>
            </form>
          ))}

        <div className={accounts ? "mt-8 pt-6 border-t border-dashed border-neutral-light-gray-1" : "mt-6"}>
          {accounts && (
            <>
              <p className="font-fredoka font-semibold text-neutral-black">{t("Just looking around?", "Cuma mau lihat-lihat?")}</p>
              <p className="text-xs text-neutral-gray mt-0.5">{t("Explore with a sample account. Nothing is saved to a real account.", "Jelajahi dengan akun contoh. Tidak ada yang tersimpan ke akun sungguhan.")}</p>
            </>
          )}
          <span className="block text-xs text-neutral-gray mt-3">{t("Sample account", "Akun contoh")}</span>
          <div className="grid grid-cols-3 gap-2 mt-1.5">
            {ROLES.map((r) => (
              <button key={r.role} type="button" onClick={() => setRole(r.role)} className={`px-2 py-2 rounded-lg text-sm border cursor-pointer ${role === r.role ? "bg-primary-navy text-white border-primary-navy" : "bg-neutral-white text-neutral-gray border-neutral-light-gray-1"}`}>
                {t(r.en, r.id)}
              </button>
            ))}
          </div>
          {accounts ? (
            <Button.Ghost className="w-full mt-4 text-sm" onClick={sampleSignIn}>{t("Continue with a sample account", "Lanjut dengan akun contoh")}</Button.Ghost>
          ) : (
            <Button.Primary wrapperClass="w-full mt-6" className="w-full" onClick={sampleSignIn}>{t("Sign in", "Masuk")}</Button.Primary>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
