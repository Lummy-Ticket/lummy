"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  CheckCircle2, XCircle, AlertTriangle, Sparkles, Calendar, MapPin, Scale, Paperclip,
  ExternalLink, Gavel, Clock, Loader2, Ticket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/common/Modal";
import { useAccessGuard, useHydrated } from "@/lib/access";
import { PageGate } from "@/components/layout/PageGate";
import { useT, useFormatters, useCategoryLabel } from "@/lib/i18n";
import { PageContainer } from "@/components/layout/PageContainer";
import {
  useEventRequests, useOrders, useSellerListings, useUser,
  checkEvidence, reasonMeta, suggestedRationale, disputeDeadlineISO,
  remedyOptions, suggestedRemedy, sellerPenalty, SELLER_PENALTY_PCT, REMEDY_LABEL, partialAmount,
  type ChainSettlement, type EventRequest, type Order, type Remedy, type SellerListing,
} from "@/lib/mock";
import { chainAction } from "@/lib/chain/client";
import { useCatalogue } from "@/lib/catalogue";
import { orderAction, useAccountOrders } from "@/lib/orders/client";
import { SampleBadge } from "@/components/common/SampleBadge";

/**
 * What the buyer gets back on chain, in USDC units: the same share of the locked amount as the
 * verdict gives in rupiah. Zero pays the seller in full, which the contract records as Released.
 */
function onchainToBuyer(o: Order, remedy: Remedy): string {
  if (!o.chain || !o.dispute) return "0";
  const rupiah =
    remedy === "REFUND_FULL" || remedy === "REPLACEMENT" ? o.amount
    : remedy === "REFUND_PARTIAL" ? partialAmount(o, o.dispute.reason)
    : 0;
  return ((BigInt(o.chain.price) * BigInt(rupiah)) / BigInt(o.amount)).toString();
}

