"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle2, XCircle, AlertTriangle, Sparkles, Calendar, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEventRequests, formatIDR, formatEventDate } from "@/lib/mock";

export default function AdminPage() {
  const [mounted, setMounted] = useState(false);
  const requests = useEventRequests((s) => s.requests);
  const approve = useEventRequests((s) => s.approve);
  const reject = useEventRequests((s) => s.reject);
  useEffect(() => setMounted(true), []);

  return (
    <div className="max-w-4xl mx-auto px-5 lg:px-10 pt-28 pb-10">
      <h1 className="text-2xl md:text-3xl font-bold text-neutral-black">Approval event</h1>
      <div className="flex items-start gap-2 text-sm text-neutral-gray bg-secondary-blue-extra rounded-2xl p-4 mt-4 mb-8">
        <Sparkles className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
        Event baru diverifikasi sebelum tiketnya boleh dijual. AI sudah pre-fill dari PDF penjual pertama. <b className="text-neutral-black">&nbsp;Face value = pre-fill</b>, cek ke sumber resmi sebelum approve.
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
                  <Button.Primary className="flex items-center gap-2 text-sm" onClick={() => { approve(r.id); toast.success("Event disetujui, tiket boleh dijual"); }}>
                    <CheckCircle2 className="w-4 h-4" /> Approve
                  </Button.Primary>
                  <button onClick={() => { reject(r.id); toast("Event ditolak"); }} className="flex items-center gap-2 px-4 py-3 rounded-2xl border-2 border-neutral-light-gray-1 text-neutral-gray text-sm hover:border-secondary-pink-dark hover:text-secondary-pink-dark transition cursor-pointer">
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
