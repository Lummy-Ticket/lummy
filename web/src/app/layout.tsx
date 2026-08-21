import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import DevPanel from "@/components/dev/DevPanel";

export const metadata: Metadata = {
  title: {
    default: "Lummy Ticket: safe concert ticket resale in Indonesia",
    template: "%s | Lummy",
  },
  description:
    "Escrow-backed resale marketplace for name-locked concert tickets in Indonesia. Buyer funds stay locked until the show is over, and AI screens every ticket for forgery and duplicate barcodes.",
  keywords: ["ticket resale", "concert tickets", "Indonesia", "escrow", "anti-scalping", "Lummy", "Lummy Ticket"],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="scroll-smooth">
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
