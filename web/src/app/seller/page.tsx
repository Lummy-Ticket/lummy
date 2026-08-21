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
  // Indonesian search query on purpose: that is how local fans post "want to buy".
  const q = encodeURIComponent(`wtb tiket ${listing.eventTitle}`);
  const searchLink = `https://x.com/search?q=${q}&f=live`;
  const listingLink = `https://lummy.id/events/${listing.eventId}`;
  // The caption stays in Indonesian: it gets pasted straight into local fan communities.
  const caption = `WTS tiket ${listing.eventTitle} (${listing.tierName}), aman via Lummy, dana di-escrow sampai konser selesai. Beli lewat link ya biar dilindungi 👇 ${listingLink}`;
  const copy = (t: string, m: string) => { navigator.clipboard?.writeText(t); toast.success(m); };

  return (
    <Modal open onClose={onClose} title="Promote this listing">
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-xs text-neutral-gray mb-1.5">Find buyers on X</div>
          <a href={searchLink} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 p-3 rounded-xl border border-lummy-500 hover:bg-secondary-blue-light transition text-sm text-primary-navy">
            <span className="flex items-center gap-2 min-w-0"><Search className="w-4 h-4 shrink-0" /> <span className="truncate">People searching for this ticket</span></span>
            <ExternalLink className="w-4 h-4 shrink-0" />
          </a>
        </div>
        <div>
          <div className="text-xs text-neutral-gray mb-1.5">Ready-made caption</div>
          <div className="p-3 rounded-xl bg-secondary-gray-soft text-sm text-neutral-black">{caption}</div>
          <button onClick={() => copy(caption, "Caption copied")} className="mt-2 flex items-center gap-1.5 text-sm text-primary-navy font-medium cursor-pointer"><Copy className="w-4 h-4" /> Copy caption</button>
        </div>
        <div>
          <div className="text-xs text-neutral-gray mb-1.5">Listing link</div>
          <div className="flex items-center gap-2 p-3 rounded-xl border border-neutral-light-gray-1">
            <span className="font-mono text-xs text-neutral-black truncate flex-1">{listingLink}</span>
            <button onClick={() => copy(listingLink, "Link copied")} className="text-primary-navy cursor-pointer"><Copy className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex items-start gap-2 text-xs text-neutral-gray bg-secondary-blue-extra rounded-xl p-3">
          <ShieldCheck className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
          <span>Remind buyers to <b className="text-neutral-black">purchase through this link</b>, that is what puts the money in escrow. Never take a direct bank transfer.</span>
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
        <h1 className="text-2xl md:text-3xl font-bold text-neutral-black">Seller dashboard</h1>
        <Link href="/sell"><Button.Primary className="flex items-center gap-2 text-sm"><Plus className="w-4 h-4" /> Sell a ticket</Button.Primary></Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label="Active listings" value={String(active.length)} />
        <Stat label="Sold" value={String(sold.length)} />
        <Stat label="Total views" value={String(views)} />
        <Stat label="Estimated payout" value={formatIDR(est)} />
      </div>

      <h3 className="font-fredoka font-semibold text-neutral-black mb-3">Your listings</h3>
      {!mounted ? (
        <p className="text-neutral-gray text-sm">Loading...</p>
      ) : (
        <div className="flex flex-col gap-3">
          {listings.map((l) => (
            <div key={l.id} className="bg-neutral-white rounded-2xl border border-neutral-light-gray-1 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-fredoka font-semibold text-neutral-black truncate">{l.eventTitle}</h4>
                  <Badge.Base className={`text-xs ${l.status === "active" ? "bg-secondary-green-soft text-secondary-green-dark" : l.status === "review" ? "bg-secondary-orange-soft text-secondary-orange-dark" : "bg-neutral-light-gray-2 text-neutral-gray"}`}>
                    {l.status === "active" ? "Active" : l.status === "review" ? "In review" : "Sold"}
                  </Badge.Base>
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
                    <Megaphone className="w-4 h-4" /> Promote
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
