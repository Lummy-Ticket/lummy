"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import toast from "react-hot-toast";
import {
  ArrowLeft, Lock, CheckCircle2, ExternalLink, Copy, FileText, CreditCard, ShieldCheck,
  AlertTriangle, Loader2, Paperclip, ChevronDown, Repeat, Timer, Gavel,
  FlaskConical, XCircle, MapPin, Clock, Ticket, Download, MinusCircle, Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/common/Modal";
import { EvidencePhoto } from "@/components/common/EvidencePhoto";
import { isDemoEmail } from "@/lib/supabase/demo";
import { TICKET_RETENTION_DAYS, isGone, ticketFileGoneAt } from "@/lib/retention";
import { useAccessGuard, useHydrated } from "@/lib/access";
import { PageGate } from "@/components/layout/PageGate";
import { useT, useFormatters } from "@/lib/i18n";
import { EscrowStatusPill } from "@/components/common/EscrowStatusPill";
import { EscrowSteps } from "@/components/common/EscrowSteps";
import { EscrowTimeline } from "@/components/common/EscrowTimeline";
import { PageContainer } from "@/components/layout/PageContainer";
import {useOrders, useUser, explorerTx, explorerAddr, shortHash, phaseOf, msUntilRelease, disputeDeadlineISO, endedAtISO, canRefundPostponed, checkEvidence, mockEvidenceOptions, DISPUTE_WINDOW_H, reasonMeta, availableReasons, reasonBlockedNote, canFileDispute, REMEDY_LABEL, windowMs, windowLabel, withChainSnapshot, type DisputeEvidence, type DisputeReason,
} from "@/lib/mock";
import { chainAction, chainWritable, useChainHistory, useChainInfo, useChainListing, usdcText } from "@/lib/chain/client";
import { DEPLOYMENTS } from "@/lib/chain/deployments";
import { OrderError, orderAction, uploadEvidence, useAccountOrders } from "@/lib/orders/client";

/** The escrow that new on-chain orders go to, shown even on sample orders so anyone can inspect it. */
const LIVE_ESCROW = DEPLOYMENTS[421614]?.escrow;

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

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

function CheckRow({ ok, unknown, label, detail }: { ok: boolean; unknown?: boolean; label: string; detail: string }) {
  return (
    <div className="flex gap-2 py-1.5">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-secondary-green-dark shrink-0 mt-0.5" />
      ) : unknown ? (
        // Nothing to check against: neither a pass nor a fail.
        <MinusCircle className="w-4 h-4 text-neutral-gray shrink-0 mt-0.5" />
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
  const user = useUser((s) => s.user);
  // An account's order comes from the database and changes only through the server; a sample
  // persona's lives in this browser.
  const account = !!user?.account;
  const sampleOrder = useOrders((s) => s.orders.find((o) => o.id === id));
  const { orders: fetched, error: loadError, refresh: refreshOrder } = useAccountOrders(account ? { id } : null);
  const stored = account ? fetched?.[0] : sampleOrder;
  const markEventFinished = useOrders((s) => s.markEventFinished);
  const fastForwardWindow = useOrders((s) => s.fastForwardWindow);
  const sweepAutoRelease = useOrders((s) => s.sweepAutoRelease);
  const openDispute = useOrders((s) => s.openDispute);
  const markDocsAccessed = useOrders((s) => s.markDocsAccessed);
  const cancelEvent = useOrders((s) => s.cancelEvent);
  const postponeEvent = useOrders((s) => s.postponeEvent);
  const refundPostponed = useOrders((s) => s.refundPostponed);
  const syncChain = useOrders((s) => s.syncChain);
  const settleChain = useOrders((s) => s.settleChain);

  // On-chain orders mirror the contract: status, window and deadline come from there. A sample
  // order stores what it said; an account's order shows it over what the database holds.
  const chainInfo = useChainInfo();
  const { data: live, refresh: refreshLive } = useChainListing(stored?.chain?.listingId);
  const order = useMemo(() => (account && stored && live ? withChainSnapshot(stored, live) : stored), [account, stored, live]);
  // The same escrow told from the contract's own events, for the history below and the public proof page.
  const { data: history, refresh: refreshHistory } = useChainHistory(stored?.chain?.listingId);
  const liveStep = live ? `${live.status}:${live.disputed}` : "";
  useEffect(() => {
    if (liveStep) refreshHistory();
  }, [liveStep, refreshHistory]);
  const releaseTried = useRef(0);

  const mounted = useHydrated();
  const [now, setNow] = useState(() => Date.now());
  const [acting, setActing] = useState(false);
  const [showKuasa, setShowKuasa] = useState(false);
  const [showKtp, setShowKtp] = useState(false);
  const [ktpOpen, setKtpOpen] = useState(false);
  const [showProof, setShowProof] = useState(false);
  // Taking the money back from a postponed show gives the ticket up, so it asks twice.
  const [optingOut, setOptingOut] = useState(false);

  // Dispute form
  const [showDispute, setShowDispute] = useState(false);
  const [reason, setReason] = useState<DisputeReason | null>(null);
  const [evidence, setEvidence] = useState<DisputeEvidence | null>(null);
  const [note, setNote] = useState("");
  const [attested, setAttested] = useState(false);
  // A photo of the buyer's own, uploaded and read by the server before the claim is filed.
  const [uploading, setUploading] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);


  // One ticking clock drives the countdown and the automatic payout, so the
  // page never shows a window that has silently expired.
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      sweepAutoRelease();
    }, 1000);
    return () => clearInterval(t);
  }, [sweepAutoRelease]);

  // Every fresh read from the contract is mirrored into a sample order.
  useEffect(() => {
    if (!account && sampleOrder?.chain && live) syncChain(sampleOrder.id, live);
  }, [account, sampleOrder?.id, sampleOrder?.chain, live, syncChain]);

  // Silence settles it: once the contract's window has passed without a dispute, the payout goes
  // out. The contract lets anyone trigger it; here the operator does, one attempt at a time.
  useEffect(() => {
    if (account || !order?.chain || !live || live.status !== "DisputeWindow" || live.disputed) return;
    // The contract's clock decides, not this device's: a skewed laptop must not fire early.
    if (live.now <= live.deadline || !chainWritable(chainInfo)) return;
    if (now - releaseTried.current < 20_000) return;
    releaseTried.current = now;
    const orderId = order.id;
    chainAction(order.chain.listingId, "release")
      .then((r) => {
        settleChain(orderId, { escrowStatus: "RELEASED", tx: r.tx, withdrawals: r.withdrawals, autoReleased: true });
        toast.success(t("The window closed in silence. The contract paid the seller.", "Masa sengketa lewat tanpa klaim. Kontrak membayar penjual."));
        refreshLive();
      })
      .catch((e) => toast.error(`${t("Payout not sent yet", "Pencairan belum terkirim")}: ${errText(e)}`));
  }, [account, order, live, now, chainInfo, settleChain, refreshLive, t]);

  // The same rule for an account's order, carried out by the server: it checks the window on its
  // own clock (or the contract's), so asking early changes nothing.
  useEffect(() => {
    if (!account || !stored || stored.escrowStatus !== "LOCKED") return;
    const settledOnChain = !!live && (live.status === "Released" || live.status === "Refunded");
    const due = stored.chain
      ? settledOnChain || (!!live && live.status === "DisputeWindow" && !live.disputed && live.now > live.deadline)
      : phaseOf(stored, now) === "WINDOW_CLOSED";
    if (!due || now - releaseTried.current < 20_000) return;
    releaseTried.current = now;
    orderAction(stored.id, { action: "settle" })
      .then(() => {
        if (!settledOnChain)
          toast.success(
            stored.chain
              ? t("The window closed in silence. The contract paid the seller.", "Masa sengketa lewat tanpa klaim. Kontrak membayar penjual.")
              : t("The window closed in silence. The escrow released the payment to the seller.", "Masa sengketa lewat tanpa klaim. Escrow mencairkan pembayaran ke penjual.")
          );
        refreshOrder();
        refreshLive();
      })
      .catch((e) => {
        if (!(e instanceof OrderError && e.status === 409)) toast.error(`${t("Payout not sent yet", "Pencairan belum terkirim")}: ${errText(e)}`);
      });
  }, [account, stored, live, now, refreshOrder, refreshLive, t]);

  // Which files can back this particular claim, and how they read. The sample files are for the
  // sample personas and the demo accounts; any other account uploads a photo of its own.
  const evidenceOptions = useMemo(
    () => (order && reason ? mockEvidenceOptions(order, reason) : []),
    [order, reason]
  );
  const sampleFiles = !account || isDemoEmail(user?.email ?? "");
  const attachPhoto = async (file: File | undefined) => {
    if (!file || !order) return;
    setUploading(true);
    try {
      setEvidence(await uploadEvidence(order.id, file, reason === "NOT_AS_LISTED" ? "TICKET_PHOTO" : "SCANNER_PHOTO"));
    } catch (e) {
      toast.error(`${t("The photo was not read", "Foto gagal dibaca")}: ${errText(e)}`);
    } finally {
      setUploading(false);
      if (photoInput.current) photoInput.current.value = "";
    }
  };
  const check = useMemo(
    () => (order && reason ? checkEvidence(order, reason, evidence, new Date(now).toISOString()) : null),
    [order, reason, evidence, now]
  );

  if (account && !fetched && loadError) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-28 pb-16 text-center flex flex-col items-center gap-3">
        <p className="text-neutral-gray">{t("This ticket could not be loaded. Check your connection.", "Tiket ini gagal dimuat. Cek koneksimu.")}</p>
        <Button.Ghost className="text-sm" onClick={refreshOrder}>{t("Try again", "Coba lagi")}</Button.Ghost>
      </div>
    );
  }
  if (!ready || !mounted || (account && !fetched)) return <PageGate />;
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
  const endedAt = endedAtISO(order, now);
  const elapsed = Number.isFinite(left) ? Math.min(1, Math.max(0, 1 - left / windowMs(order))) : 0;
  const win = windowLabel(order);
  const onchain = order.chain;
  const canWrite = chainWritable(chainInfo);
  const filedReason = order.dispute ? reasonMeta(order.dispute.reason) : null;
  // A paid-out order's ticket file is deleted a month after the show (lib/retention.ts).
  const ticketGone = order.escrowStatus === "RELEASED" && !!order.eventEndsAtISO && isGone(ticketFileGoneAt(order.eventEndsAtISO), now);
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
  const submitDispute = async () => {
    if (!canSubmit || !reason) return;
    setShowDispute(false);
    setActing(true);
    try {
      if (account) {
        // The server files it, and on a chain order raises the flag in the contract as well. An
        // uploaded photo goes by its path: the server reads the file again rather than trust this page.
        await orderAction(
          order.id,
          evidence?.upload
            ? { action: "dispute", reason, note, evidencePath: evidence.upload.path, kind: evidence.kind }
            : { action: "dispute", reason, note, evidence: evidence?.fileName }
        );
        refreshOrder();
      } else {
        // On chain the dispute is a real flag that freezes the payout, sent by the operator for the buyer.
        if (onchain) await chainAction(onchain.listingId, "dispute");
        else await new Promise((r) => setTimeout(r, 1300));
        openDispute(order.id, { reason, note: { en: note, id: note }, evidence: evidence ?? undefined });
      }
      if (onchain) refreshLive();
      toast.success(t("Dispute filed. A Lummy arbiter will review your evidence.", "Sengketa diajukan. Arbiter Lummy akan meninjau buktimu."));
    } catch (e) {
      const what = onchain ? t("The contract refused the dispute", "Kontrak menolak sengketa") : t("The claim was not filed", "Klaim gagal diajukan");
      toast.error(`${what}: ${errText(e)}`);
    } finally {
      setActing(false);
    }
  };

  // The platform's own record of the handover: the first open is the one that counts.
  const openDoc = (which: "letter" | "sellerId") => {
    if (!account) return markDocsAccessed(order.id, which);
    if (order.docsAccessed?.[which === "letter" ? "letterAtISO" : "sellerIdAtISO"]) return;
    orderAction(order.id, { action: "docs", which }).then(refreshOrder, () => undefined);
  };

  // The organiser pulled the show: on chain that is an operator refund, allowed while the window is open.
  const cancelOnchain = async () => {
    if (!onchain) return;
    setActing(true);
    try {
      const r = await chainAction(onchain.listingId, "refund");
      settleChain(order.id, { escrowStatus: "REFUNDED", tx: r.tx, withdrawals: r.withdrawals, autoRefundReason: "EVENT_CANCELLED" });
      refreshLive();
      toast.success(t("Refunded on chain. The money is back with the buyer.", "Refund di chain. Dananya sudah kembali ke pembeli."));
    } catch (e) {
      toast.error(`${t("The contract refused the refund", "Kontrak menolak refund")}: ${errText(e)}`);
    } finally {
      setActing(false);
    }
  };

  // The show moved: the buyer may take the money back instead of keeping the ticket for the new date.
  const refundMoved = async () => {
    if (!optingOut) {
      setOptingOut(true);
      setTimeout(() => setOptingOut(false), 5000);
      return;
    }
    setOptingOut(false);
    if (!account) {
      refundPostponed(order.id);
      toast.success(t("Refunded. The escrow released it back to you.", "Dana dikembalikan. Escrow melepasnya balik ke kamu."));
      return;
    }
    setActing(true);
    try {
      await orderAction(order.id, { action: "postponed-refund" });
      await refreshOrder();
      toast.success(t("Refunded, fee included. The escrow released it back to you.", "Dana dikembalikan, termasuk biaya layanan. Escrow melepasnya balik ke kamu."));
    } catch (e) {
      toast.error(`${t("Not refunded", "Gagal direfund")}: ${errText(e)}`);
    } finally {
      setActing(false);
    }
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
          <Image src={order.eventImage} alt={order.eventTitle} fill sizes="80px" className="object-cover" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-neutral-black">{order.eventTitle}</h1>
          <p className="text-sm text-neutral-gray">{formatEventDate(order.eventDateISO)} · {order.tierName}{order.quantity > 1 ? ` · ${order.quantity} ${t("tickets", "tiket")}` : ""}</p>
          <p className="text-xs text-neutral-gray mt-0.5">{t("Seller", "Penjual")} {order.sellerName} · {t("Order", "Pesanan")} <span className="font-medium tracking-wide text-neutral-black">{order.id.toUpperCase()}</span></p>
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
              ? t(`Paid out to the seller. No dispute was filed within ${win.en}.`, `Sudah cair ke penjual. Tidak ada sengketa dalam ${win.id}.`)
              : t("Paid out to the seller after the arbiter reviewed the dispute.", "Cair ke penjual setelah arbiter meninjau sengketa."))}
            {phase === "REFUNDED" && (order.autoRefundReason === "EVENT_CANCELLED"
              ? t("Returned automatically when the organiser cancelled the show.", "Dikembalikan otomatis saat penyelenggara membatalkan acara.")
              : order.autoRefundReason === "EVENT_POSTPONED"
              ? t("Returned when you chose the money over the new date.", "Dikembalikan saat kamu memilih dana kembali, bukan tanggal baru.")
              : t("Returned to you after the arbiter reviewed the evidence.", "Dikembalikan ke kamu setelah arbiter meninjau bukti."))}
          </p>

          <div className="mt-6 mb-1">
            <EscrowSteps order={order} phase={phase} windowText={t(win.en, win.id)} />
          </div>

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
            <div data-postponed className="mt-4 rounded-2xl bg-secondary-gold-soft p-4">
              <div className="text-sm font-medium text-secondary-brown-dark flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {t("Event postponed", "Acara diundur")}
              </div>
              {account && (
                <div className="text-xs font-medium text-secondary-brown-dark mt-1">
                  {t(`New date: ${formatEventDate(order.eventDateISO)}`, `Tanggal baru: ${formatEventDate(order.eventDateISO)}`)}
                </div>
              )}
              <p className="text-xs text-secondary-brown-dark/90 mt-1.5 leading-relaxed">
                {t(
                  "Your ticket stays valid for the new date and the escrow holds until then. If the new date does not work for you, take the money back instead, fee included, until the show starts. No arbiter needed either way.",
                  "Tiketmu tetap berlaku untuk tanggal baru dan escrow menahan dananya sampai saat itu. Kalau tanggal barunya tidak cocok, ambil uangmu kembali, termasuk biaya layanan, selama acaranya belum mulai. Dua-duanya tidak perlu arbiter."
                )}
              </p>
              {canRefundPostponed(order, now) && !(onchain && !account) && (
                <button
                  data-postponed-refund
                  disabled={acting}
                  onClick={() => void refundMoved()}
                  className="mt-2.5 text-xs font-medium text-primary-navy hover:opacity-80 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {acting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {optingOut
                    ? t("Press again: the ticket goes back to the seller", "Tekan lagi: tiketnya kembali ke penjual")
                    : t("New date does not work, refund me", "Tanggal baru gak cocok, kembalikan dana")}
                </button>
              )}
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
                {account && order.dispute.evidence?.upload && <EvidencePhoto orderId={order.id} side="buyer" evidence={order.dispute.evidence} decidedAtISO={order.dispute.verdict?.decidedAtISO} />}
                {filedCheck?.checks.map((c) => <CheckRow key={c.label.en} ok={c.ok} unknown={c.unknown} label={t(c.label.en, c.label.id)} detail={t(c.detail.en, c.detail.id)} />)}
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
                    {account && r.evidence?.upload && <EvidencePhoto orderId={order.id} side={r.fromSeller ? "seller" : "buyer"} evidence={r.evidence} decidedAtISO={order.dispute?.verdict?.decidedAtISO} />}
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
          {showProof && onchain && (
            <div className="mt-3">
              <div className="bg-secondary-blue-extra rounded-2xl p-4">
                <ChainRow label={t("Escrow contract", "Kontrak escrow")} value={shortHash(onchain.escrow)} href={explorerAddr(onchain.escrow)} onCopy={() => copy(onchain.escrow)} />
                <ChainRow label={t("Status on chain", "Status di kontrak")} value={(live?.status ?? onchain.status ?? "…") + (live?.disputed ? t(", disputed", ", disengketakan") : "")} />
                <ChainRow label={t("Locked in the contract", "Terkunci di kontrak")} value={t(`${usdcText(onchain.price)} (testnet)`, `${usdcText(onchain.price)} (testnet)`)} />
                <ChainRow label={t("Listing tx", "Tx listing")} value={shortHash(onchain.txs.create)} href={explorerTx(onchain.txs.create)} onCopy={() => copy(onchain.txs.create)} />
                <ChainRow label={t("Funding tx", "Tx dana dikunci")} value={shortHash(onchain.txs.fund)} href={explorerTx(onchain.txs.fund)} onCopy={() => copy(onchain.txs.fund)} />
                <ChainRow label={t("Handover proof tx", "Tx bukti serah terima")} value={shortHash(onchain.txs.handover)} href={explorerTx(onchain.txs.handover)} onCopy={() => copy(onchain.txs.handover)} />
                {onchain.txs.settle && (
                  <ChainRow label={order.escrowStatus === "RELEASED" ? t("Release tx", "Tx pencairan") : t("Refund tx", "Tx refund")} value={shortHash(onchain.txs.settle)} href={explorerTx(onchain.txs.settle)} onCopy={() => copy(onchain.txs.settle!)} />
                )}
                {(onchain.txs.withdrawals ?? []).map((w) => (
                  <ChainRow key={w} label={t("Payout tx", "Tx kirim dana")} value={shortHash(w)} href={explorerTx(w)} onCopy={() => copy(w)} />
                ))}
                <ChainRow label={t("Release condition", "Syarat pencairan")} value={t(`Event end + ${win.en}`, `Acara selesai + ${win.id}`)} />
                <ChainRow label={t("Network", "Jaringan")} value="Arbitrum Sepolia (421614)" />
              </div>
              <p className="flex items-center gap-1.5 text-xs text-neutral-gray mt-3">
                <ShieldCheck className="w-3.5 h-3.5 text-secondary-green-dark" /> {t("Do not take our word for it, read the contract.", "Jangan percaya kami, baca kontraknya sendiri.")}
              </p>
            </div>
          )}
          {showProof && !onchain && (
            <div className="mt-3 rounded-2xl bg-secondary-blue-extra p-4 text-xs text-neutral-gray leading-relaxed">
              {account
                ? t(
                    "The payment for this order was simulated, so nothing is locked on chain. Orders placed with the chain mode on are real escrows in the contract below, on Arbitrum Sepolia.",
                    "Pembayaran pesanan ini simulasi, jadi tidak ada yang dikunci di chain. Pesanan yang dibuat dengan mode chain aktif jadi escrow sungguhan di kontrak berikut, di Arbitrum Sepolia."
                  )
                : t(
                    "This is a sample order, so it has no transactions on chain. Orders placed with the chain mode on are real escrows in the contract below, on Arbitrum Sepolia.",
                    "Ini pesanan contoh, jadi tidak punya transaksi di chain. Pesanan yang dibuat dengan mode chain aktif jadi escrow sungguhan di kontrak berikut, di Arbitrum Sepolia."
                  )}
              {LIVE_ESCROW && (
                <a href={explorerAddr(LIVE_ESCROW)} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-1.5 font-mono text-primary-navy">
                  {shortHash(LIVE_ESCROW)} <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )}

          {/* History: a chain order reads it from the contract's events, anything else from our records. */}
          {onchain && history ? (
            <div className="mt-5">
              <EscrowTimeline history={history} live={live} />
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                <Link href={`/proof/${onchain.listingId}`} className="inline-flex items-center gap-1.5 text-primary-navy font-medium hover:opacity-80">
                  <ShieldCheck className="w-3.5 h-3.5" /> {t("Open the public proof page", "Buka halaman bukti publik")}
                </Link>
                <button
                  onClick={() => copy(`${window.location.origin}/proof/${onchain.listingId}`)}
                  className="inline-flex items-center gap-1.5 text-neutral-gray hover:text-primary-navy cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" /> {t("Copy the link to share", "Salin tautan untuk dibagikan")}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-5">
              <div className="text-xs text-neutral-gray mb-2">{t("History", "Riwayat")}</div>
              <ol className="relative border-l-2 border-dashed border-neutral-light-gray-1 ml-1.5 flex flex-col gap-4">
                <li className="pl-4 relative">
                  <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-lummy-500 border-2 border-neutral-white" />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-neutral-black">{t("Funds locked in escrow", "Dana dikunci di escrow")}</span>
                    {showProof && onchain && <a href={explorerTx(onchain.txs.fund)} target="_blank" rel="noreferrer" className="text-xs text-primary-navy flex items-center gap-1 shrink-0">{shortHash(onchain.txs.fund, 4)} <ExternalLink className="w-3 h-3" /></a>}
                  </div>
                  <span className="text-xs text-neutral-gray">{formatDateTime(order.createdAtISO)}</span>
                </li>
                {endedAt && (
                  <li className="pl-4 relative">
                    <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-lummy-500 border-2 border-neutral-white" />
                    <span className="text-sm text-neutral-black">{t(`Event finished, ${win.en} window opened`, `Acara selesai, masa sengketa ${win.id} dibuka`)}</span>
                    <span className="block text-xs text-neutral-gray">{formatDateTime(endedAt)}</span>
                  </li>
                )}
                {order.dispute && (
                  <li className="pl-4 relative">
                    <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-secondary-orange-dark border-2 border-neutral-white" />
                    <span className="text-sm text-neutral-black">{t("Dispute filed with evidence", "Sengketa diajukan dengan bukti")}</span>
                    <span className="block text-xs text-neutral-gray">{formatDateTime(order.dispute.openedAtISO)}</span>
                  </li>
                )}
                {order.escrowStatus === "RELEASED" || order.escrowStatus === "REFUNDED" ? (
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
                      {showProof && onchain?.txs.settle && <a href={explorerTx(onchain.txs.settle)} target="_blank" rel="noreferrer" className="text-xs text-primary-navy flex items-center gap-1 shrink-0">{shortHash(onchain.txs.settle, 4)} <ExternalLink className="w-3 h-3" /></a>}
                    </div>
                  </li>
                ) : (
                  <li className="pl-4 relative">
                    <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-neutral-light-gray-1 border-2 border-neutral-white" />
                    <span className="text-sm text-neutral-gray">
                      {deadline
                        ? t(`Auto-release at ${formatDateTime(deadline)}`, `Cair otomatis pada ${formatDateTime(deadline)}`)
                        : t(`Waiting for the event, then ${win.en}`, `Menunggu acara, lalu ${win.id}`)}
                    </span>
                  </li>
                )}
              </ol>
            </div>
          )}

          {/* A claim is possible from purchase onwards, because a seller can fail
              you long before the gate does. What differs is the proof it needs. */}
          {canFileDispute(order, now) && (phase === "PRE_EVENT" ? (
            <Button.Ghost tone="warning" className="mt-5 w-full text-sm" onClick={() => setShowDispute(true)}>
              <AlertTriangle className="w-4 h-4" /> {t("Problem with this ticket?", "Ada masalah dengan tiket ini?")}
            </Button.Ghost>
          ) : (
            <button
              onClick={() => setShowDispute(true)}
              className="mt-5 w-full px-4 py-3.5 rounded-2xl border-2 border-secondary-orange-dark bg-secondary-orange-soft text-secondary-orange-dark font-fredoka font-medium hover:bg-secondary-orange-dark hover:text-white transition cursor-pointer flex items-center justify-center gap-2"
            >
              <AlertTriangle className="w-4 h-4" /> {t("Something went wrong at the gate", "Ada masalah di gate")}
            </button>
          ))}

          {/* On chain there is no clock to bend: the contract's own window decides. */}
          {onchain && order.escrowStatus === "LOCKED" && (
            <div className="mt-5 rounded-2xl border-2 border-dashed border-neutral-light-gray-1 p-4">
              <div className="text-xs font-semibold text-neutral-gray flex items-center gap-1.5 mb-1">
                <ShieldCheck className="w-3.5 h-3.5 text-secondary-green-dark" /> {t("Real escrow on Arbitrum Sepolia", "Escrow sungguhan di Arbitrum Sepolia")}
              </div>
              <p className="text-xs text-neutral-gray mb-3">
                {t(
                  `No shortcuts here: the contract's clock decides. The payout goes out ${win.en} after the later of the show ending and the handover.`,
                  `Tidak ada jalan pintas: jam kontrak yang menentukan. Dana cair ${win.id} setelah yang terakhir dari acara selesai dan serah terima.`
                )}
              </p>
              {/* Sample orders only: an account's order is cancelled from the event, not from this page. */}
              {canWrite && !account && (
                <button onClick={cancelOnchain} className="w-full px-3 py-2 rounded-xl border border-neutral-light-gray-1 text-xs text-neutral-black hover:border-lummy-500 transition cursor-pointer">
                  {t("Organiser cancels (refund on chain)", "Penyelenggara membatalkan (refund di chain)")}
                </button>
              )}
            </div>
          )}

          {/* Simulation controls, clearly separated from the product surface. Sample orders only:
              an account's order runs on the real schedule. */}
          {order.escrowStatus === "LOCKED" && !onchain && !account && (
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
            <h2 className="font-fredoka font-semibold text-lg text-neutral-black mb-3">{t("Handover documents", "Dokumen serah-terima")}</h2>
            {/* The ticket itself, the PDF the seller uploaded. Opening it is logged by the server. */}
            {account && order.ticketFile && (
              order.escrowStatus === "REFUNDED" || ticketGone ? (
                <div data-ticket-file="closed" className="mb-3 w-full flex items-center gap-3 p-3 rounded-2xl border border-neutral-light-gray-1 bg-secondary-gray-soft/60">
                  <span className="w-10 h-10 rounded-xl bg-secondary-gray-soft text-neutral-gray grid place-items-center shrink-0"><Ticket className="w-5 h-5" /></span>
                  <div>
                    <div className="text-sm font-medium text-neutral-gray">{t("Your ticket (PDF)", "Tiketmu (PDF)")}</div>
                    <div className="text-xs text-neutral-gray">
                      {order.escrowStatus === "REFUNDED"
                        ? t("Closed: the order was refunded", "Ditutup: pesanan sudah direfund")
                        : t(
                            `Deleted ${TICKET_RETENTION_DAYS} days after the show, since it carried personal data`,
                            `Dihapus ${TICKET_RETENTION_DAYS} hari setelah acara, karena memuat data pribadi`
                          )}
                    </div>
                  </div>
                </div>
              ) : (
                <a
                  data-ticket-file="open"
                  href={`/api/orders/${encodeURIComponent(order.id)}/ticket`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => window.setTimeout(refreshOrder, 2000)}
                  className="mb-3 w-full flex items-center gap-3 p-3 rounded-2xl border-2 border-primary-navy hover:bg-secondary-blue-extra transition text-left"
                >
                  <span className="w-10 h-10 rounded-xl bg-secondary-blue-soft text-primary-navy grid place-items-center shrink-0"><Ticket className="w-5 h-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-neutral-black">{t("Your ticket (PDF)", "Tiketmu (PDF)")}</div>
                    <div className="text-xs text-neutral-gray">
                      {order.docsAccessed?.ticketAtISO
                        ? t(`Downloaded ${formatDateTime(order.docsAccessed.ticketAtISO)}`, `Diunduh ${formatDateTime(order.docsAccessed.ticketAtISO)}`)
                        : t("The file the seller uploaded. Download it before the show.", "File yang diupload penjual. Unduh sebelum acara.")}
                    </div>
                  </div>
                  <Download className="w-4 h-4 text-primary-navy shrink-0" />
                </a>
              )
            )}
            <button onClick={() => { setShowKuasa(true); openDoc("letter"); }} className="w-full flex items-center gap-3 p-3 rounded-2xl border border-neutral-light-gray-1 hover:border-lummy-500 transition cursor-pointer text-left">
              <span className="w-10 h-10 rounded-xl bg-secondary-blue-soft text-lummy-500 grid place-items-center shrink-0"><FileText className="w-5 h-5" /></span>
              <div>
                <div className="text-sm font-medium text-neutral-black">{t("Letter of authorisation", "Surat kuasa")}</div>
                <div className="text-xs text-neutral-gray">{t("Print-ready, e-stamped and e-signed", "Siap print, ber-e-materai dan TTE")}</div>
              </div>
            </button>
            {order.gateKtp && (
              <button onClick={() => { setShowKtp(true); openDoc("sellerId"); }} className="mt-3 w-full flex items-center gap-3 p-3 rounded-2xl border border-neutral-light-gray-1 hover:border-lummy-500 transition cursor-pointer text-left">
                <span className="w-10 h-10 rounded-xl bg-secondary-pink-soft text-secondary-pink-dark grid place-items-center shrink-0"><CreditCard className="w-5 h-5" /></span>
                <div>
                  <div className="text-sm font-medium text-neutral-black">{t("Seller ID card (gate check)", "Foto KTP penjual (cek gate)")}</div>
                  <div className="text-xs text-neutral-gray">{ktpOpen ? t("Unlocked, view-only", "Terbuka, hanya bisa dilihat") : t("Unlocks when you are at the gate", "Terbuka saat kamu di gate")}</div>
                </div>
              </button>
            )}
          </div>
          {/* Settlement rules: the policy that makes the guarantee credible */}
          <div className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5">
            <h2 className="font-fredoka font-semibold text-lg text-neutral-black mb-3">{t("How this order settles", "Cara pesanan ini selesai")}</h2>
            <ul className="flex flex-col gap-3 text-sm text-neutral-gray leading-relaxed">
              <li className="flex gap-2.5">
                <Clock className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
                <span>{t(
                  "The clock settles it, not a button. There is no \"I got in\" confirmation to fake.",
                  "Yang menentukan itu waktu, bukan tombol. Tidak ada konfirmasi \"aku sudah masuk\" yang bisa dipalsukan."
                )}</span>
              </li>
              <li className="flex gap-2.5">
                <Gavel className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
                <span>{t(
                  "A refund is a claim with proof from the gate, decided by an arbiter.",
                  "Refund itu klaim dengan bukti dari gate, diputus arbiter."
                )}</span>
              </li>
              <li className="flex gap-2.5">
                <Repeat className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
                <span>
                  {t("Not attending is not a refund.", "Gak jadi datang bukan alasan refund.")}{" "}
                  <Link href="/sell" className="text-primary-navy font-medium">{t("Relist it", "Jual lagi")}</Link>{" "}
                  {t("before the show instead.", "sebelum acara berlangsung.")}
                </span>
              </li>
            </ul>
            <div className="mt-4 pt-3 border-t border-dashed border-neutral-light-gray-1 text-xs text-neutral-gray">
              {t("Order", "Pesanan")} <span className="font-medium tracking-wide text-neutral-black">{order.id.toUpperCase()}</span> · {t("placed", "dibuat")} {formatDateTime(order.createdAtISO)}
            </div>
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
              ? t(`${win.en} after the show`, `${win.id} setelah acara`)
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
              {needsFile && account && (
                <>
                  <input
                    ref={photoInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    onChange={(e) => void attachPhoto(e.target.files?.[0])}
                  />
                  <button
                    data-evidence-upload
                    onClick={() => photoInput.current?.click()}
                    disabled={uploading}
                    className={`w-full flex items-center gap-2 p-3 rounded-xl border-2 border-dashed text-left transition cursor-pointer ${evidence?.upload ? "border-lummy-500 bg-secondary-blue-light" : "border-lummy-500 hover:bg-secondary-blue-light"}`}
                  >
                    {uploading ? <Loader2 className="w-4 h-4 shrink-0 animate-spin text-lummy-500" /> : <Camera className="w-4 h-4 shrink-0 text-lummy-500" />}
                    <span className="text-sm text-neutral-black">
                      {uploading
                        ? t("Reading the photo...", "Membaca foto...")
                        : evidence?.upload
                          ? t("Use another photo", "Pakai foto lain")
                          : t("Upload your photo", "Upload fotomu")}
                    </span>
                  </button>
                  <p className="text-[11px] text-neutral-gray leading-relaxed">
                    {t(
                      "Straight from your camera roll is best: the time it was taken, and your ticket's code if it is in the picture, are read from the photo. Only the seller and our arbiter can open it.",
                      "Paling baik langsung dari galeri: waktu pengambilan, dan kode tiketmu kalau ada di foto, dibaca dari fotonya. Cuma penjual dan arbiter kami yang bisa membukanya."
                    )}
                  </p>
                  {evidence?.upload && <EvidencePhoto orderId={order.id} side="buyer" evidence={evidence} link={false} />}
                </>
              )}
              {needsFile && sampleFiles && account && (
                <span className="text-[11px] text-neutral-gray mt-1">{t("Or a sample file (demo account):", "Atau file contoh (akun demo):")}</span>
              )}
              {needsFile && sampleFiles && evidenceOptions.map((ev) => (
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

            {check && (!needsFile || evidence) && (
              <div className="mt-3 rounded-2xl border border-neutral-light-gray-1 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-neutral-black mb-1">
                  <MapPin className="w-3.5 h-3.5 text-neutral-gray" />{" "}
                  {!needsFile ? t("Our records", "Catatan kami") : evidence?.upload ? t("Read from your photo", "Dibaca dari fotomu") : t("File metadata", "Metadata file")}
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${check.strength === "STRONG" ? "bg-secondary-green-soft text-secondary-green-dark" : "bg-secondary-pink-soft text-secondary-pink-dark"}`}>
                    {check.strength}
                  </span>
                </div>
                {check.checks.map((c) => <CheckRow key={c.label.en} ok={c.ok} unknown={c.unknown} label={t(c.label.en, c.label.id)} detail={t(c.detail.en, c.detail.id)} />)}
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
                {evidence?.upload && (
                  <>
                    {" "}
                    {t("I agree that my photo, with when and where it was taken, is shown to the seller and staff and kept as described in the ", "Saya setuju foto saya, dengan waktu dan lokasi pengambilannya, ditunjukkan ke penjual dan staf dan disimpan seperti dijelaskan di ")}
                    <Link href="/privacy" target="_blank" className="text-primary-navy font-medium">{t("privacy policy", "kebijakan privasi")}</Link>.
                  </>
                )}
              </span>
            </label>
          </>
        )}

        <div className="flex gap-3 mt-5">
          <Button.Ghost className="flex-1 text-sm" onClick={() => setShowDispute(false)}>{t("Cancel", "Batal")}</Button.Ghost>
          <Button.Primary wrapperClass="flex-1" className="w-full text-sm" disabled={!canSubmit} onClick={submitDispute}>{t("File dispute", "Kirim sengketa")}</Button.Primary>
        </div>
      </Modal>

      <Modal open={acting} onClose={() => {}}>
        <div className="flex flex-col items-center gap-3 py-4">
          <Loader2 className="w-8 h-8 text-lummy-500 animate-spin" />
          <p className="font-fredoka font-semibold text-neutral-black">
            {onchain ? t("Sending transaction...", "Mengirim transaksi...") : t("Updating your order...", "Memperbarui pesanan...")}
          </p>
          <p className="text-sm text-neutral-gray">{t("One moment.", "Sebentar.")}</p>
        </div>
      </Modal>
    </PageContainer>
  );
}
