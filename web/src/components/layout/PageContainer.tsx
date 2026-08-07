import { cn } from "@/lib/utils";

// Satu sumber konsistensi layout. Semua page pakai ini biar offset atas (di bawah
// navbar fixed h-20) + padding + max-width seragam. 3 lebar bergrup by tujuan:
//   wide  = browsing/landing (katalog, detail event)
//   app   = halaman task (tiket, dashboard, admin, profil, checkout)
//   form  = konten sempit fokus (wizard jual, cara kerja)
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
