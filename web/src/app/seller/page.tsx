"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Plus, Eye, Megaphone, Copy, ExternalLink, ShieldCheck, Search, Clock, Scale, Paperclip, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/common/Modal";
import { PageContainer } from "@/components/layout/PageContainer";
import {
  useSellerListings, useOrders, useUser, reasonMeta, mockSellerEvidence,
  sellerPenalty, SELLER_PENALTY_PCT,
  EVENT_DURATION_H, DISPUTE_WINDOW_H, type SellerListing, type Order, type DisputeEvidence,
} from "@/lib/mock";
import { useAccessGuard, useHydrated } from "@/lib/access";
import { PageGate } from "@/components/layout/PageGate";
import { useT, useFormatters, useActiveLang } from "@/lib/i18n";
import { useCatalogue } from "@/lib/catalogue";
import { orderAction, useAccountOrders } from "@/lib/orders/client";
import { listingAction, useAccountListings } from "@/lib/listings/client";
import { useRouter } from "next/navigation";

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

/**
 * Claims filed against this seller. Deciding on the buyer's word alone would
 * make a false claim cheap, so the seller answers here before staff rules.
 */
function ClaimsAgainstYou({ orders, onReply }: { orders: Order[]; onReply: (o: Order, note: string, file: DisputeEvidence | null) => Promise<void> }) {
  const t = useT();
  const { formatIDR, formatDateTime } = useFormatters();
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<DisputeEvidence | null>(null);
  const [sending, setSending] = useState(false);

  if (orders.length === 0) return null;

  const send = async (o: Order) => {
    setSending(true);
    try {
      await onReply(o, note, file);
      setOpenId(null); setNote(""); setFile(null);
      toast.success(t("Your answer was added to the claim", "Jawabanmu ditambahkan ke klaim"));
    } catch (e) {
      toast.error(`${t("Your answer was not sent", "Jawabanmu gagal dikirim")}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mb-8">
      <h3 className="font-fredoka font-semibold text-neutral-black flex items-center gap-2 mb-1">
        <Scale className="w-4 h-4 text-secondary-orange-dark" /> {t("Claims against you", "Klaim terhadap kamu")}
        <span className="text-neutral-gray font-normal text-sm">({orders.length})</span>
      </h3>
      <p className="text-sm text-neutral-gray mb-3">
        {t(
          "Nothing has been decided yet. Answer while the money is still held, because staff reads both sides before ruling.",
          "Belum ada yang diputuskan. Jawab selagi dananya masih ditahan, karena staf membaca kedua sisi sebelum memutus."
        )}
      </p>
      <div className="flex flex-col gap-3">
        {orders.map((o) => {
          const answered = (o.dispute?.replies ?? []).some((r) => r.fromSeller);
          return (
            <div key={o.id} data-claim={o.id} className="bg-neutral-white rounded-2xl border-2 border-secondary-orange-dark/40 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-fredoka font-semibold text-neutral-black truncate">{o.eventTitle}</h4>
                  <div className="text-xs text-secondary-orange-dark mt-1">
                    {t(reasonMeta(o.dispute!.reason).label.en, reasonMeta(o.dispute!.reason).label.id)}
                    <span className="text-neutral-gray"> · {formatDateTime(o.dispute!.openedAtISO)}</span>
                  </div>
                </div>
                <span className="font-fredoka font-bold text-lummy-500 text-nowrap">{formatIDR(o.amount)}</span>
              </div>

              {o.dispute?.note && (
                <p className="text-xs text-neutral-gray italic mt-2">&ldquo;{t(o.dispute.note.en, o.dispute.note.id)}&rdquo;</p>
              )}

              {answered ? (
                <p className="text-xs text-secondary-green-dark mt-3 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {t("Your answer is on file, waiting on staff", "Jawabanmu sudah masuk, menunggu staf")}
                </p>
              ) : openId === o.id ? (
                <div className="mt-3 flex flex-col gap-2">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder={t("What actually happened, in your words...", "Apa yang sebenarnya terjadi, menurut kamu...")}
                    className="w-full rounded-xl border border-neutral-light-gray-1 focus:border-lummy-500 px-3 py-2 text-sm outline-none resize-none"
                  />
                  <span className="text-xs text-neutral-gray">{t("Attach something, if you have it", "Lampirkan sesuatu, kalau ada")}</span>
                  {mockSellerEvidence(o).map((ev) => (
                    <button
                      key={ev.fileName}
                      onClick={() => setFile(ev)}
                      className={`w-full flex items-center gap-2 p-2.5 rounded-xl border text-left transition cursor-pointer ${file?.fileName === ev.fileName ? "border-lummy-500 bg-secondary-blue-light" : "border-dashed border-neutral-light-gray-1 hover:border-lummy-500"}`}
                    >
                      <Paperclip className="w-3.5 h-3.5 shrink-0 text-neutral-gray" />
                      <span className="text-xs font-mono truncate">{ev.fileName}</span>
                    </button>
                  ))}
                  <div className="flex gap-3 mt-2">
                    <Button.Primary className="text-sm" disabled={!note.trim() || sending} onClick={() => send(o)}>
                      {t("Send answer", "Kirim jawaban")}
                    </Button.Primary>
                    <Button.Ghost className="text-sm" onClick={() => { setOpenId(null); setNote(""); setFile(null); }}>
                      {t("Cancel", "Batal")}
                    </Button.Ghost>
                  </div>
                </div>
              ) : (
                <Button.Primary wrapperClass="mt-4" className="text-sm" onClick={() => setOpenId(o.id)}>
                  {t("Answer this claim", "Jawab klaim ini")}
                </Button.Primary>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SellerPage() {
  const t = useT();
  const catalogue = useCatalogue();
  const lang = useActiveLang();
  const ready = useAccessGuard("account");
  const { formatIDR, formatEventDate } = useFormatters();
  const user = useUser((s) => s.user);
  const account = !!user?.account;
  const sampleOrders = useOrders((s) => s.orders);
  const replyToDispute = useOrders((s) => s.replyToDispute);
  // An account's sales come from the database, where the seller is the account on the order.
  // A sample persona's claims land on the seller whose name is on the sale.
  const { orders: sales, refresh: refreshSales } = useAccountOrders(account && user ? { seller: user.id } : null);
  const mine = account ? sales ?? [] : sampleOrders.filter((o) => o.sellerName === user?.name);
  // One reading of the clock per render, so the same list cannot disagree with itself.
  const [now] = useState(() => Date.now());
  const claims = mine.filter((o) => o.escrowStatus === "DISPUTED");
  const reply = async (o: Order, note: string, file: DisputeEvidence | null) => {
    if (!account) return replyToDispute(o.id, { fromSeller: true, note: { en: note, id: note }, evidence: file ?? undefined });
    await orderAction(o.id, { action: "reply", note, evidence: file?.fileName });
    refreshSales();
  };
  const mounted = useHydrated();
  const router = useRouter();
  // An account's listings come from the database; a sample persona's from this browser.
  const sampleListings = useSellerListings((s) => s.listings);
  const { listings: accountListings, refresh: refreshListings } = useAccountListings(account && user ? { seller: user.id } : null);
  const listings = account ? accountListings ?? [] : sampleListings;
  const [promote, setPromote] = useState<SellerListing | null>(null);
  // Withdrawing takes a listing off sale for good, so it asks twice.
  const [confirmWithdraw, setConfirmWithdraw] = useState<string | null>(null);
  const withdraw = async (l: SellerListing) => {
    if (confirmWithdraw !== l.id) {
      setConfirmWithdraw(l.id);
      setTimeout(() => setConfirmWithdraw((c) => (c === l.id ? null : c)), 4000);
      return;
    }
    setConfirmWithdraw(null);
    try {
      await listingAction(l.id, "withdraw");
      toast.success(t("Listing withdrawn", "Listing ditarik"));
      refreshListings();
      router.refresh();
    } catch (e) {
      toast.error(`${t("Not withdrawn", "Gagal ditarik")}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const active = listings.filter((l) => l.status === "active");
  const sold = listings.filter((l) => l.status === "sold");
  const inReview = listings.filter((l) => l.status === "review");
  const views = listings.reduce((a, l) => a + l.views, 0);
  // Fees are paid by the buyer on top of the ticket (docs/09, decision E), so the seller
  // receives exactly what they asked.
  const est = active.reduce((a, l) => a + l.askPrice * l.quantity, 0);
  // What an upheld claim would cost across everything currently on sale.
  const atStake = active.reduce((a, l) => a + l.askPrice * l.quantity + sellerPenalty(l.askPrice * l.quantity), 0);
  const upheld = mine.filter((o) => o.dispute?.verdict && !o.dispute.verdict.toSeller).length;

  // Payout timing is not a promise we make up: an account's sale says what its escrow did, and
  // otherwise it is the escrow rule applied to this listing's own event date. A date in the past
  // only means the money is due, not that it has gone out.
  const payoutNote = (l: SellerListing) => {
    if (l.status !== "sold") return null;
    const its = account ? mine.filter((o) => o.listingId === l.id) : [];
    if (its.some((o) => o.escrowStatus === "DISPUTED")) return t("A claim is open", "Ada klaim terbuka");
    if (its.length && its.every((o) => o.escrowStatus === "REFUNDED")) return t("Refunded to the buyer", "Dikembalikan ke pembeli");
    if (its.length && its.every((o) => o.escrowStatus === "RELEASED")) return t("Paid out", "Sudah cair");
    const ev = catalogue.eventById(l.eventId);
    if (!ev) return null;
    const due = new Date(new Date(ev.dateISO).getTime() + (EVENT_DURATION_H + DISPUTE_WINDOW_H) * 3_600_000);
    return due.getTime() < now
      ? t("Due for payout", "Siap dicairkan")
      : t(`Pays out ${formatEventDate(due.toISOString())}`, `Cair ${formatEventDate(due.toISOString())}`);
  };

  if (!ready) return <PageGate />;

  return (
    <PageContainer width="app">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-neutral-black">{t("Seller dashboard", "Dasbor penjual")}</h1>
        <Link href="/sell"><Button.Primary className="flex items-center gap-2 text-sm"><Plus className="w-4 h-4" /> {t("Sell a ticket", "Jual tiket")}</Button.Primary></Link>
      </div>

      <div data-reveal="stagger" className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label={t("Active listings", "Listing aktif")} value={String(active.length)} />
        <Stat label={t("Sold", "Terjual")} value={String(sold.length)} />
        {/* Views are not counted for real listings yet, and a 0 would say nobody looked. */}
        {account ? (
          <Stat label={t("In review", "Direview")} value={String(inReview.length)} />
        ) : (
          <Stat label={t("Total views", "Total dilihat")} value={views.toLocaleString(lang === "id" ? "id-ID" : "en-US")} />
        )}
        <Stat label={t("If everything sells", "Kalau semua terjual")} value={formatIDR(est)} />
      </div>

      <ClaimsAgainstYou orders={claims} onReply={reply} />

      {/* The whole model rests on cheating costing more than it earns. That is
          only credible if a seller can see the number before they list. */}
      <div className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5 mb-8">
        <h3 className="font-fredoka font-semibold text-neutral-black flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-lummy-500" /> {t("Your standing", "Status kamu")}
        </h3>
        <div className="flex flex-wrap gap-x-8 gap-y-3 mt-3">
          <div>
            <div className="text-xs text-neutral-gray">{t("Claims upheld", "Klaim dikabulkan")}</div>
            <div className={`font-fredoka font-bold text-xl ${upheld ? "text-secondary-pink-dark" : "text-secondary-green-dark"}`}>{upheld}</div>
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
      {!mounted || (account && !accountListings) ? (
        <p className="text-neutral-gray text-sm">{t("Loading...", "Memuat...")}</p>
      ) : listings.length === 0 ? (
        <p className="text-neutral-gray text-sm">
          {t("Nothing listed yet.", "Belum ada listing.")}{" "}
          <Link href="/sell" className="text-primary-navy font-medium">{t("Sell your first ticket", "Jual tiket pertamamu")}</Link>
        </p>
      ) : (
        <div data-reveal="stagger" className="flex flex-col gap-3">
          {listings.map((l) => (
            <div key={l.id} data-listing={l.id} className="bg-neutral-white rounded-2xl border border-neutral-light-gray-1 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors duration-300 hover:border-lummy-500">
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
                  <span>{l.tierName}{l.quantity > 1 ? t(` · ${l.quantity} tickets`, ` · ${l.quantity} tiket`) : ""}</span>
                  {!account && <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {l.views}</span>}
                  {l.gateKtp && <span>{t("ID card staged for the gate", "KTP siap untuk gate")}</span>}
                  {payoutNote(l) && (
                    <span className="flex items-center gap-1 text-lummy-500">
                      <Clock className="w-3 h-3" /> {payoutNote(l)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="font-fredoka font-bold text-lummy-500 text-nowrap">{formatIDR(l.askPrice)}{l.quantity > 1 && <span className="text-xs text-neutral-gray font-sans font-normal"> {t("each", "/tiket")}</span>}</span>
                {l.status === "active" && (
                  <button onClick={() => setPromote(l)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-lummy-500 text-lummy-500 text-sm hover:bg-secondary-blue-light transition cursor-pointer">
                    <Megaphone className="w-4 h-4" /> {t("Promote", "Promosikan")}
                  </button>
                )}
                {account && (l.status === "active" || l.status === "review") && (
                  <button
                    onClick={() => void withdraw(l)}
                    className={`px-3 py-2 rounded-xl border text-sm transition cursor-pointer ${confirmWithdraw === l.id ? "border-secondary-pink-dark text-secondary-pink-dark bg-secondary-pink-light" : "border-neutral-light-gray-1 text-neutral-gray hover:border-secondary-pink-dark hover:text-secondary-pink-dark"}`}
                  >
                    {confirmWithdraw === l.id ? t("Sure? Withdraw", "Yakin? Tarik") : t("Withdraw", "Tarik")}
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
