"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Tombol dan popup dipakai bersama PriceFilter, supaya kontrol di satu toolbar seragam.
export const MENU_TRIGGER =
  "w-full h-12 flex items-center gap-2 pl-4 pr-3 rounded-xl border border-lummy-500 bg-neutral-white text-sm text-neutral-black cursor-pointer hover:bg-secondary-blue-light transition";
// Filter yang sedang dipakai memakai warna opsi terpilih di popup.
export const MENU_TRIGGER_ACTIVE = "bg-secondary-blue-soft hover:bg-secondary-blue-soft text-lummy-500 font-medium";
export const MENU_PANEL = "absolute z-40 mt-2 rounded-xl border-2 border-lummy-500 bg-neutral-white shadow-lummy-lg";

// Dropdown kustom (bukan native select), popup rapi, klik-luar nutup.
export function SelectMenu({
  value,
  options,
  onChange,
  icon,
  label = (v) => v,
  active = false,
  className,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  icon?: ReactNode;
  // Teks tampilan per opsi, misalnya untuk menerjemahkan "All cities".
  label?: (v: string) => string;
  // Tandai tombol saat filter ini sedang dipakai.
  active?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(MENU_TRIGGER, active && MENU_TRIGGER_ACTIVE)}
      >
        {icon}
        <span className="flex-1 text-left truncate">{label(value)}</span>
        <ChevronDown className={cn("w-4 h-4 text-neutral-gray shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div role="listbox" className={cn(MENU_PANEL, "min-w-full w-max max-w-[240px] overflow-hidden py-1")}>
          {options.map((opt) => {
            const active = opt === value;
            return (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => { onChange(opt); setOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-2 px-3.5 py-2.5 text-sm text-left transition cursor-pointer",
                  active ? "bg-secondary-blue-soft text-lummy-500 font-medium" : "text-neutral-gray hover:bg-secondary-blue-light"
                )}
              >
                <Check className={cn("w-3.5 h-3.5 shrink-0", active ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{label(opt)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
