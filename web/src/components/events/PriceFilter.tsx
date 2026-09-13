"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { DualRangeSlider } from "@/components/ui/dual-range-slider";
import { MENU_PANEL, MENU_TRIGGER, MENU_TRIGGER_ACTIVE } from "@/components/ui/select-menu";
import { useActiveLang, useFormatters, useT } from "@/lib/i18n";

// Price as a dropdown that looks like the city menu, so the toolbar stays one row
// of equal controls. The slider lives in the panel instead of taking a row of its own.
export function PriceFilter({
  min,
  max,
  step,
  value,
  onChange,
  className,
}: {
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  className?: string;
}) {
  const t = useT();
  const lang = useActiveLang();
  const { formatIDR } = useFormatters();
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

  // Short amounts fit the trigger on a phone: 500K and 1.4M, or 500 rb and 1,4 jt.
  const short = useMemo(() => {
    const f = new Intl.NumberFormat(lang === "id" ? "id-ID" : "en-US", { notation: "compact", maximumFractionDigits: 1 });
    return (n: number) => f.format(n);
  }, [lang]);

  const [lo, hi] = value;
  const active = lo > min || hi < max;
  const summary = !active
    ? t("Any price", "Semua harga")
    : lo === min
      ? t(`Up to ${short(hi)}`, `Sampai ${short(hi)}`)
      : hi === max
        ? t(`From ${short(lo)}`, `Mulai ${short(lo)}`)
        : `${short(lo)} - ${short(hi)}`;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(MENU_TRIGGER, active && MENU_TRIGGER_ACTIVE)}
      >
        <Tag className="w-4 h-4 text-neutral-gray shrink-0" />
        <span className="flex-1 text-left truncate">{summary}</span>
        <ChevronDown className={cn("w-4 h-4 text-neutral-gray shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t("Price range", "Rentang harga")}
          className={cn(MENU_PANEL, "right-0 w-72 max-w-[calc(100vw-2.5rem)] p-4")}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-neutral-black">{t("Price range", "Rentang harga")}</span>
            {active && (
              <button
                type="button"
                onClick={() => onChange([min, max])}
                className="text-xs font-medium text-lummy-500 hover:underline cursor-pointer"
              >
                {t("Reset", "Reset")}
              </button>
            )}
          </div>
          <p className="text-xs text-neutral-gray mt-0.5">{t("Cheapest resale ticket per event", "Tiket resale termurah per event")}</p>

          <DualRangeSlider
            className="mt-5"
            min={min}
            max={max}
            step={step}
            valueMin={lo}
            valueMax={hi}
            onChange={(a, b) => onChange([a, b])}
          />

          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className="rounded-lg bg-secondary-blue-light px-3 py-2">
              <div className="text-[11px] text-neutral-gray">{t("Min", "Min")}</div>
              <div className="text-sm font-medium text-neutral-black">{formatIDR(lo)}</div>
            </div>
            <div className="rounded-lg bg-secondary-blue-light px-3 py-2 text-right">
              <div className="text-[11px] text-neutral-gray">{t("Max", "Maks")}</div>
              <div className="text-sm font-medium text-neutral-black">{formatIDR(hi)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
