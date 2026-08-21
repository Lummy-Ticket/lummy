"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Plus, Eye, Megaphone, Copy, ExternalLink, ShieldCheck, Search, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/common/Modal";
import { PageContainer } from "@/components/layout/PageContainer";
import {
  useSellerListings, sellerPenalty, SELLER_PENALTY_PCT, getEventById,
  EVENT_DURATION_H, DISPUTE_WINDOW_H, type SellerListing,
} from "@/lib/mock";
import { useAccessGuard } from "@/lib/access";
import { PageGate } from "@/components/layout/PageGate";
import { useT, useFormatters } from "@/lib/i18n";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-neutral-white rounded-2xl border border-neutral-light-gray-1 p-4">
      <div className="text-xs text-neutral-gray">{label}</div>
      <div className="font-fredoka font-bold text-xl text-neutral-black mt-1">{value}</div>
    </div>
  );
}

function PromoteModal({ listing, onClose }: { listing: SellerListing | null; onClose: () => void }) {
  const t = useT();
  if (!listing) return null;
  // Indonesian search query on purpose: that is how local fans post "want to buy".
  const q = encodeURIComponent(`wtb tiket ${listing.eventTitle}`);
  const searchLink = `https://x.com/search?q=${q}&f=live`;
  const listingLink = `https://lummy.id/events/${listing.eventId}`;
  // The caption stays in Indonesian: it gets pasted straight into local fan communities.
  const caption = `WTS tiket ${listing.eventTitle} (${listing.tierName}), aman via Lummy, dana di-escrow sampai konser selesai. Beli lewat link ya biar dilindungi 👇 ${listingLink}`;
  const copy = (t: string, m: string) => { navigator.clipboard?.writeText(t); toast.success(m); };

  return (
    <Modal open onClose={onClose} title={t("Promote this listing", "Promosikan listing")}>
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-xs text-neutral-gray mb-1.5">{t("Find buyers on X", "Cari calon pembeli di X")}</div>
          <a href={searchLink} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 p-3 rounded-xl border border-lummy-500 hover:bg-secondary-blue-light transition text-sm text-primary-navy">
            <span className="flex items-center gap-2 min-w-0"><Search className="w-4 h-4 shrink-0" /> <span className="truncate">{t("People searching for this ticket", "Orang yang lagi nyari tiket ini")}</span></span>
            <ExternalLink className="w-4 h-4 shrink-0" />
          </a>
        </div>
        <div>
          <div className="text-xs text-neutral-gray mb-1.5">{t("Ready-made caption", "Caption siap pakai")}</div>
          <div className="p-3 rounded-xl bg-secondary-gray-soft text-sm text-neutral-black">{caption}</div>
          <button onClick={() => copy(caption, t("Caption copied", "Caption disalin"))} className="mt-2 flex items-center gap-1.5 text-sm text-primary-navy font-medium cursor-pointer"><Copy className="w-4 h-4" /> {t("Copy caption", "Salin caption")}</button>
        </div>
        <div>
          <div className="text-xs text-neutral-gray mb-1.5">{t("Listing link", "Link listing")}</div>
          <div className="flex items-center gap-2 p-3 rounded-xl border border-neutral-light-gray-1">
            <span className="font-mono text-xs text-neutral-black truncate flex-1">{listingLink}</span>
            <button onClick={() => copy(listingLink, t("Link copied", "Link disalin"))} className="text-primary-navy cursor-pointer"><Copy className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex items-start gap-2 text-xs text-neutral-gray bg-secondary-blue-extra rounded-xl p-3">
          <ShieldCheck className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
          <span>{t("Remind buyers to purchase through this link, that is what puts the money in escrow. Never take a direct bank transfer.", "Ingatkan pembeli untuk beli lewat link ini, itu yang bikin dananya masuk escrow. Jangan pernah terima transfer langsung.")}</span>
        </div>
      </div>
    </Modal>
  );
}

