"use client";

import Link from "next/link";
import { Logo } from "./Logo";
import { ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n";

const cols: { en: string; id: string; links: { en: string; id: string; href: string }[] }[] = [
  {
    en: "Product", id: "Produk",
    links: [
      { en: "Browse events", id: "Jelajah event", href: "/events" },
      { en: "Sell a ticket", id: "Jual tiket", href: "/sell" },
      { en: "How it works", id: "Cara kerja", href: "/how-it-works" },
    ],
  },
  {
    en: "Company", id: "Perusahaan",
    links: [
      { en: "About", id: "Tentang", href: "/about" },
      { en: "Careers", id: "Karier", href: "#" },
      { en: "Blog", id: "Blog", href: "#" },
    ],
  },
  {
    en: "Support", id: "Bantuan",
    links: [
      { en: "Help centre", id: "Pusat bantuan", href: "#" },
      { en: "Safety & escrow", id: "Keamanan & escrow", href: "#" },
      { en: "Privacy policy", id: "Kebijakan privasi", href: "#" },
    ],
  },
];

export function Footer() {
  const t = useT();
  return (
    <footer className="mt-24 border-t border-neutral-light-gray-1 bg-secondary-blue-extra">
      <div className="max-w-7xl mx-auto px-5 lg:px-10 py-14 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-3">
          <Logo />
          <p className="text-neutral-gray text-sm max-w-xs">
            {t(
              "Safe concert ticket resale, built for Indonesia. Money stays in escrow until the show is over and AI screens every ticket for forgery.",
              "Resale tiket konser yang aman untuk Indonesia. Dana dikunci sampai konser selesai dan AI menjaga dari tiket palsu."
            )}
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
          <span>© 2026 Lummy Ticket. {t("Prototype, sample data.", "Prototipe, data contoh.")}</span>
          <span>{t("Built for Indonesia.", "Dibangun untuk Indonesia.")}</span>
        </div>
      </div>
    </footer>
  );
}
