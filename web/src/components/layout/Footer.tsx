import Link from "next/link";
import { Logo } from "./Logo";
import { ShieldCheck } from "lucide-react";

const cols: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Browse events", href: "/events" },
      { label: "Sell a ticket", href: "/sell" },
      { label: "How it works", href: "/how-it-works" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Careers", href: "#" },
      { label: "Blog", href: "#" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help centre", href: "#" },
      { label: "Safety & escrow", href: "#" },
      { label: "Privacy policy", href: "#" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-neutral-light-gray-1 bg-secondary-blue-extra">
      <div className="max-w-7xl mx-auto px-5 lg:px-10 py-14 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-3">
          <Logo />
          <p className="text-neutral-gray text-sm max-w-xs">
            Safe concert ticket resale, built for Indonesia. Money stays in escrow until the
            show is over and AI screens every ticket for forgery.
          </p>
          <span className="mt-1 inline-flex items-center gap-2 text-sm text-primary-navy font-medium">
            <ShieldCheck className="w-4 h-4" /> Guaranteed by code, not by promises.
          </span>
        </div>
        {cols.map((c) => (
          <div key={c.title} className="flex flex-col gap-3">
            <h6 className="font-fredoka font-semibold text-neutral-black text-base">{c.title}</h6>
            {c.links.map((l) => (
              <Link key={l.label} href={l.href} className="text-neutral-gray text-sm hover:text-primary-navy transition">
                {l.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-neutral-light-gray-1">
        <div className="max-w-7xl mx-auto px-5 lg:px-10 py-5 flex flex-col sm:flex-row justify-between gap-2 text-xs text-neutral-gray">
          <span>© 2026 Lummy Ticket. Prototype, sample data.</span>
          <span lang="id">Dibangun untuk Indonesia.</span>
        </div>
      </div>
    </footer>
  );
}
