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
import { SubId } from "@/components/common/Bilingual";
import { EscrowStatusPill } from "@/components/common/EscrowStatusPill";
import { PageContainer } from "@/components/layout/PageContainer";
import {
  useOrders, useUser, formatIDR, formatEventDate, formatDateTime, explorerTx, explorerAddr, shortHash,
  phaseOf, msUntilRelease, formatCountdown, disputeDeadlineISO, checkEvidence, mockEvidenceOptions,
  DISPUTE_REASONS, DISPUTE_WINDOW_H, reasonMeta,
  type DisputeEvidence, type DisputeReason,
} from "@/lib/mock";

function ChainRow({ label, value, href, onCopy }: { label: string; value: string; href?: string; onCopy?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-dashed border-neutral-light-gray-1 last:border-0">
      <span className="text-xs text-neutral-gray shrink-0">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-xs text-neutral-black truncate">{value}</span>
        {onCopy && <button onClick={onCopy} aria-label="Copy" className="text-neutral-gray hover:text-primary-navy cursor-pointer shrink-0"><Copy className="w-3.5 h-3.5" /></button>}
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
  const { id } = useParams<{ id: string }>();
  const order = useOrders((s) => s.orders.find((o) => o.id === id));
  const markEventFinished = useOrders((s) => s.markEventFinished);
  const fastForwardWindow = useOrders((s) => s.fastForwardWindow);
  const sweepAutoRelease = useOrders((s) => s.sweepAutoRelease);
  const openDispute = useOrders((s) => s.openDispute);
  const user = useUser((s) => s.user);

  const [mounted, setMounted] = useState(false);
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

  useEffect(() => setMounted(true), []);

  // One ticking clock drives the countdown and the automatic payout, so the
  // page never shows a window that has silently expired.
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      sweepAutoRelease();
    }, 1000);
    return () => clearInterval(t);
  }, [sweepAutoRelease]);

  const evidenceOptions = useMemo(() => (order ? mockEvidenceOptions(order) : []), [order]);
  const check = useMemo(
    () => (order && evidence ? checkEvidence(order, evidence, new Date(now).toISOString()) : null),
    [order, evidence, now]
  );

  if (!mounted) return <div className="pt-28 pb-16 text-center text-neutral-gray">Loading...</div>;
  if (!order) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-28 pb-16 text-center">
        <p className="text-neutral-gray">Ticket not found.</p>
        <Link href="/tickets" className="text-primary-navy font-medium">Back to my tickets</Link>
      </div>
    );
  }

  const phase = phaseOf(order, now);
  const left = msUntilRelease(order, now);
  const deadline = disputeDeadlineISO(order);
  const elapsed = Number.isFinite(left) ? Math.min(1, Math.max(0, 1 - left / (DISPUTE_WINDOW_H * 3_600_000))) : 0;
  const filedReason = order.dispute ? reasonMeta(order.dispute.reason) : null;
  const filedCheck = order.dispute ? checkEvidence(order, order.dispute.evidence, order.dispute.openedAtISO) : null;

  const copy = (t: string) => { navigator.clipboard?.writeText(t); toast.success("Copied"); };

  const finishEvent = () => {
    setActing(true);
    setTimeout(() => {
      markEventFinished(order.id);
      setActing(false);
      toast.success("Event marked as finished. The 48h dispute window is now running.");
    }, 900);
  };
  const skipWindow = () => {
    setActing(true);
    setTimeout(() => {
      fastForwardWindow(order.id);
      sweepAutoRelease();
      setActing(false);
      toast.success("Window elapsed. The escrow paid the seller automatically.");
    }, 900);
  };

  const eligible = reason ? reasonMeta(reason).eligible : false;
  const canSubmit = eligible && !!evidence && attested;
  const submitDispute = () => {
    if (!canSubmit || !reason || !evidence) return;
    setShowDispute(false);
    setActing(true);
    setTimeout(() => {
      openDispute(order.id, { reason, note, evidence });
      setActing(false);
      toast.success("Dispute filed. A Lummy arbiter will review your evidence.");
    }, 1300);
  };

  const watermark = `${user?.name ?? "Buyer"} · ${new Date().toLocaleDateString("en-GB")} · Lummy`;

  return (
    <PageContainer width="app">
      <Link href="/tickets" className="inline-flex items-center gap-1 text-neutral-gray hover:text-primary-navy text-sm mb-4">
        <ArrowLeft className="w-4 h-4" /> My tickets
      </Link>

      {/* Event header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-lummy-500 shrink-0">
          <Image src={order.eventImage} alt={order.eventTitle} fill className="object-cover" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-neutral-black">{order.eventTitle}</h1>
          <p className="text-sm text-neutral-gray">{formatEventDate(order.eventDateISO)} · {order.tierName}{order.quantity > 1 ? ` · ${order.quantity} tickets` : ""}</p>
          <p className="text-xs text-neutral-gray mt-0.5">Seller {order.sellerName} · Order <span className="font-mono">{order.id}</span></p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        {/* Escrow */}
        <div className="bg-neutral-white rounded-3xl border border-lummy-500 p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <span className="font-fredoka font-semibold text-neutral-black flex items-center gap-2">
              <Lock className="w-5 h-5 text-lummy-500" /> Escrow
            </span>
            <EscrowStatusPill phase={phase} />
          </div>

          <div className="font-fredoka font-bold text-3xl text-neutral-black mb-1">{formatIDR(order.amount)}</div>
          <p className="text-sm text-neutral-gray">
            {phase === "PRE_EVENT" && "Held until the show is over. Not in our account, and not in the seller's."}
            {phase === "WINDOW_OPEN" && "The show is over. Funds stay locked while the dispute window runs."}
            {phase === "WINDOW_CLOSED" && "The window has elapsed. Releasing to the seller."}
            {phase === "IN_REVIEW" && "Frozen while an arbiter reviews the dispute. Nothing moves until there is a verdict."}
            {phase === "RELEASED" && (order.autoReleased
              ? "Paid out to the seller. No dispute was filed within 48 hours."
              : "Paid out to the seller after the arbiter reviewed the dispute.")}
            {phase === "REFUNDED" && "Returned to you in full after the arbiter reviewed the evidence."}
          </p>

          {/* Live countdown while the window runs */}
          {phase === "WINDOW_OPEN" && (
            <div className="mt-4 rounded-2xl border-2 border-secondary-gold-dark/40 bg-secondary-gold-soft p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-xs font-medium text-secondary-brown-dark flex items-center gap-1.5">
                  <Timer className="w-4 h-4" /> Auto-releases to the seller in
                </span>
                <span className="font-mono font-bold text-lg text-neutral-black tabular-nums">{formatCountdown(left)}</span>
              </div>
              <div className="mt-2.5 h-1.5 rounded-full bg-neutral-white overflow-hidden">
                <div className="h-full bg-secondary-brown-dark/70 transition-all" style={{ width: `${elapsed * 100}%` }} />
              </div>
              <p className="text-xs text-secondary-brown-dark/90 mt-2.5 leading-relaxed">
                Staying silent counts as a valid handover, so the payout goes through on its own.
                <SubId className="text-secondary-brown-dark/70 mt-0.5">Diam = beres. Dana cair sendiri ke penjual.</SubId>
              </p>
            </div>
          )}

          {/* Settlement rules: the policy that makes the guarantee credible */}
          <div className="mt-5 rounded-2xl bg-secondary-blue-extra border border-neutral-light-gray-1 p-4">
            <div className="text-xs font-semibold text-neutral-black mb-2.5">How settlement works</div>
            <ul className="flex flex-col gap-2.5 text-xs text-neutral-gray leading-relaxed">
              <li className="flex gap-2">
                <Clock className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
                <span>The clock settles this, not a button. There is no &quot;I got in&quot; confirmation to fake.
                  <SubId className="mt-0.5">Pencairan dipicu waktu, bukan konfirmasi.</SubId>
                </span>
              </li>
              <li className="flex gap-2">
                <Gavel className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
                <span>A refund is a dispute with gate-time proof, reviewed by an arbiter. Never self-serve.
                  <SubId className="mt-0.5">Refund = sengketa + bukti di gate, diputus admin.</SubId>
                </span>
              </li>
              <li className="flex gap-2">
                <Repeat className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
                <span>Not attending is not a refund. <Link href="/sell" className="text-primary-navy font-medium">Relist it</Link> before the show instead.
                  <SubId className="mt-0.5">Gak jadi dateng bukan alasan refund, jual lagi sebelum acara.</SubId>
                </span>
              </li>
            </ul>
          </div>

          {/* Filed dispute + the automated read on its evidence */}
          {order.dispute && (
            <div className="mt-5 rounded-2xl border border-neutral-light-gray-1 overflow-hidden">
              <div className="bg-secondary-orange-soft px-4 py-3">
                <div className="text-sm font-medium text-secondary-orange-dark flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {filedReason?.label}
                </div>
                <div className="text-xs text-secondary-orange-dark/80 mt-1">Filed {formatDateTime(order.dispute.openedAtISO)}</div>
              </div>
              <div className="p-4">
                {order.dispute.note && <p className="text-xs text-neutral-gray italic mb-3">&ldquo;{order.dispute.note}&rdquo;</p>}
                <div className="flex items-center gap-2 text-xs text-neutral-black mb-2">
                  <Paperclip className="w-3.5 h-3.5 text-neutral-gray shrink-0" />
                  <span className="font-mono truncate">{order.dispute.evidence.fileName}</span>
                  <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${filedCheck?.strength === "STRONG" ? "bg-secondary-green-soft text-secondary-green-dark" : "bg-secondary-pink-soft text-secondary-pink-dark"}`}>
                    {filedCheck?.strength === "STRONG" ? "STRONG" : "WEAK"}
                  </span>
                </div>
                {filedCheck?.checks.map((c) => <CheckRow key={c.label} {...c} />)}
                {order.dispute.verdict && (
                  <div className="mt-3 pt-3 border-t border-dashed border-neutral-light-gray-1">
                    <div className="text-xs font-semibold text-neutral-black flex items-center gap-1.5">
                      <Gavel className="w-3.5 h-3.5" /> Verdict: {order.dispute.verdict.toSeller ? "released to seller" : "refunded to buyer"}
                    </div>
                    <p className="text-xs text-neutral-gray mt-1">{order.dispute.verdict.rationale}</p>
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
            <ShieldCheck className="w-3.5 h-3.5" /> {showProof ? "Hide technical details" : "Verify it yourself on-chain"}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showProof ? "rotate-180" : ""}`} />
          </button>
          {showProof && (
            <div className="mt-3">
              <div className="bg-secondary-blue-extra rounded-2xl p-4">
                <ChainRow label="Escrow contract" value={shortHash(order.contractAddress)} href={explorerAddr(order.contractAddress)} onCopy={() => copy(order.contractAddress)} />
                <ChainRow label="Funding tx" value={shortHash(order.fundTxHash)} href={explorerTx(order.fundTxHash)} onCopy={() => copy(order.fundTxHash)} />
                {order.settleTxHash && (
                  <ChainRow label={order.escrowStatus === "RELEASED" ? "Release tx" : "Refund tx"} value={shortHash(order.settleTxHash)} href={explorerTx(order.settleTxHash)} onCopy={() => copy(order.settleTxHash!)} />
                )}
                <ChainRow label="Release condition" value={`Event end + ${DISPUTE_WINDOW_H}h`} />
                <ChainRow label="Network" value="Monad testnet (10143)" />
              </div>
              <p className="flex items-center gap-1.5 text-xs text-neutral-gray mt-3">
                <ShieldCheck className="w-3.5 h-3.5 text-secondary-green-dark" /> Do not take our word for it, read the contract.
              </p>
            </div>
          )}

          {/* History */}
          <div className="mt-5">
            <div className="text-xs text-neutral-gray mb-2">History</div>
            <ol className="relative border-l-2 border-dashed border-neutral-light-gray-1 ml-1.5 flex flex-col gap-4">
              <li className="pl-4 relative">
                <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-lummy-500 border-2 border-neutral-white" />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-neutral-black">Funds locked in escrow</span>
                  {showProof && <a href={explorerTx(order.fundTxHash)} target="_blank" rel="noreferrer" className="text-xs text-primary-navy flex items-center gap-1 shrink-0">{shortHash(order.fundTxHash, 4)} <ExternalLink className="w-3 h-3" /></a>}
                </div>
                <span className="text-xs text-neutral-gray">{formatDateTime(order.createdAtISO)}</span>
              </li>
              {order.eventEndedAtISO && (
                <li className="pl-4 relative">
                  <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-lummy-500 border-2 border-neutral-white" />
                  <span className="text-sm text-neutral-black">Event finished, {DISPUTE_WINDOW_H}h window opened</span>
                  <span className="block text-xs text-neutral-gray">{formatDateTime(order.eventEndedAtISO)}</span>
                </li>
              )}
              {order.dispute && (
                <li className="pl-4 relative">
                  <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-secondary-orange-dark border-2 border-neutral-white" />
                  <span className="text-sm text-neutral-black">Dispute filed with evidence</span>
                  <span className="block text-xs text-neutral-gray">{formatDateTime(order.dispute.openedAtISO)}</span>
                </li>
              )}
              {order.settleTxHash ? (
                <li className="pl-4 relative">
                  <span className={`absolute -left-[7px] top-1 w-3 h-3 rounded-full border-2 border-neutral-white ${order.escrowStatus === "RELEASED" ? "bg-secondary-green-dark" : "bg-neutral-gray"}`} />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-neutral-black">
                      {order.escrowStatus === "RELEASED"
                        ? order.autoReleased ? "Auto-released to seller" : "Released to seller by verdict"
                        : "Refunded to buyer"}
                    </span>
                    {showProof && <a href={explorerTx(order.settleTxHash)} target="_blank" rel="noreferrer" className="text-xs text-primary-navy flex items-center gap-1 shrink-0">{shortHash(order.settleTxHash, 4)} <ExternalLink className="w-3 h-3" /></a>}
                  </div>
                </li>
              ) : (
                <li className="pl-4 relative">
                  <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-neutral-light-gray-1 border-2 border-neutral-white" />
                  <span className="text-sm text-neutral-gray">
                    {deadline ? `Auto-release at ${formatDateTime(deadline)}` : `Waiting for the event, then ${DISPUTE_WINDOW_H}h`}
                  </span>
                </li>
              )}
            </ol>
          </div>

          {/* Buyer action: only inside the window, and only as a dispute */}
          {phase === "WINDOW_OPEN" && (
            <button
              onClick={() => setShowDispute(true)}
              className="mt-5 w-full px-4 py-3 rounded-2xl border-2 border-secondary-orange-dark text-secondary-orange-dark text-sm font-medium hover:bg-secondary-orange-soft transition cursor-pointer flex items-center justify-center gap-2"
            >
              <AlertTriangle className="w-4 h-4" /> Something went wrong at the gate
            </button>
          )}
          {phase === "PRE_EVENT" && (
            <p className="mt-5 text-xs text-neutral-gray flex gap-2">
              <Lock className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
              <span>Disputes open once the show is over. Nothing to do until then.
                <SubId className="mt-0.5">Sengketa baru bisa diajukan setelah acara selesai.</SubId>
              </span>
            </p>
          )}

          {/* Simulation controls, clearly separated from the product surface */}
          {order.escrowStatus === "LOCKED" && (
            <div className="mt-5 rounded-2xl border-2 border-dashed border-neutral-light-gray-1 p-4">
              <div className="text-xs font-semibold text-neutral-gray flex items-center gap-1.5 mb-1">
                <FlaskConical className="w-3.5 h-3.5 text-secondary-pink-dark" /> Prototype controls
              </div>
              <p className="text-xs text-neutral-gray mb-3">
                In production these come from the event schedule and the contract clock.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                {!order.eventEndedAtISO && (
                  <button onClick={finishEvent} className="flex-1 px-3 py-2 rounded-xl border border-neutral-light-gray-1 text-xs text-neutral-black hover:border-lummy-500 transition cursor-pointer">
                    Mark event as finished
                  </button>
                )}
                <button onClick={skipWindow} className="flex-1 px-3 py-2 rounded-xl border border-neutral-light-gray-1 text-xs text-neutral-black hover:border-lummy-500 transition cursor-pointer">
                  Skip the {DISPUTE_WINDOW_H}h window
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Documents */}
        <div className="flex flex-col gap-4">
          <div className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5">
            <h4 className="font-fredoka font-semibold text-neutral-black mb-3">Handover documents</h4>
            <button onClick={() => setShowKuasa(true)} className="w-full flex items-center gap-3 p-3 rounded-2xl border border-neutral-light-gray-1 hover:border-lummy-500 transition cursor-pointer text-left">
              <span className="w-10 h-10 rounded-xl bg-secondary-blue-soft text-lummy-500 grid place-items-center shrink-0"><FileText className="w-5 h-5" /></span>
              <div>
                <div className="text-sm font-medium text-neutral-black">Letter of authorisation</div>
                <div className="text-xs text-neutral-gray">Print-ready, e-stamped and e-signed</div>
              </div>
            </button>
            {order.gateKtp && (
              <button onClick={() => setShowKtp(true)} className="mt-3 w-full flex items-center gap-3 p-3 rounded-2xl border border-neutral-light-gray-1 hover:border-lummy-500 transition cursor-pointer text-left">
                <span className="w-10 h-10 rounded-xl bg-secondary-pink-soft text-secondary-pink-dark grid place-items-center shrink-0"><CreditCard className="w-5 h-5" /></span>
                <div>
                  <div className="text-sm font-medium text-neutral-black">Seller ID card (gate check)</div>
                  <div className="text-xs text-neutral-gray">{ktpOpen ? "Unlocked, view-only" : "Unlocks when you are at the gate"}</div>
                </div>
              </button>
            )}
          </div>
          <div className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5 text-xs text-neutral-gray">
            Order <span className="font-mono text-neutral-black">{order.id}</span> · placed {formatDateTime(order.createdAtISO)}
          </div>
        </div>
      </div>

      {/* Letter of authorisation */}
      <Modal open={showKuasa} onClose={() => setShowKuasa(false)} title="Letter of authorisation">
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
        <p className="text-xs text-neutral-gray mt-3">The legal document stays in Indonesian, since that is what venue staff and courts read.</p>
        <Button.Primary wrapperClass="w-full mt-4" className="w-full text-sm" onClick={() => toast("Print / download (demo)")}>Print letter</Button.Primary>
      </Modal>

      {/* Seller ID */}
      <Modal open={showKtp} onClose={() => setShowKtp(false)} title="Seller ID card">
        {!ktpOpen ? (
          <div className="flex flex-col items-center text-center gap-3 py-2">
            <span className="w-14 h-14 rounded-2xl bg-secondary-blue-soft text-lummy-500 grid place-items-center"><Lock className="w-7 h-7" /></span>
            <h4 className="font-fredoka font-semibold text-neutral-black">Unlocks near the event</h4>
            <p className="text-sm text-neutral-gray max-w-sm">
              To keep the seller&apos;s exposure narrow, the ID photo only opens close to the show or when you are at the gate.
              Once open it stays available until the event passes, then it is purged.
            </p>
            <Button.Primary className="text-sm mt-1" onClick={() => setKtpOpen(true)}>I am at the gate, unlock</Button.Primary>
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
              View-only. The watermark traces whoever leaks it. Screenshots cannot be blocked on the web, but leaks stay attributable.
            </p>
          </>
        )}
      </Modal>

      {/* File a dispute: reason, then evidence that has to survive metadata checks */}
      <Modal open={showDispute} onClose={() => setShowDispute(false)} title="Report a problem">
        <div className="rounded-2xl bg-secondary-gold-soft px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs font-medium text-secondary-brown-dark flex items-center gap-1.5"><Timer className="w-3.5 h-3.5" /> Filing window closes in</span>
          <span className="font-mono font-bold text-sm text-neutral-black tabular-nums">{formatCountdown(left)}</span>
        </div>
        <p className="text-sm text-neutral-gray leading-relaxed mt-3">
          An arbiter reviews this, it is not an automatic refund. If you actually got in, the seller still gets paid.
          <SubId className="mt-1">Diputus admin, bukan refund otomatis.</SubId>
        </p>

        <div className="mt-4 flex flex-col gap-1.5">
          <span className="text-xs font-medium text-neutral-black">What happened?</span>
          {DISPUTE_REASONS.map((r) => (
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
                <span className="block text-sm text-neutral-black">{r.label}</span>
                <SubId className="text-xs">{r.sub}</SubId>
              </span>
            </label>
          ))}
        </div>

        {/* No-show is refused right here, which is the whole point of the policy */}
        {reason && !eligible && (
          <div className="mt-3 rounded-2xl bg-secondary-pink-soft p-4">
            <div className="text-sm font-medium text-secondary-pink-dark flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0" /> Not a refund case
            </div>
            <p className="text-xs text-secondary-pink-dark/90 mt-1.5 leading-relaxed">
              The ticket was valid, so the seller kept their side of the deal. Changing plans does not undo that.
              Before the show you can relist it and get your money back through the market instead.
              <SubId className="text-secondary-pink-dark/80 mt-1">Tiketnya valid, jadi bukan alasan refund. Jual lagi sebelum acara.</SubId>
            </p>
            <Link href="/sell" className="inline-flex items-center gap-1 text-xs font-medium text-primary-navy mt-2">
              <Repeat className="w-3.5 h-3.5" /> Relist this ticket
            </Link>
          </div>
        )}

        {eligible && (
          <>
            <div className="mt-4 flex flex-col gap-2">
              <span className="text-xs font-medium text-neutral-black">Evidence from the gate</span>
              <p className="text-xs text-neutral-gray -mt-1">
                A photo of the rejecting scanner or a note from staff. We read the file&apos;s capture time and location.
              </p>
              {evidenceOptions.map((ev) => (
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
                  <MapPin className="w-3.5 h-3.5 text-neutral-gray" /> File metadata
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${check.strength === "STRONG" ? "bg-secondary-green-soft text-secondary-green-dark" : "bg-secondary-pink-soft text-secondary-pink-dark"}`}>
                    {check.strength}
                  </span>
                </div>
                {check.checks.map((c) => <CheckRow key={c.label} {...c} />)}
                {check.strength === "WEAK" && (
                  <p className="text-xs text-secondary-pink-dark mt-2">
                    You can still file, but weak evidence usually ends with the funds going to the seller.
                  </p>
                )}
              </div>
            )}

            <label className="flex flex-col gap-1.5 mt-4">
              <span className="text-xs font-medium text-neutral-black">Anything to add? <span className="text-neutral-gray font-normal">(optional)</span></span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Which gate, what the staff said..."
                className="w-full rounded-xl border border-neutral-light-gray-1 focus:border-lummy-500 px-3 py-2 text-sm text-neutral-black outline-none resize-none"
              />
            </label>

            <label className="flex items-start gap-2.5 mt-4 cursor-pointer">
              <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} className="mt-0.5 accent-[#3A6CB4] cursor-pointer" />
              <span className="text-xs text-neutral-gray leading-relaxed">
                I declare I was refused entry and did not attend. A false claim means a permanent ban and liability for the seller&apos;s loss.
                <SubId className="mt-0.5">Klaim palsu = akun diblokir permanen.</SubId>
              </span>
            </label>
          </>
        )}

        <div className="flex gap-3 mt-5">
          <button onClick={() => setShowDispute(false)} className="flex-1 px-4 py-3 rounded-2xl border-2 border-neutral-light-gray-1 text-neutral-gray text-sm cursor-pointer">Cancel</button>
          <Button.Primary wrapperClass="flex-1" className="w-full text-sm" disabled={!canSubmit} onClick={submitDispute}>File dispute</Button.Primary>
        </div>
      </Modal>

      <Modal open={acting} onClose={() => {}}>
        <div className="flex flex-col items-center gap-3 py-4">
          <Loader2 className="w-8 h-8 text-lummy-500 animate-spin" />
          <p className="font-fredoka font-semibold text-neutral-black">Sending transaction...</p>
          <p className="text-sm text-neutral-gray">One moment, this is being processed.</p>
        </div>
      </Modal>
    </PageContainer>
  );
}
