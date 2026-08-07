"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Plus, Eye, Megaphone, Copy, ExternalLink, ShieldCheck, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/common/Modal";
import { PageContainer } from "@/components/layout/PageContainer";
import { useSellerListings, formatIDR, type SellerListing } from "@/lib/mock";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-neutral-white rounded-2xl border border-neutral-light-gray-1 p-4">
      <div className="text-xs text-neutral-gray">{label}</div>
      <div className="font-fredoka font-bold text-xl text-neutral-black mt-1">{value}</div>
    </div>
  );
}

function PromoteModal({ listing, onClose }: { listing: SellerListing | null; onClose: () => void }) {
  if (!listing) return null;
  const q = encodeURIComponent(`wtb tiket ${listing.eventTitle}`);
  const searchLink = `https://x.com/search?q=${q}&f=live`;
  const listingLink = `https://opertix.id/events/${listing.eventId}`;
  const caption = `WTS tiket ${listing.eventTitle} (${listing.tierName}), aman via OperTix, dana di-escrow sampai konser selesai. Beli lewat link ya biar dilindungi 👇 ${listingLink}`;
  const copy = (t: string, m: string) => { navigator.clipboard?.writeText(t); toast.success(m); };

  return (
    <Modal open onClose={onClose} title="Promosikan listing">
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-xs text-neutral-gray mb-1.5">Cari calon pembeli di X</div>
          <a href={searchLink} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 p-3 rounded-xl border border-lummy-500 hover:bg-secondary-blue-light transition text-sm text-primary-navy">
            <span className="flex items-center gap-2 min-w-0"><Search className="w-4 h-4 shrink-0" /> <span className="truncate">Orang yang lagi nyari tiket ini</span></span>
            <ExternalLink className="w-4 h-4 shrink-0" />
          </a>
        </div>
        <div>
          <div className="text-xs text-neutral-gray mb-1.5">Caption siap-pakai</div>
          <div className="p-3 rounded-xl bg-secondary-gray-soft text-sm text-neutral-black">{caption}</div>
          <button onClick={() => copy(caption, "Caption disalin")} className="mt-2 flex items-center gap-1.5 text-sm text-primary-navy font-medium cursor-pointer"><Copy className="w-4 h-4" /> Salin caption</button>
        </div>
        <div>
          <div className="text-xs text-neutral-gray mb-1.5">Link listing</div>
          <div className="flex items-center gap-2 p-3 rounded-xl border border-neutral-light-gray-1">
            <span className="font-mono text-xs text-neutral-black truncate flex-1">{listingLink}</span>
            <button onClick={() => copy(listingLink, "Link disalin")} className="text-primary-navy cursor-pointer"><Copy className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex items-start gap-2 text-xs text-neutral-gray bg-secondary-blue-extra rounded-xl p-3">
          <ShieldCheck className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
          <span>Ingetin pembeli: <b className="text-neutral-black">beli HARUS lewat link ini</b> biar dilindungi escrow. Jangan transfer manual.</span>
        </div>
      </div>
    </Modal>
  );
}

export default function SellerPage() {
  const [mounted, setMounted] = useState(false);
  const listings = useSellerListings((s) => s.listings);
  const [promote, setPromote] = useState<SellerListing | null>(null);
  useEffect(() => setMounted(true), []);

  const active = listings.filter((l) => l.status === "active");
  const sold = listings.filter((l) => l.status === "sold");
  const views = listings.reduce((a, l) => a + l.views, 0);
  const est = active.reduce((a, l) => a + Math.round(l.askPrice * 0.95), 0);

  return (
    <PageContainer width="app">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-neutral-black">Dashboard penjual</h1>
        <Link href="/sell"><Button.Primary className="flex items-center gap-2 text-sm"><Plus className="w-4 h-4" /> Jual tiket</Button.Primary></Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label="Listing aktif" value={String(active.length)} />
        <Stat label="Terjual" value={String(sold.length)} />
        <Stat label="Total dilihat" value={String(views)} />
        <Stat label="Estimasi pendapatan" value={formatIDR(est)} />
      </div>

      <h3 className="font-fredoka font-semibold text-neutral-black mb-3">Listing kamu</h3>
      {!mounted ? (
        <p className="text-neutral-gray text-sm">Memuat...</p>
      ) : (
        <div className="flex flex-col gap-3">
          {listings.map((l) => (
            <div key={l.id} className="bg-neutral-white rounded-2xl border border-neutral-light-gray-1 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-fredoka font-semibold text-neutral-black truncate">{l.eventTitle}</h4>
                  <Badge.Base className={l.status === "active" ? "bg-secondary-green-soft text-secondary-green-dark text-xs" : "bg-neutral-light-gray-2 text-neutral-gray text-xs"}>{l.status === "active" ? "Aktif" : "Terjual"}</Badge.Base>
                </div>
                <div className="text-xs text-neutral-gray mt-1 flex items-center gap-3">
                  <span>{l.tierName}</span>
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {l.views}</span>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="font-fredoka font-bold text-lummy-500">{formatIDR(l.askPrice)}</span>
                {l.status === "active" && (
                  <button onClick={() => setPromote(l)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-lummy-500 text-lummy-500 text-sm hover:bg-secondary-blue-light transition cursor-pointer">
                    <Megaphone className="w-4 h-4" /> Promosikan
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <PromoteModal listing={promote} onClose={() => setPromote(null)} />
    </PageContainer>
  );
}
