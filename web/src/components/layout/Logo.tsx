import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

// The horizontal logo of the brand guideline 1.0 (docs/brand), drawn as vector with the wordmark
// outlined. public/assets/images/logo.png, the logo before it, stays for documents that link it.
export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} aria-label="Lummy" className={cn("flex items-center shrink-0", className)}>
      <Image
        src="/assets/brand/logo-horizontal.svg"
        alt="Lummy"
        width={500}
        height={120}
        priority
        className="h-8 w-auto"
      />
    </Link>
  );
}
