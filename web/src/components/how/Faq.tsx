"use client";

import { useId, useState } from "react";
import { Plus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type FaqItem = { Icon?: LucideIcon; q: string; a: string };

/**
 * Questions that open in place. Several can stay open at once, so people can compare
 * two cases side by side. Height eases through a grid row, so there is no measuring.
 */
export function Faq({ items, defaultOpen = -1 }: { items: FaqItem[]; defaultOpen?: number }) {
  const [open, setOpen] = useState<Set<number>>(() => new Set(defaultOpen >= 0 ? [defaultOpen] : []));
  const base = useId();
  const toggle = (i: number) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div data-reveal="stagger" className="flex flex-col divide-y divide-dashed divide-neutral-light-gray-1 border-y border-neutral-light-gray-1">
      {items.map((it, i) => {
        const isOpen = open.has(i);
        const id = `${base}-${i}`;
        return (
          <div key={it.q}>
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={id}
                onClick={() => toggle(i)}
                className="group w-full flex items-center gap-4 py-4 text-left cursor-pointer"
              >
                {it.Icon && (
                  <span
                    className={cn(
                      "w-9 h-9 rounded-lg grid place-items-center shrink-0 transition-colors",
                      isOpen ? "bg-primary-navy text-white" : "bg-secondary-blue-soft text-lummy-500 group-hover:bg-primary-sky"
                    )}
                  >
                    <it.Icon className="w-4 h-4" />
                  </span>
                )}
                <span className="flex-1 font-fredoka font-semibold text-neutral-black text-base md:text-lg">{it.q}</span>
                <span
                  className={cn(
                    "w-8 h-8 rounded-full border grid place-items-center shrink-0 transition duration-300",
                    isOpen ? "rotate-45 border-primary-navy text-primary-navy" : "border-neutral-light-gray-1 text-neutral-gray group-hover:border-primary-navy group-hover:text-primary-navy"
                  )}
                >
                  <Plus className="w-4 h-4" />
                </span>
              </button>
            </h3>
            <div
              id={id}
              inert={!isOpen}
              className={cn("grid transition-[grid-template-rows] duration-300", isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
            >
              <div className="overflow-hidden">
                <p className={cn("pb-5 text-neutral-gray leading-relaxed transition-opacity duration-300", it.Icon && "pl-[52px]", isOpen ? "opacity-100" : "opacity-0")}>
                  {it.a}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
