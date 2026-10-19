import type { LucideIcon } from "lucide-react";
import { Notch } from "./notch";

// Ticket-shaped feature card with a monochrome navy icon: header, perforation, body.
// The notches sit on both ends of the perforation, where a real ticket tears.
// `notchBg` is whatever sits behind the card (white on every page that uses it today).
export function TicketFeature({ Icon, title, body, notchBg = "bg-neutral-white" }: { Icon: LucideIcon; title: string; body: string; notchBg?: string }) {
  const notch = `w-6 h-6 border border-primary-navy ${notchBg}`;
  return (
    <div className="relative h-full rounded-3xl border border-primary-navy bg-neutral-white">
      <div className="flex items-center gap-3 px-6 pt-6 pb-4">
        <span className="w-11 h-11 rounded-xl bg-secondary-blue-soft text-lummy-500 grid place-items-center shrink-0">
          <Icon className="w-5 h-5" />
        </span>
        <h3 className="font-semibold text-neutral-black leading-snug">{title}</h3>
      </div>
      {/* Card edge sits 24px (mx-6) + 1px (border) outside this line; the notch centres on it */}
      <div aria-hidden className="relative mx-6 border-t-2 border-dashed border-neutral-light-gray-1">
        <Notch side="left" className={`${notch} -left-[37px] -top-[11px]`} />
        <Notch side="right" className={`${notch} -right-[37px] -top-[11px]`} />
      </div>
      <p className="px-6 pt-4 pb-6 text-sm text-neutral-gray leading-relaxed">{body}</p>
    </div>
  );
}
