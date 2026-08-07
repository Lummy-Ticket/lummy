"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/Logo";
import { useUser, type Role } from "@/lib/mock";

const ROLES: { role: Role; label: string; home: string }[] = [
  { role: "BUYER", label: "Pembeli", home: "/" },
  { role: "SELLER", label: "Penjual", home: "/seller" },
  { role: "ADMIN", label: "Admin", home: "/admin" },
];

export default function LoginPage() {
  const router = useRouter();
  const login = useUser((s) => s.login);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("BUYER");

  const submit = () => {
    login(role);
    toast.success("Berhasil masuk");
    router.push(ROLES.find((r) => r.role === role)!.home);
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-5 pt-20">
      <div className="w-full max-w-md bg-neutral-white rounded-3xl border border-lummy-500 shadow-lummy-lg p-8">
        <Logo className="mx-auto mb-6" />
        <h1 className="text-2xl font-bold text-neutral-black text-center">Masuk ke OperTix</h1>
        <p className="text-neutral-gray text-sm text-center mt-1">Cukup email, tanpa wallet, tanpa seed phrase.</p>

        <label className="flex flex-col gap-1.5 mt-6">
          <span className="text-xs text-neutral-gray">Email</span>
          <div className="flex items-center gap-2 rounded-xl border border-lummy-500 px-4 py-3">
            <Mail className="w-4 h-4 text-neutral-gray" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="kamu@email.com" className="w-full outline-none text-sm text-neutral-black" />
          </div>
        </label>

        <div className="mt-4">
          <span className="text-xs text-neutral-gray">Masuk sebagai (demo)</span>
          <div className="grid grid-cols-3 gap-2 mt-1.5">
            {ROLES.map((r) => (
              <button key={r.role} onClick={() => setRole(r.role)} className={`px-2 py-2 rounded-lg text-sm border cursor-pointer ${role === r.role ? "bg-primary-navy text-white border-primary-navy" : "bg-neutral-white text-neutral-gray border-neutral-light-gray-1"}`}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <Button.Primary wrapperClass="w-full mt-6" className="w-full" onClick={submit}>Masuk</Button.Primary>
      </div>
    </div>
  );
}
