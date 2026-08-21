import type { LucideIcon } from "lucide-react";
import { Card } from "./card";

// Ticket-shaped feature card (notch + dashed perforation) with a monochrome navy
// icon. That is the Lummy identity, as opposed to a generic card with rainbow icons.
export function TicketFeature({ Icon, title, body }: { Icon: LucideIcon; title: string; body: string }) {
  return (
    <Card.Ticket.Small className="w-full h-full" circleClass="bg-white -mr-[2px]">

      <div className="flex items-center gap-3 pb-3 border-b-2 border-dashed border-neutral-light-gray-1">
        <span className="w-11 h-11 rounded-xl bg-secondary-blue-soft text-lummy-500 grid place-items-center shrink-0">
          <Icon className="w-5 h-5" />
        </span>
        <h3 className="font-fredoka font-semibold text-neutral-black leading-snug">{title}</h3>
      </div>
      <p className="text-sm text-neutral-gray leading-relaxed">{body}</p>
    </Card.Ticket.Small>
  );
}
