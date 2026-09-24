"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useUser, type Role } from "@/lib/mock";
import { useT } from "@/lib/i18n";

const ROLES: { role: Role; en: string; id: string; home: string }[] = [
  { role: "BUYER", en: "Buyer", id: "Pembeli", home: "/" },
  { role: "SELLER", en: "Seller", id: "Penjual", home: "/seller" },
  { role: "ADMIN", en: "Admin", id: "Admin", home: "/admin" },
];

export default function LoginPage() {
  const t = useT();
  const router = useRouter();
  const login = useUser((s) => s.login);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("BUYER");

  const submit = () => {
    login(role);
    toast.success(t("Signed in", "Berhasil masuk"));
    router.push(ROLES.find((r) => r.role === role)!.home);
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-5 pt-28 pb-16">
      <div className="w-full max-w-md bg-neutral-white rounded-3xl border border-lummy-500 shadow-lummy-lg p-8">
        <Image src="/assets/images/mascot.png" alt="" width={418} height={401} className="w-[84px] h-auto mx-auto mb-4" priority />
        <h1 className="text-2xl font-bold text-neutral-black text-center">{t("Sign in to Lummy", "Masuk ke Lummy")}</h1>
        <p className="text-neutral-gray text-sm text-center mt-1">{t("Just an email. No wallet, no seed phrase.", "Cukup email. Tanpa wallet, tanpa seed phrase.")}</p>

        <label className="flex flex-col gap-1.5 mt-6">
          <span className="text-xs text-neutral-gray">Email</span>
          <div className="flex items-center gap-2 rounded-xl border border-lummy-500 px-4 py-3">
            <Mail className="w-4 h-4 text-neutral-gray" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="you@email.com" className="w-full outline-none text-sm text-neutral-black" />
          </div>
        </label>

        <div className="mt-4">
          <span className="text-xs text-neutral-gray">{t("Sign in as (demo)", "Masuk sebagai (demo)")}</span>
          <div className="grid grid-cols-3 gap-2 mt-1.5">
            {ROLES.map((r) => (
              <button key={r.role} onClick={() => setRole(r.role)} className={`px-2 py-2 rounded-lg text-sm border cursor-pointer ${role === r.role ? "bg-primary-navy text-white border-primary-navy" : "bg-neutral-white text-neutral-gray border-neutral-light-gray-1"}`}>
                {t(r.en, r.id)}
              </button>
            ))}
          </div>
        </div>

        <Button.Primary wrapperClass="w-full mt-6" className="w-full" onClick={submit}>{t("Sign in", "Masuk")}</Button.Primary>
      </div>
    </div>
  );
}
