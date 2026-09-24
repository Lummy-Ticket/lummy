"use client";

import Link from "next/link";
import { Logo } from "./Logo";
import { ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n";

// Only pages that exist. A footer full of "#" links reads as a template.
const cols: { en: string; id: string; links: { en: string; id: string; href: string }[] }[] = [
  {
    en: "Buy", id: "Beli",
    links: [
      { en: "Browse events", id: "Jelajah event", href: "/events" },
      { en: "My tickets", id: "Tiket saya", href: "/tickets" },
    ],
  },
  {
    en: "Sell", id: "Jual",
    links: [
      { en: "Sell a ticket", id: "Jual tiket", href: "/sell" },
      { en: "Seller dashboard", id: "Dasbor penjual", href: "/seller" },
    ],
  },
  {
    en: "Lummy", id: "Lummy",
    links: [
      { en: "How it works", id: "Cara kerja", href: "/how-it-works" },
      { en: "When something goes wrong", id: "Kalau ada masalah", href: "/how-it-works#coverage" },
      { en: "About", id: "Tentang", href: "/about" },
    ],
  },
];

export function Footer() {
  const t = useT();
  return (
    <footer className="mt-24 border-t border-neutral-light-gray-1 bg-secondary-blue-extra">
      <div className="max-w-7xl mx-auto px-5 lg:px-10 py-14 grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="col-span-2 md:col-span-1 flex flex-col gap-3">
          <Logo />
          <p className="text-neutral-gray text-sm max-w-xs">
            {t("Resale tickets, with the money held in escrow until the show is over.", "Tiket resale, dengan dana ditahan escrow sampai acara selesai.")}
          </p>
          <span className="mt-1 inline-flex items-center gap-2 text-sm text-primary-navy font-medium">
            <ShieldCheck className="w-4 h-4" /> {t("Guaranteed by code, not by promises.", "Dijamin kode, bukan janji.")}
          </span>
        </div>
        {cols.map((c) => (
          <div key={c.en} className="flex flex-col gap-3">
            <h6 className="font-fredoka font-semibold text-neutral-black text-base">{t(c.en, c.id)}</h6>
            {c.links.map((l) => (
              <Link key={l.en} href={l.href} className="text-neutral-gray text-sm hover:text-primary-navy transition">
                {t(l.en, l.id)}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-neutral-light-gray-1">
        <div className="max-w-7xl mx-auto px-5 lg:px-10 py-5 flex flex-col sm:flex-row justify-between gap-2 text-xs text-neutral-gray">
          <span>© 2026 Lummy Ticket · {t("Prototype with sample data", "Prototipe dengan data contoh")}</span>
          <span>{t("Built for Indonesia.", "Dibangun untuk Indonesia.")}</span>
        </div>
      </div>
    </footer>
  );
}