function EvidencePanel({ order }: { order: Order }) {
  const t = useT();
  const { formatDateTime } = useFormatters();
  const d = order.dispute!;
  const check = useMemo(() => checkEvidence(order, d.reason, d.evidence, d.openedAtISO), [order, d]);
  const deadline = disputeDeadlineISO(order);

  return (
    <div className="mt-3 rounded-2xl border border-neutral-light-gray-1 overflow-hidden">
      <div className="bg-secondary-orange-soft px-4 py-3">
        <div className="text-sm font-medium text-secondary-orange-dark flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {t(reasonMeta(d.reason).label.en, reasonMeta(d.reason).label.id)}
        </div>
        {d.note && <p className="text-xs text-secondary-orange-dark/85 mt-1 italic">&ldquo;{t(d.note.en, d.note.id)}&rdquo;</p>}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 text-xs text-neutral-black mb-2">
          <Paperclip className="w-3.5 h-3.5 text-neutral-gray shrink-0" />
          <span className="font-mono truncate">
            {d.evidence?.fileName ?? t("Settled from platform records", "Diputus dari catatan platform")}
          </span>
          <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${check.strength === "STRONG" ? "bg-secondary-green-soft text-secondary-green-dark" : "bg-secondary-pink-soft text-secondary-pink-dark"}`}>
            {check.strength}
          </span>
        </div>
        <div className="grid sm:grid-cols-2 gap-x-4">
          {check.checks.map((c) => (
            <div key={c.label.en} className="flex gap-2 py-1.5">
              {c.ok ? <CheckCircle2 className="w-4 h-4 text-secondary-green-dark shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-secondary-pink-dark shrink-0 mt-0.5" />}
              <div className="min-w-0">
                <div className="text-xs font-medium text-neutral-black">{t(c.label.en, c.label.id)}</div>
                <div className="text-xs text-neutral-gray">{t(c.detail.en, c.detail.id)}</div>
              </div>
            </div>
          ))}
        </div>
        {(d.replies ?? []).length > 0 && (
          <div className="mt-3 pt-3 border-t border-dashed border-neutral-light-gray-1 flex flex-col gap-2">
            {(d.replies ?? []).map((r, i) => (
              <div key={i} className="text-xs">
                <span className={`font-medium ${r.fromSeller ? "text-primary-navy" : "text-secondary-orange-dark"}`}>
                  {r.fromSeller ? t("Seller replied", "Penjual menjawab") : t("Buyer replied", "Pembeli menjawab")}
                </span>
                <span className="text-neutral-gray"> · {formatDateTime(r.atISO)}</span>
                <p className="text-neutral-gray italic mt-0.5">&ldquo;{t(r.note.en, r.note.id)}&rdquo;</p>
                {r.evidence && (
                  <span className="flex items-center gap-1.5 mt-1 font-mono text-neutral-black">
                    <Paperclip className="w-3 h-3 shrink-0" /> {r.evidence.fileName}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-dashed border-neutral-light-gray-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-gray">
          {d.evidence && <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {t("Captured", "Diambil")} {formatDateTime(d.evidence.capturedAtISO)}</span>}
          <span className="flex items-center gap-1.5"><Gavel className="w-3.5 h-3.5" /> {t("Filed", "Diajukan")} {formatDateTime(d.openedAtISO)}</span>
          {deadline && <span className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {t("Window closes", "Masa sengketa tutup")} {formatDateTime(deadline)}</span>}
        </div>
      </div>
    </div>
  );
}

function EmptyQueue({ text }: { text: string }) {
  return (
    <div className="bg-neutral-white rounded-3xl border border-dashed border-neutral-light-gray-1 p-10 text-center">
      <p className="text-neutral-gray text-sm">{text}</p>
    </div>
  );
}

/**
 * Listings the sell flow held back, either because the AI flagged the document
 * or because they were posted close to doors. The sell flow tells the seller
 * this queue exists, so it has to actually exist.
 */
function ListingQueue({
  held, onApprove, onReject,
}: {
  held: SellerListing[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const t = useT();
  const { formatIDR, formatEventDate } = useFormatters();
  const catalogue = useCatalogue();

  if (held.length === 0) {
    return <EmptyQueue text={t("Nothing held. Every listing cleared on its own.", "Tidak ada yang ditahan. Semua listing lolos sendiri.")} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-gray">
        {t(
          "These never went live. Clear one only after checking the document by hand: approving puts it in front of buyers.",
          "Semua ini belum pernah tayang. Loloskan hanya setelah dokumennya dicek manual: menyetujui berarti listing-nya tampil ke pembeli."
        )}
      </p>
      {held.map((l) => {
        const ev = catalogue.eventById(l.eventId);
        const risky = l.ai.pdfSuspicious || l.ai.forgeryScore >= 60;
        return (
          <div key={l.id} className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-fredoka font-semibold text-neutral-black truncate">{l.eventTitle}</h3>
                <div className="text-xs text-neutral-gray mt-1">
                  {ev ? formatEventDate(ev.dateISO) : ""} · {l.tierName} · {l.quantity}x
                </div>
              </div>
              <span className="font-fredoka font-bold text-lummy-500 text-nowrap">{formatIDR(l.askPrice)}</span>
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              {l.lateListing && (
                <Badge.Base className="bg-secondary-gold-soft text-secondary-brown-dark text-xs flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {t("Listed close to doors", "Dipasang mepet acara")}
                </Badge.Base>
              )}
              <Badge.Base className={`text-xs flex items-center gap-1 ${risky ? "bg-secondary-orange-soft text-secondary-orange-dark" : "bg-secondary-green-soft text-secondary-green-dark"}`}>
                {risky ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                {t("Forgery score", "Skor pemalsuan")} {l.ai.forgeryScore}/100
              </Badge.Base>
              {l.ai.pdfSuspicious && (
                <Badge.Base className="bg-secondary-orange-soft text-secondary-orange-dark text-xs">
                  {t("PDF structure suspicious", "Struktur PDF mencurigakan")}
                </Badge.Base>
              )}
            </div>

            <p className="text-xs text-neutral-gray mt-3">
              {l.lateListing && !risky
                ? t(
                    "Held on timing alone: the document reads clean, but last-minute listings are where duplicate-pass fraud concentrates.",
                    "Ditahan murni karena waktunya: dokumennya bersih, tapi listing menit terakhir adalah tempat penipuan tiket ganda menumpuk."
                  )
                : t(
                    "Held because the document itself looks off. Compare it against the organiser's original before clearing it.",
                    "Ditahan karena dokumennya sendiri mencurigakan. Bandingkan dengan versi asli organizer sebelum diloloskan."
                  )}
            </p>

            <div className="flex gap-3 mt-4">
              <Button.Primary
                className="flex items-center gap-2 text-sm"
                onClick={() => { onApprove(l.id); toast.success(t("Listing cleared, now live", "Listing lolos, sekarang tayang")); }}
              >
                <CheckCircle2 className="w-4 h-4" /> {t("Clear listing", "Loloskan listing")}
              </Button.Primary>
              <Button.Ghost tone="danger" className="text-sm" onClick={() => { onReject(l.id); toast(t("Listing rejected", "Listing ditolak")); }}>
                <XCircle className="w-4 h-4" /> {t("Reject", "Tolak")}
              </Button.Ghost>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminPage() {
  const t = useT();
  const ready = useAccessGuard("staff");
  const { formatIDR, formatEventDate } = useFormatters();
  const categoryLabel = useCategoryLabel();
  const mounted = useHydrated();
  const [confirmReq, setConfirmReq] = useState<EventRequest | null>(null);
  const requests = useEventRequests((s) => s.requests);
  const approve = useEventRequests((s) => s.approve);
  const reject = useEventRequests((s) => s.reject);
  const orders = useOrders((s) => s.orders);
  const resolveDispute = useOrders((s) => s.resolveDispute);
  const listings = useSellerListings((s) => s.listings);
  const approveListing = useSellerListings((s) => s.approve);
  const rejectListing = useSellerListings((s) => s.reject);
  const [tab, setTab] = useState<"claims" | "listings" | "events">("claims");
  // The order whose verdict is on its way, so the wait says what is actually happening.
  const [sending, setSending] = useState<Order | null>(null);

  // Staff signed in with an account rule on the claims in the database; a sample admin on the
  // sample orders in this browser.
  const account = useUser((s) => !!s.user?.account);
  const { orders: openClaims, error: claimsError, refresh: refreshClaims } = useAccountOrders(account ? { openClaims: true } : null);
  const disputes = account ? (openClaims ?? []).filter((o) => o.escrowStatus === "DISPUTED") : orders.filter((o) => o.escrowStatus === "DISPUTED");
  const held = listings.filter((l) => l.status === "review");
  const pendingEvents = requests.filter((r) => r.status === "pending");

  // Three queues, each with its own rhythm. Kept apart so a busy day in one
  // does not bury the others, and so a count is visible before opening any.
  const TABS = [
    { id: "claims" as const, en: "Claims", id_: "Klaim", Icon: Scale, count: disputes.length },
    { id: "listings" as const, en: "Listings held", id_: "Listing ditahan", Icon: Ticket, count: held.length },
    { id: "events" as const, en: "New events", id_: "Event baru", Icon: Calendar, count: pendingEvents.length },
  ];
  const doApprove = (r: EventRequest) => { approve(r.id); toast.success(t("Event approved, tickets can be listed", "Event disetujui, tiketnya boleh dijual")); };

  const toastVerdict = (remedy: Remedy) =>
    toast.success(
      remedy === "RELEASE_SELLER"
        ? t("Closed, funds released to the seller", "Ditutup, dana cair ke penjual")
        : t(`Upheld: ${REMEDY_LABEL[remedy].en.toLowerCase()}`, `Dikabulkan: ${REMEDY_LABEL[remedy].id.toLowerCase()}`)
    );

  const doResolve = async (o: Order, remedy: Remedy) => {
    // The server rules on an account's claim: it writes the rationale from the same evidence
    // checks and, on a chain order, has the contract split the money first.
    if (account) {
      setSending(o);
      try {
        await orderAction(o.id, { action: "verdict", remedy });
        toastVerdict(remedy);
      } catch (e) {
        toast.error(`${t("The verdict was not recorded", "Putusan gagal dicatat")}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setSending(null);
        refreshClaims();
      }
      return;
    }
    const check = checkEvidence(o, o.dispute!.reason, o.dispute!.evidence, o.dispute!.openedAtISO);
    const rationale =
      remedy === "RELEASE_SELLER" && check.strength === "STRONG"
        ? {
            en: "Arbiter overrode the automated read and released to the seller.",
            id: "Arbiter mengesampingkan pembacaan otomatis dan mencairkan ke penjual.",
          }
        : suggestedRationale(o.dispute!, check);
    // An on-chain order is only settled once the contract has carried the verdict out.
    let onchain: ChainSettlement | undefined;
    if (o.chain) {
      setSending(o);
      try {
        const toBuyer = onchainToBuyer(o, remedy);
        const r = await chainAction(o.chain.listingId, "resolve", toBuyer);
        onchain = { escrowStatus: toBuyer === "0" ? "RELEASED" : "REFUNDED", tx: r.tx, withdrawals: r.withdrawals };
      } catch (e) {
        toast.error(`${t("The contract refused the verdict", "Kontrak menolak putusan")}: ${e instanceof Error ? e.message : String(e)}`);
        return;
      } finally {
        setSending(null);
      }
    }
    resolveDispute(o.id, remedy, rationale, onchain);
    toastVerdict(remedy);
  };

  if (!ready) return <PageGate />;

  return (
    <PageContainer width="app">
      <h1 className="text-2xl md:text-3xl font-bold text-neutral-black">{t("Admin console", "Konsol admin")}</h1>
      <p className="text-neutral-gray text-sm mt-1">
        {t("Three queues: money in dispute, listings held back, and events waiting to open.",
           "Tiga antrian: dana yang disengketakan, listing yang ditahan, dan event yang menunggu dibuka.")}
      </p>

      <div className="flex flex-wrap gap-2 mt-5 mb-6">
        {TABS.map((x) => (
          <button
            key={x.id}
            onClick={() => setTab(x.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm border transition cursor-pointer active:scale-95 ${
              tab === x.id
                ? "bg-primary-navy text-white border-primary-navy"
                : "bg-neutral-white text-neutral-gray border-neutral-light-gray-1 hover:border-primary-navy"
            }`}
          >
            <x.Icon className="w-4 h-4" /> {t(x.en, x.id_)}
            {x.count > 0 && (
              <span className={`text-xs rounded-full px-1.5 ${tab === x.id ? "bg-white/20" : "bg-secondary-blue-soft text-lummy-500"}`}>
                {x.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Arbitration queue: refunds are decided here, never automatically */}
      {mounted && tab === "claims" && account && !openClaims && (
        claimsError ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-neutral-gray text-sm">{t("Claims could not be loaded. Check your connection.", "Klaim gagal dimuat. Cek koneksimu.")}</p>
            <Button.Ghost className="text-sm" onClick={refreshClaims}>{t("Try again", "Coba lagi")}</Button.Ghost>
          </div>
        ) : (
          <p className="text-neutral-gray text-sm">{t("Loading...", "Memuat...")}</p>
        )
      )}
      {mounted && tab === "claims" && (!account || openClaims) && disputes.length === 0 && (
        <EmptyQueue text={t("No claims open. Escrow is settling on its own.", "Tidak ada klaim terbuka. Escrow berjalan sendiri.")} />
      )}
      {mounted && tab === "claims" && disputes.length > 0 && (
        <div>
          <p className="text-sm text-neutral-gray mb-4">
            {t(
              "Refunds are not automatic. The seller wins by default unless gate-time evidence holds up. The checks below are signals, the call is yours.",
              "Refund tidak otomatis. Default-nya penjual menang, kecuali bukti dari gate kredibel. Pemeriksaan di bawah cuma sinyal, keputusan tetap di kamu."
            )}
          </p>
          <div data-reveal="stagger" className="flex flex-col gap-4">
            {disputes.map((o) => {
              const check = checkEvidence(o, o.dispute!.reason, o.dispute!.evidence, o.dispute!.openedAtISO);
              const suggested = suggestedRemedy(o, o.dispute!.reason, check);
              const penalty = sellerPenalty(o.amount);
              return (
                <div key={o.id} data-claim={o.id} className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-fredoka font-semibold text-neutral-black truncate">{o.eventTitle}</h3>
                      <div className="text-xs text-neutral-gray mt-1">
                        {formatEventDate(o.eventDateISO)} · {o.tierName} · {t("Seller", "Penjual")} {o.sellerName}
                      </div>
                    </div>
                    <span className="font-fredoka font-bold text-lummy-500 text-nowrap">{formatIDR(o.amount)}</span>
                  </div>

                  <EvidencePanel order={o} />

                  {!(o.dispute!.replies ?? []).some((r) => r.fromSeller) && (
                    <p className="text-xs text-secondary-brown-dark bg-secondary-gold-soft rounded-xl px-3 py-2 mt-3">
                      {t(
                        "The seller has not answered yet. You can still rule, but a decision reads better once both sides are on file.",
                        "Penjual belum menjawab. Kamu tetap boleh memutus, tapi putusannya lebih kuat kalau kedua sisi sudah masuk."
                      )}
                    </p>
                  )}
                  <p className="text-xs text-neutral-gray mt-3 flex gap-2">
                    <Gavel className="w-4 h-4 shrink-0 text-neutral-gray mt-0.5" />
                    <span>
                      {t("Suggested", "Saran")}: <b className="text-neutral-black">{t(REMEDY_LABEL[suggested].en.toLowerCase(), REMEDY_LABEL[suggested].id.toLowerCase())}</b>.{" "}
                      {t(suggestedRationale(o.dispute!, check).en, suggestedRationale(o.dispute!, check).id)}
                    </span>
                  </p>

                  {/* Remedy ladder: seat them, correct the price, refund, or pay the seller. */}
                  <div className="grid sm:grid-cols-2 gap-2 mt-4">
                    {remedyOptions(o, o.dispute!.reason).map((opt) => {
                      const isSuggested = opt.remedy === suggested;
                      const pays = opt.remedy !== "RELEASE_SELLER";
                      return (
                        <button
                          key={opt.remedy}
                          onClick={() => doResolve(o, opt.remedy)}
                          className={`text-left p-3 rounded-2xl border-2 transition cursor-pointer ${isSuggested ? "border-primary-navy bg-secondary-blue-light" : "border-neutral-light-gray-1 hover:border-primary-navy"}`}
                        >
                          <div className="flex items-center gap-2 text-sm font-medium text-neutral-black">
                            {pays ? <CheckCircle2 className="w-4 h-4 text-secondary-green-dark shrink-0" /> : <XCircle className="w-4 h-4 text-neutral-gray shrink-0" />}
                            {t(opt.label.en, opt.label.id)}
                            {opt.amount > 0 && <span className="ml-auto text-xs font-fredoka font-bold text-lummy-500">{formatIDR(opt.amount)}</span>}
                          </div>
                          <p className="text-xs text-neutral-gray mt-1">{t(opt.note.en, opt.note.id)}</p>
                        </button>
                      );
                    })}
                  </div>

                  <p className="text-xs text-neutral-gray mt-3">
                    {t(
                      `Anything other than paying the seller also charges them ${SELLER_PENALTY_PCT}% of the sale, ${formatIDR(penalty)}, on top of losing it. That is what makes a bad listing cost more than it earns.`,
                      `Selain mencairkan ke penjual, semua opsi juga membebani penjual ${SELLER_PENALTY_PCT}% dari nilai transaksi, ${formatIDR(penalty)}, di luar kehilangan penjualannya. Itu yang bikin listing bermasalah lebih mahal daripada hasilnya.`
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* These two queues still run on sample data; say so to staff signed in with an account. */}
      {account && tab !== "claims" && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-neutral-gray mb-4">
          <SampleBadge />
          {t("This queue is not in the database yet. Claims are.", "Antrean ini belum di database. Klaim sudah.")}
        </p>
      )}

      {mounted && tab === "listings" && (
        <ListingQueue held={held} onApprove={approveListing} onReject={rejectListing} />
      )}

      {tab === "events" && (
      <>
      <div className="flex items-start gap-2 text-sm text-neutral-gray bg-secondary-blue-extra rounded-2xl p-4 mb-6">
        <Sparkles className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
        <span>{t(
          "New events are verified before their tickets can be sold. AI pre-fills from the first seller's PDF. Face value is a pre-fill: check it against the official source before approving.",
          "Event baru diverifikasi sebelum tiketnya boleh dijual. AI mengisi awal dari PDF penjual pertama. Harga asli itu isian awal: cek ke sumber resmi sebelum menyetujui."
        )}</span>
      </div>

      {!mounted ? (
        <p className="text-neutral-gray text-sm">{t("Loading...", "Memuat...")}</p>
      ) : (
        <div data-reveal="stagger" className="flex flex-col gap-4">
          {requests.map((r) => (
            <div key={r.id} className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-fredoka font-semibold text-lg text-neutral-black">{r.title}</h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-gray mt-1">
                    <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-primary-navy" /> {formatEventDate(r.dateISO)}</span>
                    <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-primary-navy" /> {r.venue}, {r.city}</span>
                    <Badge.Base className="bg-secondary-blue-soft text-lummy-500 text-xs">{categoryLabel(r.category)}</Badge.Base>
                  </div>
                  <div className="text-xs text-neutral-gray mt-1">{t("Submitted by", "Diajukan oleh")} {r.submittedBy}</div>
                </div>
                {r.status !== "pending" && (
                  <Badge.Base className={r.status === "approved" ? "bg-secondary-green-soft text-secondary-green-dark text-xs" : "bg-secondary-pink-soft text-secondary-pink-dark text-xs"}>
                    {r.status === "approved" ? t("Approved", "Disetujui") : t("Rejected", "Ditolak")}
                  </Badge.Base>
                )}
              </div>

              <div className="mt-4 bg-secondary-gray-soft rounded-2xl p-4">
                <div className="text-xs text-neutral-gray mb-2">{t("Face value per tier", "Harga asli per tier")} <span className="text-neutral-black">{t("(verify against the organiser, not just the PDF)", "(cek ke organizer, jangan cuma dari PDF)")}</span></div>
                <div className="flex flex-wrap gap-2">
                  {r.faceValues.map((f) => {
                    const fromPdf = f.tier === r.pdfTier;
                    return (
                      <span key={f.tier} className={`text-sm rounded-lg px-3 py-1.5 flex items-center gap-1.5 ${fromPdf ? "bg-secondary-blue-soft border border-lummy-500 text-neutral-black" : "bg-neutral-white border border-neutral-light-gray-1 text-neutral-black"}`}>
                        {f.tier} <b className="text-lummy-500">{formatIDR(f.value)}</b>
                        {fromPdf && <span className="text-[10px] text-lummy-500 font-medium">{t("from PDF", "dari PDF")}</span>}
                      </span>
                    );
                  })}
                </div>
                <div className="text-xs text-neutral-gray mt-3 flex flex-wrap items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-lummy-500 shrink-0" />
                  {t("AI can only read", "AI cuma bisa membaca")} <b className="text-neutral-black">{t("one tier", "satu tier")}</b> {t("from the seller's PDF", "dari PDF penjual")} ({r.pdfTier}). {t("An admin fills in the rest from", "Sisanya dilengkapi admin dari")}
                  <a href={`https://${r.organizerRef}`} target="_blank" rel="noreferrer" className="text-primary-navy font-medium hover:opacity-80 inline-flex items-center gap-0.5">{r.organizerRef} <ExternalLink className="w-3 h-3" /></a>
                </div>
              </div>

              <div className={`mt-3 flex items-center gap-2 text-sm rounded-xl p-3 ${r.pdfSuspicious || r.forgeryScore >= 60 ? "bg-secondary-orange-soft text-secondary-orange-dark" : "bg-secondary-green-soft text-secondary-green-dark"}`}>
                {r.pdfSuspicious || r.forgeryScore >= 60 ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                {t("Forgery score", "Skor pemalsuan")} {r.forgeryScore}/100 {r.pdfSuspicious ? t("· PDF structure looks tampered with", "· struktur PDF mencurigakan") : t("· PDF is clean", "· PDF bersih")}
              </div>

              {r.status === "pending" && (
                // The recommended call is the raised button; the other one is still there, just quieter.
                <div className="flex flex-wrap gap-3 mt-4">
                  {r.pdfSuspicious || r.forgeryScore >= 60 ? (
                    <>
                      <Button.Primary className="flex items-center gap-2 text-sm" onClick={() => { reject(r.id); toast(t("Event rejected", "Event ditolak")); }}>
                        <XCircle className="w-4 h-4" /> {t("Reject", "Tolak")}
                      </Button.Primary>
                      <Button.Ghost tone="warning" className="text-sm" onClick={() => setConfirmReq(r)}>
                        <AlertTriangle className="w-4 h-4" /> {t("Approve anyway", "Tetap setujui")}
                      </Button.Ghost>
                    </>
                  ) : (
                    <>
                      <Button.Primary className="flex items-center gap-2 text-sm" onClick={() => doApprove(r)}>
                        <CheckCircle2 className="w-4 h-4" /> {t("Approve", "Setujui")}
                      </Button.Primary>
                      <Button.Ghost tone="danger" className="text-sm" onClick={() => { reject(r.id); toast(t("Event rejected", "Event ditolak")); }}>
                        <XCircle className="w-4 h-4" /> {t("Reject", "Tolak")}
                      </Button.Ghost>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      </>
      )}

      <Modal open={!!confirmReq} onClose={() => setConfirmReq(null)} title={t("Approve a flagged ticket?", "Setujui tiket ter-flag?")}>
        {confirmReq && (
          <>
            <p className="text-sm text-neutral-gray">
              <b className="text-neutral-black">{confirmReq.title}</b> {t("was flagged by AI", "kena flag AI")} ({t("score", "skor")} {confirmReq.forgeryScore}/100{confirmReq.pdfSuspicious ? t(", PDF structure looks tampered with", ", struktur PDF mencurigakan") : ""}).
              {t(" Approving lets this ticket be sold. Make sure you checked the document by hand.", " Menyetujui berarti tiket ini boleh dijual. Pastikan kamu sudah cek dokumennya manual.")}
            </p>
            <div className="flex gap-3 mt-5">
              <Button.Ghost className="flex-1 text-sm" onClick={() => setConfirmReq(null)}>{t("Cancel", "Batal")}</Button.Ghost>
              <Button.Primary wrapperClass="flex-1" className="w-full text-sm" onClick={() => { doApprove(confirmReq); setConfirmReq(null); }}>{t("Yes, approve", "Ya, setujui")}</Button.Primary>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!sending} onClose={() => {}}>
        <div className="flex flex-col items-center gap-3 py-4">
          <Loader2 className="w-8 h-8 text-lummy-500 animate-spin" />
          <p className="font-fredoka font-semibold text-neutral-black">
            {sending?.chain ? t("Sending the verdict to the contract...", "Mengirim putusan ke kontrak...") : t("Recording the verdict...", "Mencatat putusan...")}
          </p>
          <p className="text-sm text-neutral-gray text-center">
            {sending?.chain ? t("The contract splits the money, then pays each side.", "Kontrak membagi dananya, lalu mengirim ke tiap pihak.") : t("One moment.", "Sebentar.")}
          </p>
        </div>
      </Modal>
    </PageContainer>
  );
}
