"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle2, XCircle, AlertTriangle, Sparkles, Calendar, MapPin, Scale, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/common/Modal";
import { PageContainer } from "@/components/layout/PageContainer";
import { useEventRequests, useOrders, formatIDR, formatEventDate, formatDateTime, type EventRequest } from "@/lib/mock";

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
  const doApprove = (r: EventRequest) => { approve(r.id); toast.success("Event disetujui, tiket boleh dijual"); };
  const doResolve = (id: string, toSeller: boolean) => {
    resolveDispute(id, toSeller);
    toast.success(toSeller ? "Sengketa ditutup — dana cair ke penjual" : "Sengketa dimenangkan pembeli — dana di-refund");
  };

  return (
    <PageContainer width="app">
      <h1 className="text-2xl md:text-3xl font-bold text-neutral-black">Panel admin</h1>

      {/* Sengketa: arbiter memutuskan, refund gak otomatis */}
      {mounted && disputes.length > 0 && (
        <div className="mt-6">
          <h2 className="font-fredoka font-bold text-xl text-neutral-black flex items-center gap-2">
            <Scale className="w-5 h-5 text-secondary-orange-dark" /> Sengketa <span className="text-neutral-gray font-normal text-base">({disputes.length})</span>
          </h2>
          <p className="text-sm text-neutral-gray mt-1 mb-3">
            Refund <b className="text-neutral-black">gak otomatis</b>. Arbiter (kamu) yang mutusin dari bukti. Default: menang penjual, kecuali ada bukti gagal-masuk yang kredibel.
          </p>
          <div className="flex flex-col gap-4">
            {disputes.map((o) => (
              <div key={o.id} className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-fredoka font-semibold text-neutral-black truncate">{o.eventTitle}</h3>
                    <div className="text-xs text-neutral-gray mt-1">{formatEventDate(o.eventDateISO)} · {o.tierName} · Penjual {o.sellerName}</div>
                  </div>
                  <span className="font-fredoka font-bold text-lummy-500 text-nowrap">{formatIDR(o.amount)}</span>
                </div>
                {o.dispute && (
                  <div className="mt-3 bg-secondary-orange-soft rounded-2xl p-4 text-secondary-orange-dark">
                    <div className="text-sm font-medium flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {o.dispute.reason}</div>
                    <div className="text-xs mt-1.5 flex items-center gap-1.5"><Paperclip className="w-3.5 h-3.5 shrink-0" /> Bukti: {o.dispute.evidence} · diajukan {formatDateTime(o.dispute.openedAtISO)}</div>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-3 mt-4">
                  <button onClick={() => doResolve(o.id, false)} className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border-2 border-secondary-green-dark text-secondary-green-dark text-sm hover:bg-secondary-green-soft transition cursor-pointer">
                    <CheckCircle2 className="w-4 h-4" /> Bukti valid — refund pembeli
                  </button>
                  <button onClick={() => doResolve(o.id, true)} className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border-2 border-primary-navy text-primary-navy text-sm hover:bg-secondary-blue-light transition cursor-pointer">
                    <XCircle className="w-4 h-4" /> Bukti lemah — menang penjual
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="font-fredoka font-bold text-xl text-neutral-black mt-10">Approval event</h2>
      <div className="flex items-start gap-2 text-sm text-neutral-gray bg-secondary-blue-extra rounded-2xl p-4 mt-3 mb-8">
        <Sparkles className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
        <span>Event baru diverifikasi sebelum tiketnya boleh dijual. AI sudah pre-fill dari PDF penjual pertama. <b className="text-neutral-black">Face value = pre-fill</b>, cek ke sumber resmi sebelum approve.</span>
      </div>

      {!mounted ? (
        <p className="text-neutral-gray text-sm">Memuat...</p>
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
                  <div className="text-xs text-neutral-gray mt-1">Diajukan {r.submittedBy}</div>
                </div>
                {r.status !== "pending" && (
                  <Badge.Base className={r.status === "approved" ? "bg-secondary-green-soft text-secondary-green-dark text-xs" : "bg-secondary-pink-soft text-secondary-pink-dark text-xs"}>
                    {r.status === "approved" ? "Disetujui" : "Ditolak"}
                  </Badge.Base>
                )}
              </div>

              {/* AI-seeded face values */}
              <div className="mt-4 bg-secondary-gray-soft rounded-2xl p-4">
                <div className="text-xs text-neutral-gray mb-2">Harga asli (di-extract AI dari PDF)</div>
                <div className="flex flex-wrap gap-2">
                  {r.faceValues.map((f) => (
                    <span key={f.tier} className="text-sm bg-neutral-white border border-neutral-light-gray-1 rounded-lg px-3 py-1.5 text-neutral-black">
                      {f.tier} <b className="text-lummy-500">{formatIDR(f.value)}</b>
                    </span>
                  ))}
                </div>
              </div>

              {/* AI flag */}
              <div className={`mt-3 flex items-center gap-2 text-sm rounded-xl p-3 ${r.pdfSuspicious || r.forgeryScore >= 60 ? "bg-secondary-orange-soft text-secondary-orange-dark" : "bg-secondary-green-soft text-secondary-green-dark"}`}>
                {r.pdfSuspicious || r.forgeryScore >= 60 ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                Skor pemalsuan {r.forgeryScore}/100 {r.pdfSuspicious ? "· struktur PDF mencurigakan" : "· PDF bersih"}
              </div>

              {r.status === "pending" && (
                <div className="flex gap-3 mt-4">
                  {r.pdfSuspicious || r.forgeryScore >= 60 ? (
                    <button onClick={() => setConfirmReq(r)} className="flex items-center gap-2 px-4 py-3 rounded-2xl border-2 border-secondary-orange-dark text-secondary-orange-dark text-sm hover:bg-secondary-orange-soft transition cursor-pointer">
                      <AlertTriangle className="w-4 h-4" /> Approve (skor tinggi)
                    </button>
                  ) : (
                    <Button.Primary className="flex items-center gap-2 text-sm" onClick={() => doApprove(r)}>
                      <CheckCircle2 className="w-4 h-4" /> Approve
                    </Button.Primary>
                  )}
                  <button onClick={() => { reject(r.id); toast("Event ditolak"); }} className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-sm transition cursor-pointer ${r.pdfSuspicious || r.forgeryScore >= 60 ? "bg-primary-navy text-white hover:bg-primary-navy-dark" : "border-2 border-neutral-light-gray-1 text-neutral-gray hover:border-secondary-pink-dark hover:text-secondary-pink-dark"}`}>
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={!!confirmReq} onClose={() => setConfirmReq(null)} title="Approve tiket ter-flag?">
        {confirmReq && (
          <>
            <p className="text-sm text-neutral-gray">
              <b className="text-neutral-black">{confirmReq.title}</b> kena flag AI (skor {confirmReq.forgeryScore}/100{confirmReq.pdfSuspicious ? ", struktur PDF mencurigakan" : ""}).
              Approve tetap membolehkan tiket ini dijual. Pastikan kamu sudah cek manual dokumennya.
            </p>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setConfirmReq(null)} className="flex-1 px-4 py-3 rounded-2xl border-2 border-neutral-light-gray-1 text-neutral-gray text-sm cursor-pointer">Batal</button>
              <Button.Primary wrapperClass="flex-1" className="w-full text-sm" onClick={() => { doApprove(confirmReq); setConfirmReq(null); }}>Ya, approve</Button.Primary>
            </div>
          </>
        )}
      </Modal>
    </PageContainer>
  );
}
