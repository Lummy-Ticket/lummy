import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import DevPanel from "@/components/dev/DevPanel";

export const metadata: Metadata = {
  title: {
    default: "OperTix: resale tiket konser yang aman",
    template: "%s | OperTix",
  },
  description:
    "Marketplace resale tiket konser untuk Indonesia. Dana dikunci sampai konser selesai, AI jaga dari tiket palsu, anti-tipu.",
  keywords: ["resale tiket", "tiket konser", "Indonesia", "escrow", "anti-calo", "OperTix"],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className="scroll-smooth">
      <body className="antialiased min-h-screen flex flex-col relative w-full overflow-x-clip">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
        <Toaster position="top-center" />
        <DevPanel />
      </body>
    </html>
  );
}
