"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import toast from "react-hot-toast";
import {
  ArrowLeft, Lock, CheckCircle2, ExternalLink, Copy, FileText, CreditCard, ShieldCheck,
  AlertTriangle, Loader2, Paperclip, ChevronDown, Repeat, Timer, Gavel,
  FlaskConical, XCircle, MapPin, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/common/Modal";
import { useAccessGuard, useHydrated } from "@/lib/access";
import { PageGate } from "@/components/layout/PageGate";
import { useT, useFormatters } from "@/lib/i18n";
import { EscrowStatusPill } from "@/components/common/EscrowStatusPill";
import { PageContainer } from "@/components/layout/PageContainer";
import {useOrders, useUser, explorerTx, explorerAddr, shortHash, phaseOf, msUntilRelease, disputeDeadlineISO, checkEvidence, mockEvidenceOptions, DISPUTE_WINDOW_H, reasonMeta, availableReasons, reasonBlockedNote, canFileDispute, REMEDY_LABEL, type DisputeEvidence, type DisputeReason,
} from "@/lib/mock";

function ChainRow({ label, value, href, onCopy }: { label: string; value: string; href?: string; onCopy?: () => void }) {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-dashed border-neutral-light-gray-1 last:border-0">
      <span className="text-xs text-neutral-gray shrink-0">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-xs text-neutral-black truncate">{value}</span>
        {onCopy && <button onClick={onCopy} aria-label={t("Copy", "Salin")} className="text-neutral-gray hover:text-primary-navy cursor-pointer shrink-0"><Copy className="w-3.5 h-3.5" /></button>}
        {href && <a href={href} target="_blank" rel="noreferrer" className="text-primary-navy hover:opacity-70 shrink-0"><ExternalLink className="w-3.5 h-3.5" /></a>}
      </div>
    </div>
  );
}

function CheckRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex gap-2 py-1.5">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-secondary-green-dark shrink-0 mt-0.5" />
      ) : (
        <XCircle className="w-4 h-4 text-secondary-pink-dark shrink-0 mt-0.5" />
      )}
      <div className="min-w-0">
        <div className="text-xs font-medium text-neutral-black">{label}</div>
        <div className="text-xs text-neutral-gray">{detail}</div>
      </div>
    </div>
  );
}

