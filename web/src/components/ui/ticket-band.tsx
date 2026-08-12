import { cn } from "@/lib/utils";

// Band navy berbentuk tiket (notch di kedua sisi + bingkai perforasi putus-putus).
// Ganti CTA gradient generik. `notchColor` = warna bg di belakang band (buat "gigitan"
// notch), default putih.
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
    <div className={cn("relative rounded-3xl bg-primary-navy overflow-hidden", className)}>
      <span aria-hidden className={cn("absolute -left-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full", notchColor)} />
      <span aria-hidden className={cn("absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full", notchColor)} />
      <div className="m-3 rounded-2xl border-2 border-dashed border-white/25 px-6 py-8 sm:px-8 text-white">
        {children}
      </div>
    </div>
  );
}
