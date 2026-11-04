"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export function Modal({
  open, onClose, title, label, children, className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** The dialog's name for a screen reader when it has no title. */
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const t = useT();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  // Focus moves into the dialog when it opens and back where it was when it closes, and Tab stays
  // inside it, so a keyboard or screen reader user is not left behind the backdrop (UX audit,
  // 4 Nov 2026: after Bayar, Tab reached the page's footer before the QRIS dialog).
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const focusables = () =>
      [...(panel.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])];
    (focusables()[0] ?? panel.current)?.focus();
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !panel.current) return;
      const list = focusables();
      if (!list.length) {
        e.preventDefault();
        panel.current.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!panel.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onTab);
    return () => {
      document.removeEventListener("keydown", onTab);
      before?.focus?.();
    };
  }, [open]);
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
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : label}
    >
      <div className="lm-backdrop absolute inset-0 bg-neutral-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panel}
        tabIndex={-1}
        className={cn(
          "outline-none",
          "lm-dialog relative bg-neutral-white rounded-3xl border border-lummy-500 shadow-lummy-lg w-full max-w-lg max-h-[90vh] overflow-y-auto",
          className
        )}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-light-gray-1 sticky top-0 bg-neutral-white rounded-t-3xl z-10">
            <h4 id={titleId} className="font-semibold text-neutral-black">{title}</h4>
            <button onClick={onClose} aria-label={t("Close", "Tutup")} className="text-neutral-gray hover:text-neutral-black hover:rotate-90 transition duration-300 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
