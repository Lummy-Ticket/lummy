import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

// Official Lummy wordmark, shared with the main Lummy app (public/assets/images/logo.png).
export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} aria-label="Lummy" className={cn("flex items-center shrink-0", className)}>
      <Image
        src="/assets/images/logo.png"
        alt="Lummy"
        width={1100}
        height={265}
        priority
        className="h-8 w-auto"
      />
    </Link>
  );
}
