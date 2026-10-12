import type { Metadata } from "next";
import { Fredoka, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import DevPanel from "@/components/dev/DevPanel";
import { CatalogueProvider } from "@/lib/catalogue";
import { AuthSync } from "@/components/auth/AuthSync";
import { loadCatalogue } from "@/lib/supabase/catalogue";
import { MotionObserver } from "@/components/motion/MotionObserver";

// Self-hosted at build time: no request to Google on page load, no flash of the
// fallback font, and nothing to break on venue Wi-Fi. Fredoka carries the brand in
// headings, prices and buttons; Plus Jakarta Sans (an Indonesian typeface) keeps
// body copy readable at small sizes.
const fredoka = Fredoka({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-fredoka" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  title: {
    default: "Lummy Ticket: safe concert ticket resale in Indonesia",
    template: "%s | Lummy",
  },
  description:
    "Escrow-backed resale marketplace for name-locked concert tickets in Indonesia. Buyer funds stay locked until the show is over, and every ticket is checked for duplicate barcodes and signs of editing before it goes on sale.",
  keywords: ["ticket resale", "concert tickets", "Indonesia", "escrow", "anti-scalping", "Lummy", "Lummy Ticket"],
};

// Rendered per request, so no page ships a catalogue frozen at build time (checkout, sell
// and admin all read it). The catalogue itself is cached for 30 seconds, so this does not
// mean a database round trip per view. Not ISR: on Next 16.0.7 the router's prefetches of
// ISR pages stayed open in the browser (seen in demo-check), so pages never went idle.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const catalogue = await loadCatalogue();
  return (
    <html lang="en" className={`${fredoka.variable} ${jakarta.variable} scroll-smooth`}>
      <body className="antialiased min-h-screen flex flex-col relative w-full overflow-x-clip">
        <CatalogueProvider data={catalogue}>
          <AuthSync />
          <MotionObserver />
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
          <Toaster position="top-center" />
          <DevPanel />
        </CatalogueProvider>
      </body>
    </html>
  );
}