export default function SellerPage() {
  const t = useT();
  const ready = useAccessGuard("account");
  const { formatIDR, formatEventDate } = useFormatters();
  const [mounted, setMounted] = useState(false);
  const listings = useSellerListings((s) => s.listings);
  const [promote, setPromote] = useState<SellerListing | null>(null);
  useEffect(() => setMounted(true), []);

  const active = listings.filter((l) => l.status === "active");
  const sold = listings.filter((l) => l.status === "sold");
  const views = listings.reduce((a, l) => a + l.views, 0);
  const est = active.reduce((a, l) => a + Math.round(l.askPrice * 0.95), 0);
  // What an upheld claim would cost across everything currently on sale.
  const atStake = active.reduce((a, l) => a + l.askPrice + sellerPenalty(l.askPrice), 0);

  // Payout timing is not a promise we make up: it is the escrow rule applied to
  // this listing's own event date.
  const payoutNote = (l: SellerListing) => {
    if (l.status !== "sold") return null;
    const ev = getEventById(l.eventId);
    if (!ev) return null;
    const due = new Date(new Date(ev.dateISO).getTime() + (EVENT_DURATION_H + DISPUTE_WINDOW_H) * 3_600_000);
    return due.getTime() < Date.now()
      ? t("Paid out", "Sudah cair")
      : t(`Pays out ${formatEventDate(due.toISOString())}`, `Cair ${formatEventDate(due.toISOString())}`);
  };

  if (!ready) return <PageGate />;

  return (
    <PageContainer width="app">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-neutral-black">{t("Seller dashboard", "Dasbor penjual")}</h1>
        <Link href="/sell"><Button.Primary className="flex items-center gap-2 text-sm"><Plus className="w-4 h-4" /> {t("Sell a ticket", "Jual tiket")}</Button.Primary></Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label={t("Active listings", "Listing aktif")} value={String(active.length)} />
        <Stat label={t("Sold", "Terjual")} value={String(sold.length)} />
        <Stat label={t("Total views", "Total dilihat")} value={String(views)} />
        <Stat label={t("Estimated payout", "Estimasi pendapatan")} value={formatIDR(est)} />
      </div>

      {/* The whole model rests on cheating costing more than it earns. That is
          only credible if a seller can see the number before they list. */}
      <div className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5 mb-8">
        <h3 className="font-fredoka font-semibold text-neutral-black flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-lummy-500" /> {t("Your standing", "Status kamu")}
        </h3>
        <div className="flex flex-wrap gap-x-8 gap-y-3 mt-3">
          <div>
            <div className="text-xs text-neutral-gray">{t("Upheld claims against you", "Klaim yang dikabulkan")}</div>
            <div className="font-fredoka font-bold text-xl text-secondary-green-dark">0</div>
          </div>
          <div>
            <div className="text-xs text-neutral-gray">{t("At stake if a ticket fails", "Risiko kalau tiket gagal")}</div>
            <div className="font-fredoka font-bold text-xl text-neutral-black">{formatIDR(atStake)}</div>
          </div>
        </div>
        <p className="text-xs text-neutral-gray mt-3 leading-relaxed">
          {t(
            `A ticket that fails costs you the sale plus a ${SELLER_PENALTY_PCT}% penalty, and repeat failures end the account. Since payout only lands after the show, selling the same ticket twice cannot pay off.`,
            `Tiket yang gagal bikin kamu kehilangan penjualannya plus penalti ${SELLER_PENALTY_PCT}%, dan kalau berulang akunnya ditutup. Karena pencairan baru cair setelah acara, menjual tiket yang sama dua kali tidak akan pernah untung.`
          )}
        </p>
      </div>

      <h3 className="font-fredoka font-semibold text-neutral-black mb-3">{t("Your listings", "Listing kamu")}</h3>
      {!mounted ? (
        <p className="text-neutral-gray text-sm">{t("Loading...", "Memuat...")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {listings.map((l) => (
            <div key={l.id} className="bg-neutral-white rounded-2xl border border-neutral-light-gray-1 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-fredoka font-semibold text-neutral-black truncate">{l.eventTitle}</h4>
                  <Badge.Base className={`text-xs ${l.status === "active" ? "bg-secondary-green-soft text-secondary-green-dark" : l.status === "review" ? "bg-secondary-orange-soft text-secondary-orange-dark" : l.status === "rejected" ? "bg-secondary-pink-soft text-secondary-pink-dark" : "bg-neutral-light-gray-2 text-neutral-gray"}`}>
                    {l.status === "active"
                      ? t("Active", "Aktif")
                      : l.status === "review"
                      ? t("In review", "Direview")
                      : l.status === "rejected"
                      ? t("Rejected", "Ditolak")
                      : t("Sold", "Terjual")}
                  </Badge.Base>
                </div>
                <div className="text-xs text-neutral-gray mt-1 flex items-center gap-3 flex-wrap">
                  <span>{l.tierName}</span>
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {l.views}</span>
                  {payoutNote(l) && (
                    <span className="flex items-center gap-1 text-lummy-500">
                      <Clock className="w-3 h-3" /> {payoutNote(l)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="font-fredoka font-bold text-lummy-500">{formatIDR(l.askPrice)}</span>
                {l.status === "active" && (
                  <button onClick={() => setPromote(l)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-lummy-500 text-lummy-500 text-sm hover:bg-secondary-blue-light transition cursor-pointer">
                    <Megaphone className="w-4 h-4" /> {t("Promote", "Promosikan")}
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
