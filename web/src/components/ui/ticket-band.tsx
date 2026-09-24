import { cn } from "@/lib/utils";
import { Notch } from "./notch";

// Navy band shaped like a ticket: notches on both edges, dashed perforation frame.
// Ganti CTA gradient generik. `notchColor` = warna bg di belakang band (buat "gigitan"
// notch), default putih. The notches (10px radius) stay clear of the dashed frame
// (16px in), so the bite never cuts the frame line.
export function TicketBand({
  children,
  className,
  notchColor = "bg-white",
}: {
  children: React.ReactNode;
  className?: string;
  notchColor?: string;
}) {
  return (
    <div className={cn("relative rounded-3xl bg-primary-navy p-4", className)}>
      <Notch side="left" className={cn("w-5 h-5 -left-2.5 top-1/2 -translate-y-1/2", notchColor)} />
      <Notch side="right" className={cn("w-5 h-5 -right-2.5 top-1/2 -translate-y-1/2", notchColor)} />
      <div className="rounded-2xl border-2 border-dashed border-white/25 px-6 py-8 sm:px-8 text-white">
        {children}
      </div>
    </div>
  );
}