export default function OrderDetailPage() {
  const t = useT();
  const ready = useAccessGuard("account");
  const { formatIDR, formatEventDate, formatDateTime, formatCountdown } = useFormatters();
  const { id } = useParams<{ id: string }>();
  const order = useOrders((s) => s.orders.find((o) => o.id === id));
  const markEventFinished = useOrders((s) => s.markEventFinished);
  const fastForwardWindow = useOrders((s) => s.fastForwardWindow);
  const sweepAutoRelease = useOrders((s) => s.sweepAutoRelease);
  const openDispute = useOrders((s) => s.openDispute);
  const markDocsAccessed = useOrders((s) => s.markDocsAccessed);
  const cancelEvent = useOrders((s) => s.cancelEvent);
  const postponeEvent = useOrders((s) => s.postponeEvent);
  const refundPostponed = useOrders((s) => s.refundPostponed);
  const user = useUser((s) => s.user);

  const mounted = useHydrated();
  const [now, setNow] = useState(() => Date.now());
  const [acting, setActing] = useState(false);
  const [showKuasa, setShowKuasa] = useState(false);
  const [showKtp, setShowKtp] = useState(false);
  const [ktpOpen, setKtpOpen] = useState(false);
  const [showProof, setShowProof] = useState(false);

  // Dispute form
  const [showDispute, setShowDispute] = useState(false);
  const [reason, setReason] = useState<DisputeReason | null>(null);
  const [evidence, setEvidence] = useState<DisputeEvidence | null>(null);
  const [note, setNote] = useState("");
  const [attested, setAttested] = useState(false);


  // One ticking clock drives the countdown and the automatic payout, so the
  // page never shows a window that has silently expired.
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      sweepAutoRelease();
    }, 1000);
    return () => clearInterval(t);
  }, [sweepAutoRelease]);

  // Which files can back this particular claim, and how they read.
  const evidenceOptions = useMemo(
    () => (order && reason ? mockEvidenceOptions(order, reason) : []),
    [order, reason]
  );
  const check = useMemo(
    () => (order && reason ? checkEvidence(order, reason, evidence, new Date(now).toISOString()) : null),
    [order, reason, evidence, now]
  );

  if (!ready || !mounted) return <PageGate />;
  if (!order) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-28 pb-16 text-center">
        <p className="text-neutral-gray">{t("Ticket not found.", "Tiket tidak ditemukan.")}</p>
        <Link href="/tickets" className="text-primary-navy font-medium">{t("Back to my tickets", "Balik ke tiket saya")}</Link>
      </div>
    );
  }

  const phase = phaseOf(order, now);
  const left = msUntilRelease(order, now);
  const deadline = disputeDeadlineISO(order);
  const elapsed = Number.isFinite(left) ? Math.min(1, Math.max(0, 1 - left / (DISPUTE_WINDOW_H * 3_600_000))) : 0;
  const filedReason = order.dispute ? reasonMeta(order.dispute.reason) : null;
  const filedCheck = order.dispute
    ? checkEvidence(order, order.dispute.reason, order.dispute.evidence, order.dispute.openedAtISO)
    : null;
  const reasons = availableReasons(order, now);
  const meta = reason ? reasonMeta(reason) : null;
  const needsFile = !!meta && meta.proof !== "DOCS" && meta.proof !== "NONE";

  const copy = (value: string) => { navigator.clipboard?.writeText(value); toast.success(t("Copied", "Disalin")); };

  const finishEvent = () => {
    setActing(true);
    setTimeout(() => {
      markEventFinished(order.id);
      setActing(false);
      toast.success(t("Event marked as finished. The 48h dispute window is now running.", "Event ditandai selesai. Masa sengketa 48 jam mulai berjalan."));
    }, 900);
  };
  const skipWindow = () => {
    setActing(true);
    setTimeout(() => {
      fastForwardWindow(order.id);
      sweepAutoRelease();
      setActing(false);
      toast.success(t("Window elapsed. The escrow paid the seller automatically.", "Masa sengketa lewat. Escrow otomatis membayar penjual."));
    }, 900);
  };

  const eligible = reason ? reasonMeta(reason).eligible : false;
  const blocked = reason && meta ? reasonBlockedNote(order, meta, now) : null;
  const canSubmit = eligible && !blocked && attested && (!needsFile || !!evidence);
  const submitDispute = () => {
    if (!canSubmit || !reason) return;
    setShowDispute(false);
    setActing(true);
    setTimeout(() => {
      openDispute(order.id, { reason, note: { en: note, id: note }, evidence: evidence ?? undefined });
      setActing(false);
      toast.success(t("Dispute filed. A Lummy arbiter will review your evidence.", "Sengketa diajukan. Arbiter Lummy akan meninjau buktimu."));
    }, 1300);
  };

  const watermark = `${user?.name ?? t("Buyer", "Pembeli")} · ${new Date().toLocaleDateString("en-GB")} · Lummy`;

  return (
    <PageContainer width="app">
      <Link href="/tickets" className="inline-flex items-center gap-1 text-neutral-gray hover:text-primary-navy text-sm mb-4">
        <ArrowLeft className="w-4 h-4" /> {t("My tickets", "Tiket saya")}
      </Link>

      {/* Event header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-lummy-500 shrink-0">
          <Image src={order.eventImage} alt={order.eventTitle} fill className="object-cover" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-neutral-black">{order.eventTitle}</h1>
          <p className="text-sm text-neutral-gray">{formatEventDate(order.eventDateISO)} · {order.tierName}{order.quantity > 1 ? ` · ${order.quantity} ${t("tickets", "tiket")}` : ""}</p>
          <p className="text-xs text-neutral-gray mt-0.5">{t("Seller", "Penjual")} {order.sellerName} · {t("Order", "Order")} <span className="font-mono">{order.id}</span></p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6 min-w-0">
        {/* Escrow */}
        <div className="bg-neutral-white rounded-3xl border border-lummy-500 p-6 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-4">
            <span className="font-fredoka font-semibold text-neutral-black flex items-center gap-2">
              <Lock className="w-5 h-5 text-lummy-500" /> {t("Escrow", "Escrow")}
            </span>
            <EscrowStatusPill phase={phase} />
          </div>

          <div className="font-fredoka font-bold text-3xl text-neutral-black mb-1">{formatIDR(order.amount)}</div>
          <p className="text-sm text-neutral-gray">
            {phase === "PRE_EVENT" && t("Held until the show is over. Not in our account, and not in the seller's.", "Ditahan sampai konser selesai. Bukan di rekening kami, bukan juga di penjual.")}
            {phase === "WINDOW_OPEN" && t("The show is over. Funds stay locked while the dispute window runs.", "Konser sudah selesai. Dana tetap terkunci selama masa sengketa berjalan.")}
            {phase === "WINDOW_CLOSED" && t("The window has elapsed. Releasing to the seller.", "Masa sengketa sudah lewat. Dana sedang dicairkan ke penjual.")}
            {phase === "IN_REVIEW" && t("Frozen while an arbiter reviews the dispute. Nothing moves until there is a verdict.", "Dibekukan selama arbiter meninjau sengketa. Tidak ada yang bergerak sampai ada putusan.")}
            {phase === "RELEASED" && (order.autoReleased
              ? t("Paid out to the seller. No dispute was filed within 48 hours.", "Sudah cair ke penjual. Tidak ada sengketa dalam 48 jam.")
              : t("Paid out to the seller after the arbiter reviewed the dispute.", "Cair ke penjual setelah arbiter meninjau sengketa."))}
            {phase === "REFUNDED" && (order.autoRefundReason === "EVENT_CANCELLED"
              ? t("Returned automatically when the organiser cancelled the show.", "Dikembalikan otomatis saat penyelenggara membatalkan acara.")
              : t("Returned to you after the arbiter reviewed the evidence.", "Dikembalikan ke kamu setelah arbiter meninjau bukti."))}
          </p>

          {/* The organiser's state outranks the clock: a show that will not happen
              must never pay out just because 48 quiet hours went by. */}
          {order.eventStatus === "cancelled" && (
            <div className="mt-4 rounded-2xl bg-secondary-pink-soft p-4">
              <div className="text-sm font-medium text-secondary-pink-dark flex items-center gap-2">
                <XCircle className="w-4 h-4 shrink-0" /> {t("Event cancelled by the organiser", "Acara dibatalkan penyelenggara")}
              </div>
              <p className="text-xs text-secondary-pink-dark/90 mt-1.5 leading-relaxed">
                {t(
                  "Nobody has to file anything. While the money is still in escrow it simply goes back, and the seller is not charged either: no one is at fault here.",
                  "Tidak ada yang perlu mengajukan apa pun. Selama dananya masih di escrow, uangnya otomatis kembali, dan penjual juga tidak dikenai penalti: di sini tidak ada yang salah."
                )}
              </p>
            </div>
          )}
          {order.eventStatus === "postponed" && order.escrowStatus === "LOCKED" && (
            <div className="mt-4 rounded-2xl bg-secondary-gold-soft p-4">
              <div className="text-sm font-medium text-secondary-brown-dark flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {t("Event postponed", "Acara diundur")}
              </div>
              <p className="text-xs text-secondary-brown-dark/90 mt-1.5 leading-relaxed">
                {t(
                  "Your ticket stays valid for the new date and the escrow holds until then. If the new date does not work for you, take the money back instead. No arbiter needed either way.",
                  "Tiketmu tetap berlaku untuk tanggal baru dan escrow menahan dananya sampai saat itu. Kalau tanggal barunya tidak cocok, ambil uangmu kembali. Dua-duanya tidak perlu arbiter."
                )}
              </p>
              <button
                onClick={() => { refundPostponed(order.id); toast.success(t("Refunded. The escrow released it back to you.", "Dana dikembalikan. Escrow melepasnya balik ke kamu.")); }}
                className="mt-2.5 text-xs font-medium text-primary-navy hover:opacity-80 cursor-pointer"
              >
                {t("New date does not work, refund me", "Tanggal baru gak cocok, kembalikan dana")}
              </button>
            </div>
          )}

          {/* Live countdown while the window runs */}
          {phase === "WINDOW_OPEN" && order.eventStatus !== "cancelled" && (
            <div className="mt-4 rounded-2xl border-2 border-secondary-gold-dark/40 bg-secondary-gold-soft p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-xs font-medium text-secondary-brown-dark flex items-center gap-1.5">
                  <Timer className="w-4 h-4" /> {t("Auto-releases to the seller in", "Cair otomatis ke penjual dalam")}
                </span>
                <span className="font-mono font-bold text-lg text-neutral-black tabular-nums">{formatCountdown(left)}</span>
              </div>
              <div className="mt-2.5 h-1.5 rounded-full bg-neutral-white overflow-hidden">
                <div className="h-full bg-secondary-brown-dark/70 transition-all" style={{ width: `${elapsed * 100}%` }} />
              </div>
              <p className="text-xs text-secondary-brown-dark/90 mt-2.5 leading-relaxed">
                {t(
                  "Staying silent counts as a valid handover, so the payout goes through on its own.",
                  "Diam berarti serah-terima beres, jadi dananya cair dengan sendirinya."
                )}
              </p>
            </div>
          )}

          {/* Settlement rules: the policy that makes the guarantee credible */}
          <div className="mt-5 rounded-2xl bg-secondary-blue-extra border border-neutral-light-gray-1 p-4">
            <div className="text-xs font-semibold text-neutral-black mb-2.5">{t("How settlement works", "Cara pencairan bekerja")}</div>
            <ul className="flex flex-col gap-2.5 text-xs text-neutral-gray leading-relaxed">
              <li className="flex gap-2">
                <Clock className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
                <span>{t(
                  "The clock settles this, not a button. There is no \"I got in\" confirmation to fake.",
                  "Yang menentukan itu waktu, bukan tombol. Tidak ada konfirmasi \"aku sudah masuk\" yang bisa dipalsukan."
                )}</span>
              </li>
              <li className="flex gap-2">
                <Gavel className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
                <span>{t(
                  "A refund is a dispute with gate-time proof, reviewed by an arbiter. Never self-serve.",
                  "Refund itu sengketa dengan bukti dari gate, diputus arbiter. Bukan tombol yang bisa kamu pencet sendiri."
                )}</span>
              </li>
              <li className="flex gap-2">
                <Repeat className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
                <span>
                  {t("Not attending is not a refund.", "Gak jadi datang bukan alasan refund.")}{" "}
                  <Link href="/sell" className="text-primary-navy font-medium">{t("Relist it", "Jual lagi")}</Link>{" "}
                  {t("before the show instead.", "sebelum acara berlangsung.")}
                </span>
              </li>
            </ul>
          </div>

          {/* Filed dispute + the automated read on its evidence */}
          {order.dispute && (
            <div className="mt-5 rounded-2xl border border-neutral-light-gray-1 overflow-hidden">
              <div className="bg-secondary-orange-soft px-4 py-3">
                <div className="text-sm font-medium text-secondary-orange-dark flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {filedReason ? t(filedReason.label.en, filedReason.label.id) : ""}
                </div>
                <div className="text-xs text-secondary-orange-dark/80 mt-1">{t("Filed", "Diajukan")} {formatDateTime(order.dispute.openedAtISO)}</div>
              </div>
              <div className="p-4">
                {order.dispute.note && <p className="text-xs text-neutral-gray italic mb-3">&ldquo;{t(order.dispute.note.en, order.dispute.note.id)}&rdquo;</p>}
                <div className="flex items-center gap-2 text-xs text-neutral-black mb-2">
                  <Paperclip className="w-3.5 h-3.5 text-neutral-gray shrink-0" />
                  <span className="font-mono truncate">
                    {order.dispute.evidence?.fileName ?? t("Settled from our own records", "Diputus dari catatan kami")}
                  </span>
                  <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${filedCheck?.strength === "STRONG" ? "bg-secondary-green-soft text-secondary-green-dark" : "bg-secondary-pink-soft text-secondary-pink-dark"}`}>
                    {filedCheck?.strength === "STRONG" ? "STRONG" : "WEAK"}
                  </span>
                </div>
                {filedCheck?.checks.map((c) => <CheckRow key={c.label.en} ok={c.ok} label={t(c.label.en, c.label.id)} detail={t(c.detail.en, c.detail.id)} />)}
                {(order.dispute.replies ?? []).map((r, i) => (
                  <div key={i} className="mt-3 pt-3 border-t border-dashed border-neutral-light-gray-1 text-xs">
                    <span className={`font-medium ${r.fromSeller ? "text-primary-navy" : "text-secondary-orange-dark"}`}>
                      {r.fromSeller ? t("The seller answered", "Penjual menjawab") : t("You added", "Kamu menambahkan")}
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
                {order.dispute.verdict && (
                  <div className="mt-3 pt-3 border-t border-dashed border-neutral-light-gray-1">
                    <div className="text-xs font-semibold text-neutral-black flex items-center gap-1.5">
                      <Gavel className="w-3.5 h-3.5" /> {t("Verdict", "Putusan")}: {t(REMEDY_LABEL[order.dispute.verdict.remedy].en.toLowerCase(), REMEDY_LABEL[order.dispute.verdict.remedy].id.toLowerCase())}
                      {order.dispute.verdict.sellerPenalty > 0 && (
                        <span className="ml-1 font-normal text-neutral-gray">
                          · {t("seller charged", "penjual dikenai")} {formatIDR(order.dispute.verdict.sellerPenalty)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-gray mt-1">{t(order.dispute.verdict.rationale.en, order.dispute.verdict.rationale.id)}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* On-chain proof, hidden by default: web2 first */}
          <button
            onClick={() => setShowProof((v) => !v)}
            aria-expanded={showProof}
            className="mt-5 flex items-center gap-1.5 text-xs text-primary-navy font-medium hover:opacity-80 cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5" /> {showProof ? t("Hide technical details", "Sembunyikan detail teknis") : t("Verify it yourself on-chain", "Cek sendiri on-chain")}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showProof ? "rotate-180" : ""}`} />
          </button>
          {showProof && (
            <div className="mt-3">
              <div className="bg-secondary-blue-extra rounded-2xl p-4">
                <ChainRow label={t("Escrow contract", "Kontrak escrow")} value={shortHash(order.contractAddress)} href={explorerAddr(order.contractAddress)} onCopy={() => copy(order.contractAddress)} />
                <ChainRow label={t("Funding tx", "Tx pendanaan")} value={shortHash(order.fundTxHash)} href={explorerTx(order.fundTxHash)} onCopy={() => copy(order.fundTxHash)} />
                {order.settleTxHash && (
                  <ChainRow label={order.escrowStatus === "RELEASED" ? t("Release tx", "Tx pencairan") : t("Refund tx", "Tx refund")} value={shortHash(order.settleTxHash)} href={explorerTx(order.settleTxHash)} onCopy={() => copy(order.settleTxHash!)} />
                )}
                <ChainRow label={t("Release condition", "Syarat pencairan")} value={t(`Event end + ${DISPUTE_WINDOW_H}h`, `Acara selesai + ${DISPUTE_WINDOW_H} jam`)} />
                <ChainRow label={t("Network", "Jaringan")} value="Monad testnet (10143)" />
              </div>
              <p className="flex items-center gap-1.5 text-xs text-neutral-gray mt-3">
                <ShieldCheck className="w-3.5 h-3.5 text-secondary-green-dark" /> {t("Do not take our word for it, read the contract.", "Jangan percaya kami, baca kontraknya sendiri.")}
              </p>
            </div>
          )}

          {/* History */}
          <div className="mt-5">
            <div className="text-xs text-neutral-gray mb-2">{t("History", "Riwayat")}</div>
            <ol className="relative border-l-2 border-dashed border-neutral-light-gray-1 ml-1.5 flex flex-col gap-4">
              <li className="pl-4 relative">
                <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-lummy-500 border-2 border-neutral-white" />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-neutral-black">{t("Funds locked in escrow", "Dana dikunci di escrow")}</span>
                  {showProof && <a href={explorerTx(order.fundTxHash)} target="_blank" rel="noreferrer" className="text-xs text-primary-navy flex items-center gap-1 shrink-0">{shortHash(order.fundTxHash, 4)} <ExternalLink className="w-3 h-3" /></a>}
                </div>
                <span className="text-xs text-neutral-gray">{formatDateTime(order.createdAtISO)}</span>
              </li>
              {order.eventEndedAtISO && (
                <li className="pl-4 relative">
                  <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-lummy-500 border-2 border-neutral-white" />
                  <span className="text-sm text-neutral-black">{t(`Event finished, ${DISPUTE_WINDOW_H}h window opened`, `Acara selesai, masa sengketa ${DISPUTE_WINDOW_H} jam dibuka`)}</span>
                  <span className="block text-xs text-neutral-gray">{formatDateTime(order.eventEndedAtISO)}</span>
                </li>
              )}
              {order.dispute && (
                <li className="pl-4 relative">
                  <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-secondary-orange-dark border-2 border-neutral-white" />
                  <span className="text-sm text-neutral-black">{t("Dispute filed with evidence", "Sengketa diajukan dengan bukti")}</span>
                  <span className="block text-xs text-neutral-gray">{formatDateTime(order.dispute.openedAtISO)}</span>
                </li>
              )}
              {order.settleTxHash ? (
                <li className="pl-4 relative">
                  <span className={`absolute -left-[7px] top-1 w-3 h-3 rounded-full border-2 border-neutral-white ${order.escrowStatus === "RELEASED" ? "bg-secondary-green-dark" : "bg-neutral-gray"}`} />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-neutral-black">
                      {order.escrowStatus === "RELEASED"
                        ? order.autoReleased
                          ? t("Auto-released to seller", "Cair otomatis ke penjual")
                          : t("Released to seller by verdict", "Cair ke penjual lewat putusan")
                        : t("Refunded to buyer", "Dikembalikan ke pembeli")}
                    </span>
                    {showProof && <a href={explorerTx(order.settleTxHash)} target="_blank" rel="noreferrer" className="text-xs text-primary-navy flex items-center gap-1 shrink-0">{shortHash(order.settleTxHash, 4)} <ExternalLink className="w-3 h-3" /></a>}
                  </div>
                </li>
              ) : (
                <li className="pl-4 relative">
                  <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-neutral-light-gray-1 border-2 border-neutral-white" />
                  <span className="text-sm text-neutral-gray">
                    {deadline
                      ? t(`Auto-release at ${formatDateTime(deadline)}`, `Cair otomatis pada ${formatDateTime(deadline)}`)
                      : t(`Waiting for the event, then ${DISPUTE_WINDOW_H}h`, `Menunggu acara, lalu ${DISPUTE_WINDOW_H} jam`)}
                  </span>
                </li>
              )}
            </ol>
          </div>

          {/* A claim is possible from purchase onwards, because a seller can fail
              you long before the gate does. What differs is the proof it needs. */}
          {canFileDispute(order, now) && (
            <button
              onClick={() => setShowDispute(true)}
              className="mt-5 w-full px-4 py-3 rounded-2xl border-2 border-secondary-orange-dark text-secondary-orange-dark text-sm font-medium hover:bg-secondary-orange-soft transition cursor-pointer flex items-center justify-center gap-2"
            >
              <AlertTriangle className="w-4 h-4" />
              {phase === "PRE_EVENT"
                ? t("Problem with this ticket?", "Ada masalah dengan tiket ini?")
                : t("Something went wrong at the gate", "Ada masalah di gate")}
            </button>
          )}
          {false && (
            <p className="mt-5 text-xs text-neutral-gray flex gap-2">
              <Lock className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
              <span>{t(
                "Disputes open once the show is over. Nothing to do until then.",
                "Sengketa baru bisa diajukan setelah acara selesai. Sampai itu, tidak ada yang perlu kamu lakukan."
              )}</span>
            </p>
          )}

          {/* Simulation controls, clearly separated from the product surface */}
          {order.escrowStatus === "LOCKED" && (
            <div className="mt-5 rounded-2xl border-2 border-dashed border-neutral-light-gray-1 p-4">
              <div className="text-xs font-semibold text-neutral-gray flex items-center gap-1.5 mb-1">
                <FlaskConical className="w-3.5 h-3.5 text-secondary-pink-dark" /> {t("Prototype controls", "Kontrol prototipe")}
              </div>
              <p className="text-xs text-neutral-gray mb-3">
                {t("In production these come from the event schedule and the contract clock.", "Di produksi, ini datang dari jadwal acara dan jam kontrak.")}
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                {!order.eventEndedAtISO && (
                  <button onClick={finishEvent} className="flex-1 px-3 py-2 rounded-xl border border-neutral-light-gray-1 text-xs text-neutral-black hover:border-lummy-500 transition cursor-pointer">
                    {t("Mark event as finished", "Tandai acara selesai")}
                  </button>
                )}
                <button onClick={skipWindow} className="flex-1 px-3 py-2 rounded-xl border border-neutral-light-gray-1 text-xs text-neutral-black hover:border-lummy-500 transition cursor-pointer">
                  {t(`Skip the ${DISPUTE_WINDOW_H}h window`, `Lewati masa ${DISPUTE_WINDOW_H} jam`)}
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 mt-2">
                <button
                  onClick={() => { postponeEvent(order.eventId); toast(t("Organiser postponed the event", "Penyelenggara mengundur acara")); }}
                  className="flex-1 px-3 py-2 rounded-xl border border-neutral-light-gray-1 text-xs text-neutral-black hover:border-lummy-500 transition cursor-pointer"
                >
                  {t("Organiser postpones", "Penyelenggara mengundur")}
                </button>
                <button
                  onClick={() => { cancelEvent(order.eventId); toast(t("Organiser cancelled the event", "Penyelenggara membatalkan acara")); }}
                  className="flex-1 px-3 py-2 rounded-xl border border-neutral-light-gray-1 text-xs text-neutral-black hover:border-lummy-500 transition cursor-pointer"
                >
                  {t("Organiser cancels", "Penyelenggara membatalkan")}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Documents */}
        <div className="flex flex-col gap-4 min-w-0">
          <div className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5">
            <h4 className="font-fredoka font-semibold text-neutral-black mb-3">{t("Handover documents", "Dokumen serah-terima")}</h4>
            <button onClick={() => { setShowKuasa(true); markDocsAccessed(order.id, "letter"); }} className="w-full flex items-center gap-3 p-3 rounded-2xl border border-neutral-light-gray-1 hover:border-lummy-500 transition cursor-pointer text-left">
              <span className="w-10 h-10 rounded-xl bg-secondary-blue-soft text-lummy-500 grid place-items-center shrink-0"><FileText className="w-5 h-5" /></span>
              <div>
                <div className="text-sm font-medium text-neutral-black">{t("Letter of authorisation", "Surat kuasa")}</div>
                <div className="text-xs text-neutral-gray">{t("Print-ready, e-stamped and e-signed", "Siap print, ber-e-materai dan TTE")}</div>
              </div>
            </button>
            {order.gateKtp && (
              <button onClick={() => { setShowKtp(true); markDocsAccessed(order.id, "sellerId"); }} className="mt-3 w-full flex items-center gap-3 p-3 rounded-2xl border border-neutral-light-gray-1 hover:border-lummy-500 transition cursor-pointer text-left">
                <span className="w-10 h-10 rounded-xl bg-secondary-pink-soft text-secondary-pink-dark grid place-items-center shrink-0"><CreditCard className="w-5 h-5" /></span>
                <div>
                  <div className="text-sm font-medium text-neutral-black">{t("Seller ID card (gate check)", "Foto KTP penjual (cek gate)")}</div>
                  <div className="text-xs text-neutral-gray">{ktpOpen ? t("Unlocked, view-only", "Terbuka, hanya bisa dilihat") : t("Unlocks when you are at the gate", "Terbuka saat kamu di gate")}</div>
                </div>
              </button>
            )}
          </div>
          <div className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5 text-xs text-neutral-gray">
            {t("Order", "Order")} <span className="font-mono text-neutral-black">{order.id}</span> · {t("placed", "dibuat")} {formatDateTime(order.createdAtISO)}
          </div>
        </div>
      </div>

      {/* Letter of authorisation */}
      <Modal open={showKuasa} onClose={() => setShowKuasa(false)} title={t("Letter of authorisation", "Surat kuasa")}>
        <div className="bg-secondary-gray-soft rounded-2xl p-6 text-sm text-neutral-black leading-relaxed" lang="id">
          <p className="text-center font-fredoka font-bold text-base mb-4">SURAT KUASA</p>
          <p>Yang bertanda tangan di bawah ini memberi kuasa kepada:</p>
          <p className="mt-2"><b>Penerima:</b> {user?.name ?? "Pembeli"}</p>
          <p><b>Pemberi:</b> {order.sellerName}</p>
          <p className="mt-3">Untuk mengambil dan menggunakan tiket <b>{order.eventTitle}</b> ({order.tierName}) pada {formatEventDate(order.eventDateISO)}.</p>
          <div className="flex justify-between mt-6 text-xs text-neutral-gray">
            <span>Ditandatangani secara elektronik (TTE)</span>
            <span className="bg-secondary-gold-soft text-secondary-brown-dark px-2 py-1 rounded">e-Materai Rp10.000</span>
          </div>
        </div>
        <p className="text-xs text-neutral-gray mt-3">{t("The legal document stays in Indonesian, since that is what venue staff and courts read.", "Dokumen hukumnya tetap berbahasa Indonesia, karena itu yang dibaca petugas venue dan pengadilan.")}</p>
        <Button.Primary wrapperClass="w-full mt-4" className="w-full text-sm" onClick={() => toast(t("Print / download (demo)", "Print / unduh (demo)"))}>{t("Print letter", "Print surat")}</Button.Primary>
      </Modal>

      {/* Seller ID */}
      <Modal open={showKtp} onClose={() => setShowKtp(false)} title={t("Seller ID card", "Foto KTP penjual")}>
        {!ktpOpen ? (
          <div className="flex flex-col items-center text-center gap-3 py-2">
            <span className="w-14 h-14 rounded-2xl bg-secondary-blue-soft text-lummy-500 grid place-items-center"><Lock className="w-7 h-7" /></span>
            <h4 className="font-fredoka font-semibold text-neutral-black">{t("Unlocks near the event", "Terbuka mendekati acara")}</h4>
            <p className="text-sm text-neutral-gray max-w-sm">
              {t(
                "To keep the seller's exposure narrow, the ID photo only opens close to the show or when you are at the gate. Once open it stays available until the event passes, then it is purged.",
                "Demi menjaga privasi penjual, foto KTP baru terbuka mendekati hari-H atau saat kamu sudah di gate. Setelah terbuka, tetap bisa dilihat sampai acara lewat, lalu dihapus."
              )}
            </p>
            <Button.Primary className="text-sm mt-1" onClick={() => setKtpOpen(true)}>{t("I am at the gate, unlock", "Aku di gate, buka akses")}</Button.Primary>
          </div>
        ) : (
          <>
            <div className="relative rounded-2xl overflow-hidden border border-neutral-light-gray-1 select-none" onContextMenu={(e) => e.preventDefault()}>
              <div className="bg-gradient-to-br from-secondary-blue-soft to-secondary-blue-light p-5 h-56">
                <div className="text-xs text-neutral-gray">PROVINSI DKI JAKARTA</div>
                <div className="flex gap-4 mt-3">
                  <div className="w-20 h-24 rounded bg-neutral-light-gray-1" />
                  <div className="text-xs space-y-1 text-neutral-black/70">
                    <div>NIK ••• •••• •••• ••••</div>
                    <div>Nama {order.sellerName.toUpperCase()}</div>
                    <div>Tempat/Tgl Lahir ••••</div>
                    <div>Alamat ••••••••</div>
                  </div>
                </div>
              </div>
              <div className="absolute inset-0 flex flex-wrap gap-6 content-center justify-center opacity-30 pointer-events-none">
                {Array.from({ length: 9 }).map((_, i) => (
                  <span key={i} className="text-[10px] text-neutral-black -rotate-[20deg] whitespace-nowrap">{watermark}</span>
                ))}
              </div>
            </div>
            <p className="flex items-start gap-2 text-xs text-neutral-gray mt-3">
              <AlertTriangle className="w-4 h-4 text-secondary-orange-dark shrink-0 mt-0.5" />
              {t(
                "View-only. The watermark traces whoever leaks it. Screenshots cannot be blocked on the web, but leaks stay attributable.",
                "Hanya bisa dilihat. Watermark melacak siapa yang menyebarkan. Screenshot tidak bisa dicegah di web, tapi kebocoran tetap bisa dilacak."
              )}
            </p>
          </>
        )}
      </Modal>

      {/* File a dispute: reason, then evidence that has to survive metadata checks */}
      <Modal open={showDispute} onClose={() => setShowDispute(false)} title={t("Report a problem", "Laporkan masalah")}>
        <div className="rounded-2xl bg-secondary-gold-soft px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs font-medium text-secondary-brown-dark flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5" />
            {phase === "PRE_EVENT"
              ? t("You can file from now until", "Bisa diajukan dari sekarang sampai")
              : t("Filing window closes in", "Batas pengajuan tinggal")}
          </span>
          <span className="font-mono font-bold text-sm text-neutral-black tabular-nums">
            {phase === "PRE_EVENT"
              ? t(`${DISPUTE_WINDOW_H}h after the show`, `${DISPUTE_WINDOW_H} jam setelah acara`)
              : formatCountdown(left)}
          </span>
        </div>
        <p className="text-sm text-neutral-gray leading-relaxed mt-3">
          {t(
            "An arbiter reviews this, it is not an automatic refund. If you actually got in, the seller still gets paid.",
            "Ini ditinjau arbiter, bukan refund otomatis. Kalau kamu memang berhasil masuk, penjual tetap dibayar."
          )}
        </p>

        <div className="mt-4 flex flex-col gap-1.5">
          <span className="text-xs font-medium text-neutral-black">{t("What happened?", "Apa yang terjadi?")}</span>
          {reasons.map((r) => (
            <label
              key={r.id}
              className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${reason === r.id ? "border-lummy-500 bg-secondary-blue-light" : "border-neutral-light-gray-1 hover:border-lummy-500"}`}
            >
              <input
                type="radio"
                name="dispute-reason"
                checked={reason === r.id}
                onChange={() => { setReason(r.id); if (!r.eligible) { setEvidence(null); setAttested(false); } }}
                className="mt-0.5 accent-[#3A6CB4] cursor-pointer"
              />
              <span className="min-w-0">
                <span className="block text-sm text-neutral-black">{t(r.label.en, r.label.id)}</span>
              </span>
            </label>
          ))}
        </div>

        {/* No-show is refused right here, which is the whole point of the policy */}
        {reason && !eligible && (
          <div className="mt-3 rounded-2xl bg-secondary-pink-soft p-4">
            <div className="text-sm font-medium text-secondary-pink-dark flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0" /> {t("Not a refund case", "Bukan kasus refund")}
            </div>
            <p className="text-xs text-secondary-pink-dark/90 mt-1.5 leading-relaxed">
              {t(
                "The ticket was valid, so the seller kept their side of the deal. Changing plans does not undo that. Before the show you can relist it and get your money back through the market instead.",
                "Tiketnya valid, jadi penjual sudah memenuhi kewajibannya. Berubah rencana tidak membatalkan itu. Sebelum acara, kamu bisa jual lagi dan balikin uangnya lewat pasar."
              )}
            </p>
            <Link href="/sell" className="inline-flex items-center gap-1 text-xs font-medium text-primary-navy mt-2">
              <Repeat className="w-3.5 h-3.5" /> {t("Relist this ticket", "Jual lagi tiket ini")}
            </Link>
          </div>
        )}

        {eligible && (
          <>
            <div className="mt-4 flex flex-col gap-2">
              <span className="text-xs font-medium text-neutral-black">
                {needsFile ? t("Evidence", "Bukti") : t("What settles this", "Yang menentukan")}
              </span>
              <p className="text-xs text-neutral-gray -mt-1">{meta ? t(meta.help.en, meta.help.id) : ""}</p>
              {needsFile && evidenceOptions.map((ev) => (
                <button
                  key={ev.fileName}
                  onClick={() => setEvidence(ev)}
                  className={`w-full flex items-center gap-2 p-3 rounded-xl border text-left transition cursor-pointer ${evidence?.fileName === ev.fileName ? "border-lummy-500 bg-secondary-blue-light" : "border-dashed border-neutral-light-gray-1 hover:border-lummy-500"}`}
                >
                  <Paperclip className="w-4 h-4 shrink-0 text-neutral-gray" />
                  <span className="text-sm text-neutral-black font-mono truncate">{ev.fileName}</span>
                </button>
              ))}
            </div>

            {check && (
              <div className="mt-3 rounded-2xl border border-neutral-light-gray-1 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-neutral-black mb-1">
                  <MapPin className="w-3.5 h-3.5 text-neutral-gray" /> {needsFile ? t("File metadata", "Metadata file") : t("Our records", "Catatan kami")}
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${check.strength === "STRONG" ? "bg-secondary-green-soft text-secondary-green-dark" : "bg-secondary-pink-soft text-secondary-pink-dark"}`}>
                    {check.strength}
                  </span>
                </div>
                {check.checks.map((c) => <CheckRow key={c.label.en} ok={c.ok} label={t(c.label.en, c.label.id)} detail={t(c.detail.en, c.detail.id)} />)}
                {check.strength === "WEAK" && (
                  <p className="text-xs text-secondary-pink-dark mt-2">
                    {needsFile
                      ? t(
                          "You can still file, but weak evidence usually ends with the funds going to the seller.",
                          "Kamu tetap boleh mengajukan, tapi bukti lemah biasanya berakhir dengan dana cair ke penjual."
                        )
                      : t(
                          "Our own record works against this claim. You can still file, but expect it to be refused.",
                          "Catatan kami justru bertentangan dengan klaim ini. Kamu tetap boleh mengajukan, tapi kemungkinan besar ditolak."
                        )}
                  </p>
                )}
              </div>
            )}

            <label className="flex flex-col gap-1.5 mt-4">
              <span className="text-xs font-medium text-neutral-black">{t("Anything to add?", "Mau menambahkan sesuatu?")} <span className="text-neutral-gray font-normal">{t("(optional)", "(opsional)")}</span></span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder={t("Which gate, what the staff said...", "Gate berapa, petugasnya bilang apa...")}
                className="w-full rounded-xl border border-neutral-light-gray-1 focus:border-lummy-500 px-3 py-2 text-sm text-neutral-black outline-none resize-none"
              />
            </label>

            <label className="flex items-start gap-2.5 mt-4 cursor-pointer">
              <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} className="mt-0.5 accent-[#3A6CB4] cursor-pointer" />
              <span className="text-xs text-neutral-gray leading-relaxed">
                {reason === "NOT_DELIVERED"
                  ? t(
                      "I declare the seller never handed the ticket over to me. A false claim means a permanent ban and liability for the seller's loss.",
                      "Saya menyatakan penjual tidak pernah menyerahkan tiketnya ke saya. Klaim palsu berarti akun diblokir permanen dan menanggung kerugian penjual."
                    )
                  : reason === "NOT_AS_LISTED"
                  ? t(
                      "I declare the ticket I received is not what the listing described. A false claim means a permanent ban and liability for the seller's loss.",
                      "Saya menyatakan tiket yang saya terima tidak sesuai deskripsi listing. Klaim palsu berarti akun diblokir permanen dan menanggung kerugian penjual."
                    )
                  : t(
                      "I declare I was refused entry and did not attend. A false claim means a permanent ban and liability for the seller's loss.",
                      "Saya menyatakan ditolak masuk dan tidak menghadiri acara. Klaim palsu berarti akun diblokir permanen dan menanggung kerugian penjual."
                    )}
              </span>
            </label>
          </>
        )}

        <div className="flex gap-3 mt-5">
          <button onClick={() => setShowDispute(false)} className="flex-1 px-4 py-3 rounded-2xl border-2 border-neutral-light-gray-1 text-neutral-gray text-sm cursor-pointer">{t("Cancel", "Batal")}</button>
          <Button.Primary wrapperClass="flex-1" className="w-full text-sm" disabled={!canSubmit} onClick={submitDispute}>{t("File dispute", "Kirim sengketa")}</Button.Primary>
        </div>
      </Modal>

      <Modal open={acting} onClose={() => {}}>
        <div className="flex flex-col items-center gap-3 py-4">
          <Loader2 className="w-8 h-8 text-lummy-500 animate-spin" />
          <p className="font-fredoka font-semibold text-neutral-black">{t("Sending transaction...", "Mengirim transaksi...")}</p>
          <p className="text-sm text-neutral-gray">{t("One moment, this is being processed.", "Sebentar, sedang diproses.")}</p>
        </div>
      </Modal>
    </PageContainer>
  );
}
