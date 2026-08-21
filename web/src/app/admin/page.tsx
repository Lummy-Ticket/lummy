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
import { SubId } from "@/components/common/Bilingual";
import { PageContainer } from "@/components/layout/PageContainer";
import {
  useEventRequests, useOrders, formatIDR, formatEventDate, formatDateTime,
  checkEvidence, reasonMeta, suggestedRationale, disputeDeadlineISO,
  type EventRequest, type Order,
} from "@/lib/mock";

function EvidencePanel({ order }: { order: Order }) {
  const d = order.dispute!;
  const check = useMemo(() => checkEvidence(order, d.evidence, d.openedAtISO), [order, d]);
  const deadline = disputeDeadlineISO(order);

  return (
    <div className="mt-3 rounded-2xl border border-neutral-light-gray-1 overflow-hidden">
      <div className="bg-secondary-orange-soft px-4 py-3">
        <div className="text-sm font-medium text-secondary-orange-dark flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {reasonMeta(d.reason).label}
        </div>
        {d.note && <p className="text-xs text-secondary-orange-dark/85 mt-1 italic">&ldquo;{d.note}&rdquo;</p>}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 text-xs text-neutral-black mb-2">
          <Paperclip className="w-3.5 h-3.5 text-neutral-gray shrink-0" />
          <span className="font-mono truncate">{d.evidence.fileName}</span>
          <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${check.strength === "STRONG" ? "bg-secondary-green-soft text-secondary-green-dark" : "bg-secondary-pink-soft text-secondary-pink-dark"}`}>
            {check.strength}
          </span>
        </div>
        <div className="grid sm:grid-cols-2 gap-x-4">
          {check.checks.map((c) => (
            <div key={c.label} className="flex gap-2 py-1.5">
              {c.ok ? <CheckCircle2 className="w-4 h-4 text-secondary-green-dark shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-secondary-pink-dark shrink-0 mt-0.5" />}
              <div className="min-w-0">
                <div className="text-xs font-medium text-neutral-black">{c.label}</div>
                <div className="text-xs text-neutral-gray">{c.detail}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-dashed border-neutral-light-gray-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-gray">
          <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Captured {formatDateTime(d.evidence.capturedAtISO)}</span>
          <span className="flex items-center gap-1.5"><Gavel className="w-3.5 h-3.5" /> Filed {formatDateTime(d.openedAtISO)}</span>
          {deadline && <span className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Window closed {formatDateTime(deadline)}</span>}
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [mounted, setMounted] = useState(false);
  const [confirmReq, setConfirmReq] = useState<EventRequest | null>(null);
  const requests = useEventRequests((s) => s.requests);
  const approve = useEventRequests((s) => s.approve);
  const reject = useEventRequests((s) => s.reject);
  const orders = useOrders((s) => s.orders);
  const resolveDispute = useOrders((s) => s.resolveDispute);
  useEffect(() => setMounted(true), []);

  const disputes = orders.filter((o) => o.escrowStatus === "DISPUTED");
  const doApprove = (r: EventRequest) => { approve(r.id); toast.success("Event approved, tickets can be listed"); };

  const doResolve = (o: Order, toSeller: boolean) => {
    const check = checkEvidence(o, o.dispute!.evidence, o.dispute!.openedAtISO);
    const rationale = toSeller
      ? check.strength === "STRONG"
        ? "Arbiter overrode the automated read and released to the seller."
        : suggestedRationale(o.dispute!, check)
      : "Gate-time evidence is consistent with a denied entry: timestamp and location both check out.";
    resolveDispute(o.id, toSeller, rationale);
    toast.success(toSeller ? "Closed, funds released to the seller" : "Upheld, buyer refunded");
  };

  return (
    <PageContainer width="app">
      <h1 className="text-2xl md:text-3xl font-bold text-neutral-black">Admin console</h1>

      {/* Arbitration queue: refunds are decided here, never automatically */}
      {mounted && disputes.length > 0 && (
        <div className="mt-6">
          <h2 className="font-fredoka font-bold text-xl text-neutral-black flex items-center gap-2">
            <Scale className="w-5 h-5 text-secondary-orange-dark" /> Arbitration
            <span className="text-neutral-gray font-normal text-base">({disputes.length})</span>
          </h2>
          <p className="text-sm text-neutral-gray mt-1 mb-4">
            Refunds are <b className="text-neutral-black">not automatic</b>. The seller wins by default unless
            gate-time evidence holds up. The checks below are signals, the call is yours.
            <SubId className="mt-0.5">Default menang penjual, kecuali bukti gate kredibel.</SubId>
          </p>
          <div className="flex flex-col gap-4">
            {disputes.map((o) => {
              const check = checkEvidence(o, o.dispute!.evidence, o.dispute!.openedAtISO);
              const strong = check.strength === "STRONG";
              return (
                <div key={o.id} className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-fredoka font-semibold text-neutral-black truncate">{o.eventTitle}</h3>
                      <div className="text-xs text-neutral-gray mt-1">
                        {formatEventDate(o.eventDateISO)} · {o.tierName} · Seller {o.sellerName}
                      </div>
                    </div>
                    <span className="font-fredoka font-bold text-lummy-500 text-nowrap">{formatIDR(o.amount)}</span>
                  </div>

                  <EvidencePanel order={o} />

                  <p className="text-xs text-neutral-gray mt-3 flex gap-2">
                    <Gavel className="w-4 h-4 shrink-0 text-neutral-gray mt-0.5" />
                    <span>Suggested: <b className="text-neutral-black">{strong ? "refund the buyer" : "release to the seller"}</b>. {suggestedRationale(o.dispute!, check)}</span>
                  </p>

                  <div className="flex flex-col sm:flex-row gap-3 mt-4">
                    <button
                      onClick={() => doResolve(o, false)}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border-2 text-sm transition cursor-pointer ${strong ? "border-secondary-green-dark text-secondary-green-dark hover:bg-secondary-green-soft" : "border-neutral-light-gray-1 text-neutral-gray hover:border-secondary-green-dark hover:text-secondary-green-dark"}`}
                    >
                      <CheckCircle2 className="w-4 h-4" /> Evidence holds, refund buyer
                    </button>
                    <button
                      onClick={() => doResolve(o, true)}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border-2 text-sm transition cursor-pointer ${!strong ? "border-primary-navy text-primary-navy hover:bg-secondary-blue-light" : "border-neutral-light-gray-1 text-neutral-gray hover:border-primary-navy hover:text-primary-navy"}`}
                    >
                      <XCircle className="w-4 h-4" /> Evidence weak, pay seller
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <h2 className="font-fredoka font-bold text-xl text-neutral-black mt-10">Event approvals</h2>
      <div className="flex items-start gap-2 text-sm text-neutral-gray bg-secondary-blue-extra rounded-2xl p-4 mt-3 mb-8">
        <Sparkles className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
        <span>New events are verified before their tickets can be sold. AI pre-fills from the first seller&apos;s PDF.
          <b className="text-neutral-black"> Face value is a pre-fill</b>, check it against the official source before approving.</span>
      </div>

      {!mounted ? (
        <p className="text-neutral-gray text-sm">Loading...</p>
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
                    <Badge.Base className="bg-secondary-blue-soft text-lummy-500 text-xs">{r.category}</Badge.Base>
                  </div>
                  <div className="text-xs text-neutral-gray mt-1">Submitted by {r.submittedBy}</div>
                </div>
                {r.status !== "pending" && (
                  <Badge.Base className={r.status === "approved" ? "bg-secondary-green-soft text-secondary-green-dark text-xs" : "bg-secondary-pink-soft text-secondary-pink-dark text-xs"}>
                    {r.status === "approved" ? "Approved" : "Rejected"}
                  </Badge.Base>
                )}
              </div>

              <div className="mt-4 bg-secondary-gray-soft rounded-2xl p-4">
                <div className="text-xs text-neutral-gray mb-2">Face value per tier <span className="text-neutral-black">(verify against the organiser, not just the PDF)</span></div>
                <div className="flex flex-wrap gap-2">
                  {r.faceValues.map((f) => {
                    const fromPdf = f.tier === r.pdfTier;
                    return (
                      <span key={f.tier} className={`text-sm rounded-lg px-3 py-1.5 flex items-center gap-1.5 ${fromPdf ? "bg-secondary-blue-soft border border-lummy-500 text-neutral-black" : "bg-neutral-white border border-neutral-light-gray-1 text-neutral-black"}`}>
                        {f.tier} <b className="text-lummy-500">{formatIDR(f.value)}</b>
                        {fromPdf && <span className="text-[10px] text-lummy-500 font-medium">from PDF</span>}
                      </span>
                    );
                  })}
                </div>
                <div className="text-xs text-neutral-gray mt-3 flex flex-wrap items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-lummy-500 shrink-0" />
                  AI can only read <b className="text-neutral-black">one tier</b> from the seller&apos;s PDF ({r.pdfTier}, their own). An admin fills in the rest from
                  <a href={`https://${r.organizerRef}`} target="_blank" rel="noreferrer" className="text-primary-navy font-medium hover:opacity-80 inline-flex items-center gap-0.5">{r.organizerRef} <ExternalLink className="w-3 h-3" /></a>
                </div>
              </div>

              <div className={`mt-3 flex items-center gap-2 text-sm rounded-xl p-3 ${r.pdfSuspicious || r.forgeryScore >= 60 ? "bg-secondary-orange-soft text-secondary-orange-dark" : "bg-secondary-green-soft text-secondary-green-dark"}`}>
                {r.pdfSuspicious || r.forgeryScore >= 60 ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                Forgery score {r.forgeryScore}/100 {r.pdfSuspicious ? "· PDF structure looks tampered with" : "· PDF is clean"}
              </div>

              {r.status === "pending" && (
                <div className="flex gap-3 mt-4">
                  {r.pdfSuspicious || r.forgeryScore >= 60 ? (
                    <button onClick={() => setConfirmReq(r)} className="flex items-center gap-2 px-4 py-3 rounded-2xl border-2 border-secondary-orange-dark text-secondary-orange-dark text-sm hover:bg-secondary-orange-soft transition cursor-pointer">
                      <AlertTriangle className="w-4 h-4" /> Approve (high score)
                    </button>
                  ) : (
                    <Button.Primary className="flex items-center gap-2 text-sm" onClick={() => doApprove(r)}>
                      <CheckCircle2 className="w-4 h-4" /> Approve
                    </Button.Primary>
                  )}
                  <button onClick={() => { reject(r.id); toast("Event rejected"); }} className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-sm transition cursor-pointer ${r.pdfSuspicious || r.forgeryScore >= 60 ? "bg-primary-navy text-white hover:bg-primary-navy-dark" : "border-2 border-neutral-light-gray-1 text-neutral-gray hover:border-secondary-pink-dark hover:text-secondary-pink-dark"}`}>
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={!!confirmReq} onClose={() => setConfirmReq(null)} title="Approve a flagged ticket?">
        {confirmReq && (
          <>
            <p className="text-sm text-neutral-gray">
              <b className="text-neutral-black">{confirmReq.title}</b> was flagged by AI (score {confirmReq.forgeryScore}/100{confirmReq.pdfSuspicious ? ", PDF structure looks tampered with" : ""}).
              Approving lets this ticket be sold. Make sure you checked the document by hand.
            </p>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setConfirmReq(null)} className="flex-1 px-4 py-3 rounded-2xl border-2 border-neutral-light-gray-1 text-neutral-gray text-sm cursor-pointer">Cancel</button>
              <Button.Primary wrapperClass="flex-1" className="w-full text-sm" onClick={() => { doApprove(confirmReq); setConfirmReq(null); }}>Yes, approve</Button.Primary>
            </div>
          </>
        )}
      </Modal>
    </PageContainer>
  );
}
