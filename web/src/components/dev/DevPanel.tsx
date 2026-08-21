"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUser, type Role } from "@/lib/mock";

const ROLES: { role: Role; label: string; home: string }[] = [
  { role: "BUYER", label: "Buyer", home: "/" },
  { role: "SELLER", label: "Seller", home: "/seller" },
  { role: "ADMIN", label: "Admin", home: "/admin" },
];

export default function DevPanel() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const user = useUser((s) => s.user);
  const switchPersona = useUser((s) => s.switchPersona);
  const login = useUser((s) => s.login);
  const logout = useUser((s) => s.logout);

  useEffect(() => setMounted(true), []);
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
              <FlaskConical className="w-4 h-4 text-secondary-pink-dark" /> Dev Panel
            </span>
            <button onClick={() => setOpen(false)} className="text-neutral-gray cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-neutral-gray mb-3">Prototype mode. Every record here is sample data.</p>

          <div className="text-xs text-neutral-gray mb-1">Persona</div>
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
                {r.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => (user ? logout() : login("BUYER"))}
              className="flex-1 px-2 py-1.5 rounded-lg text-xs border border-neutral-light-gray-1 text-neutral-gray hover:border-lummy-500 transition cursor-pointer"
            >
              {user ? "Sign out" : "Sign in"}
            </button>
            <button
              onClick={reset}
              className="flex-1 px-2 py-1.5 rounded-lg text-xs border border-neutral-light-gray-1 text-neutral-gray hover:border-lummy-500 transition cursor-pointer flex items-center justify-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          aria-label="Dev panel"
          className="w-12 h-12 rounded-full bg-primary-navy text-white grid place-items-center shadow-lummy-lg hover:bg-primary-navy-dark transition cursor-pointer"
        >
          <FlaskConical className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
