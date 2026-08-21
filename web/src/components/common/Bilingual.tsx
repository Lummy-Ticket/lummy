import { cn } from "@/lib/utils";

/**
 * Secondary Indonesian line under an English heading. The product is built for
 * Indonesia but reads English-first, so the local wording stays as support
 * rather than a full translation layer.
 */
export function SubId({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span lang="id" className={cn("block text-neutral-gray", className)}>
      {children}
    </span>
  );
}
