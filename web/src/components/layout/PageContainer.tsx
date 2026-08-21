import { cn } from "@/lib/utils";

// Single source of layout truth. Every page uses it so the top offset (clearing
// the fixed h-20 navbar), padding, and max-width stay uniform. Three widths, grouped
// by purpose:
//   wide  = browsing and landing (catalogue, event detail)
//   app   = task pages (tickets, dashboard, admin, profile, checkout)
//   form  = narrow focused content (sell wizard, how it works)
const WIDTH = {
  wide: "max-w-7xl",
  app: "max-w-7xl",
  form: "max-w-3xl",
} as const;

export function PageContainer({
  width = "app",
  className,
  children,
}: {
  width?: keyof typeof WIDTH;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full px-5 lg:px-10 pt-28 pb-16", WIDTH[width], className)}>
      {children}
    </div>
  );
}
