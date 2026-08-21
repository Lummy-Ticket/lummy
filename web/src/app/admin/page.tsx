"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  CheckCircle2, XCircle, AlertTriangle, Sparkles, Calendar, MapPin, Scale, Paperclip,
  ExternalLink, Gavel, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/common/Modal";
import { useAccessGuard } from "@/lib/access";
import { PageGate } from "@/components/layout/PageGate";
import { useT, useFormatters, useCategoryLabel } from "@/lib/i18n";
import { PageContainer } from "@/components/layout/PageContainer";
import {
  useEventRequests, useOrders, useSellerListings, getEventById,
  checkEvidence, reasonMeta, suggestedRationale, disputeDeadlineISO,
  remedyOptions, suggestedRemedy, sellerPenalty, SELLER_PENALTY_PCT, REMEDY_LABEL,
  type EventRequest, type Order, type Remedy, type SellerListing,
} from "@/lib/mock";
import { Ticket, Scale as ScaleIcon } from "lucide-react";

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
        const ev = getEventById(l.eventId);
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
              <button
                onClick={() => { onReject(l.id); toast(t("Listing rejected", "Listing ditolak")); }}
                className="flex items-center gap-2 px-4 py-3 rounded-2xl border-2 border-neutral-light-gray-1 text-neutral-gray text-sm hover:border-secondary-pink-dark hover:text-secondary-pink-dark transition cursor-pointer"
              >
                <XCircle className="w-4 h-4" /> {t("Reject", "Tolak")}
              </button>
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
  const [mounted, setMounted] = useState(false);
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
  useEffect(() => setMounted(true), []);

  const disputes = orders.filter((o) => o.escrowStatus === "DISPUTED");
  const held = listings.filter((l) => l.status === "review");
  const pendingEvents = requests.filter((r) => r.status === "pending");

  // Three queues, each with its own rhythm. Kept apart so a busy day in one
  // does not bury the others, and so a count is visible before opening any.
  const TABS = [
    { id: "claims" as const, en: "Claims", id_: "Klaim", Icon: ScaleIcon, count: disputes.length },
    { id: "listings" as const, en: "Listings held", id_: "Listing ditahan", Icon: Ticket, count: held.length },
    { id: "events" as const, en: "New events", id_: "Event baru", Icon: Calendar, count: pendingEvents.length },
  ];
  const doApprove = (r: EventRequest) => { approve(r.id); toast.success(t("Event approved, tickets can be listed", "Event disetujui, tiketnya boleh dijual")); };

  const doResolve = (o: Order, remedy: Remedy) => {
    const check = checkEvidence(o, o.dispute!.reason, o.dispute!.evidence, o.dispute!.openedAtISO);
    const rationale =
      remedy === "RELEASE_SELLER" && check.strength === "STRONG"
        ? {
            en: "Arbiter overrode the automated read and released to the seller.",
            id: "Arbiter mengesampingkan pembacaan otomatis dan mencairkan ke penjual.",
          }
        : suggestedRationale(o.dispute!, check);
    resolveDispute(o.id, remedy, rationale);
    toast.success(
      remedy === "RELEASE_SELLER"
        ? t("Closed, funds released to the seller", "Ditutup, dana cair ke penjual")
        : t(`Upheld: ${REMEDY_LABEL[remedy].en.toLowerCase()}`, `Dikabulkan: ${REMEDY_LABEL[remedy].id.toLowerCase()}`)
    );
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
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm border transition cursor-pointer ${
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
      {mounted && tab === "claims" && disputes.length === 0 && (
        <EmptyQueue text={t("No claims open. Escrow is settling on its own.", "Tidak ada klaim terbuka. Escrow berjalan sendiri.")} />
      )}
      {mounted && tab === "claims" && disputes.length > 0 && (
        <div className="mt-6">
          <h2 className="font-fredoka font-bold text-xl text-neutral-black flex items-center gap-2">
            <Scale className="w-5 h-5 text-secondary-orange-dark" /> {t("Arbitration", "Arbitrase")}
            <span className="text-neutral-gray font-normal text-base">({disputes.length})</span>
          </h2>
          <p className="text-sm text-neutral-gray mt-1 mb-4">
            {t(
              "Refunds are not automatic. The seller wins by default unless gate-time evidence holds up. The checks below are signals, the call is yours.",
              "Refund tidak otomatis. Default-nya penjual menang, kecuali bukti dari gate kredibel. Pemeriksaan di bawah cuma sinyal, keputusan tetap di kamu."
            )}
          </p>
          <div className="flex flex-col gap-4">
            {disputes.map((o) => {
              const check = checkEvidence(o, o.dispute!.reason, o.dispute!.evidence, o.dispute!.openedAtISO);
              const suggested = suggestedRemedy(o, o.dispute!.reason, check);
              const penalty = sellerPenalty(o.amount);
              return (
                <div key={o.id} className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5">
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

      {mounted && tab === "listings" && (
        <ListingQueue held={held} onApprove={approveListing} onReject={rejectListing} />
      )}

      {tab === "events" && (
      <>
      <h2 className="font-fredoka font-bold text-xl text-neutral-black">{t("Event approvals", "Persetujuan event")}</h2>
      <div className="flex items-start gap-2 text-sm text-neutral-gray bg-secondary-blue-extra rounded-2xl p-4 mt-3 mb-8">
        <Sparkles className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
        <span>{t(
          "New events are verified before their tickets can be sold. AI pre-fills from the first seller's PDF. Face value is a pre-fill: check it against the official source before approving.",
          "Event baru diverifikasi sebelum tiketnya boleh dijual. AI mengisi awal dari PDF penjual pertama. Harga asli itu isian awal: cek ke sumber resmi sebelum menyetujui."
        )}</span>
      </div>

      {!mounted ? (
        <p className="text-neutral-gray text-sm">{t("Loading...", "Memuat...")}</p>
      ) : (
        <div className="flex flex-col gap-4">
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
                <div className="flex gap-3 mt-4">
                  {r.pdfSuspicious || r.forgeryScore >= 60 ? (
                    <button onClick={() => setConfirmReq(r)} className="flex items-center gap-2 px-4 py-3 rounded-2xl border-2 border-secondary-orange-dark text-secondary-orange-dark text-sm hover:bg-secondary-orange-soft transition cursor-pointer">
                      <AlertTriangle className="w-4 h-4" /> {t("Approve (high score)", "Setujui (skor tinggi)")}
                    </button>
                  ) : (
                    <Button.Primary className="flex items-center gap-2 text-sm" onClick={() => doApprove(r)}>
                      <CheckCircle2 className="w-4 h-4" /> {t("Approve", "Setujui")}
                    </Button.Primary>
                  )}
                  <button onClick={() => { reject(r.id); toast(t("Event rejected", "Event ditolak")); }} className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-sm transition cursor-pointer ${r.pdfSuspicious || r.forgeryScore >= 60 ? "bg-primary-navy text-white hover:bg-primary-navy-dark" : "border-2 border-neutral-light-gray-1 text-neutral-gray hover:border-secondary-pink-dark hover:text-secondary-pink-dark"}`}>
                    <XCircle className="w-4 h-4" /> {t("Reject", "Tolak")}
                  </button>
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
              <button onClick={() => setConfirmReq(null)} className="flex-1 px-4 py-3 rounded-2xl border-2 border-neutral-light-gray-1 text-neutral-gray text-sm cursor-pointer">{t("Cancel", "Batal")}</button>
              <Button.Primary wrapperClass="flex-1" className="w-full text-sm" onClick={() => { doApprove(confirmReq); setConfirmReq(null); }}>{t("Yes, approve", "Ya, setujui")}</Button.Primary>
            </div>
          </>
        )}
      </Modal>
    </PageContainer>
  );
}
