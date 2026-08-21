"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUser, type Role } from "@/lib/mock";
import { useHydrated } from "@/lib/access";
import { useT } from "@/lib/i18n";

const ROLES: { role: Role; en: string; id: string; home: string }[] = [
  { role: "BUYER", en: "Buyer", id: "Pembeli", home: "/" },
  { role: "SELLER", en: "Seller", id: "Penjual", home: "/seller" },
  { role: "ADMIN", en: "Admin", id: "Admin", home: "/admin" },
];

export default function DevPanel() {
  const t = useT();
  const mounted = useHydrated();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const user = useUser((s) => s.user);
  const switchPersona = useUser((s) => s.switchPersona);
  const login = useUser((s) => s.login);
  const logout = useUser((s) => s.logout);

  if (!mounted) return null;

  const reset = () => {
    localStorage.clear();
    window.location.reload();
  };

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open ? (
        <div className="w-64 rounded-2xl border border-lummy-500 bg-neutral-white shadow-lummy-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="font-fredoka font-semibold text-neutral-black flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-secondary-pink-dark" /> {t("Dev panel", "Panel dev")}
            </span>
            <button onClick={() => setOpen(false)} className="text-neutral-gray cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-neutral-gray mb-3">{t("Prototype mode. Every record here is sample data.", "Mode prototipe. Semua datanya contoh.")}</p>

          <div className="text-xs text-neutral-gray mb-1">{t("Persona", "Persona")}</div>
          <div className="grid grid-cols-3 gap-1 mb-3">
            {ROLES.map((r) => (
              <button
                key={r.role}
                onClick={() => { switchPersona(r.role); router.push(r.home); }}
                className={cn(
                  "px-2 py-1.5 rounded-lg text-xs border transition cursor-pointer",
                  user?.role === r.role
                    ? "bg-lummy-500 text-white border-lummy-500"
                    : "bg-neutral-white text-neutral-gray border-neutral-light-gray-1 hover:border-lummy-500"
                )}
              >
                {t(r.en, r.id)}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => (user ? logout() : login("BUYER"))}
              className="flex-1 px-2 py-1.5 rounded-lg text-xs border border-neutral-light-gray-1 text-neutral-gray hover:border-lummy-500 transition cursor-pointer"
            >
              {user ? t("Sign out", "Keluar") : t("Sign in", "Masuk")}
            </button>
            <button
              onClick={reset}
              className="flex-1 px-2 py-1.5 rounded-lg text-xs border border-neutral-light-gray-1 text-neutral-gray hover:border-lummy-500 transition cursor-pointer flex items-center justify-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> {t("Reset", "Reset")}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          aria-label={t("Dev panel", "Panel dev")}
          className="w-12 h-12 rounded-full bg-primary-navy text-white grid place-items-center shadow-lummy-lg hover:bg-primary-navy-dark transition cursor-pointer"
        >
          <FlaskConical className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
