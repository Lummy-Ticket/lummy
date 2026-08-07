import Link from "next/link";
import { Ticket } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 shrink-0", className)}>
      <span className="grid place-items-center w-9 h-9 rounded-xl bg-primary-navy text-white -rotate-6 shadow-lummy">
        <Ticket className="w-5 h-5" />
      </span>
      <span className="font-fredoka font-bold text-xl text-primary-navy tracking-tight leading-none">
        Oper<span className="text-secondary-pink-dark">Tix</span>
      </span>
    </Link>
  );
}
