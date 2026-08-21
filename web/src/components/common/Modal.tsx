"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export function Modal({
  open, onClose, title, children, className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const t = useT();
  // Escape closes the dialog, which is what people expect and what assistive
  // tech announces. Bound while open so background pages keep their own keys.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-neutral-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative bg-neutral-white rounded-3xl border border-lummy-500 shadow-lummy-lg w-full max-w-lg max-h-[90vh] overflow-y-auto",
          className
        )}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-light-gray-1 sticky top-0 bg-neutral-white rounded-t-3xl z-10">
            <h4 className="font-fredoka font-semibold text-neutral-black">{title}</h4>
            <button onClick={onClose} aria-label={t("Close", "Tutup")} className="text-neutral-gray hover:text-neutral-black cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
