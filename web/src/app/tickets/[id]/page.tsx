"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import toast from "react-hot-toast";
import {
  ArrowLeft, Lock, CheckCircle2, ExternalLink, Copy, FileText, CreditCard,
  ShieldCheck, AlertTriangle, Loader2, RotateCcw, Paperclip, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/common/Modal";
import { EscrowStatusPill } from "@/components/common/EscrowStatusPill";
import {
  useOrders, useUser, formatIDR, formatEventDate, formatDateTime, explorerTx, explorerAddr, shortHash,
} from "@/lib/mock";
import { PageContainer } from "@/components/layout/PageContainer";

function ChainRow({ label, value, href, onCopy }: { label: string; value: string; href?: string; onCopy?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-dashed border-neutral-light-gray-1 last:border-0">
      <span className="text-xs text-neutral-gray shrink-0">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-xs text-neutral-black truncate">{value}</span>
        {onCopy && <button onClick={onCopy} className="text-neutral-gray hover:text-primary-navy cursor-pointer shrink-0"><Copy className="w-3.5 h-3.5" /></button>}
        {href && <a href={href} target="_blank" rel="noreferrer" className="text-primary-navy hover:opacity-70 shrink-0"><ExternalLink className="w-3.5 h-3.5" /></a>}
      </div>
    </div>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const order = useOrders((s) => s.orders.find((o) => o.id === id));
  const release = useOrders((s) => s.release);
  const openDispute = useOrders((s) => s.openDispute);
  const user = useUser((s) => s.user);

  const [mounted, setMounted] = useState(false);
  const [acting, setActing] = useState(false);
  const [showKuasa, setShowKuasa] = useState(false);
  const [showKtp, setShowKtp] = useState(false);
  const [ktpOpen, setKtpOpen] = useState(false); // akses KTP kebuka mendekati event / pas tap "aku di gate"
  const [showDispute, setShowDispute] = useState(false);
  const [dReason, setDReason] = useState("Gagal masuk gate (barcode ditolak)");
  const [dEvidence, setDEvidence] = useState<string | null>(null);
  const [showProof, setShowProof] = useState(false); // detail on-chain disembunyiin default (web2-first)

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="pt-28 pb-16 text-center text-neutral-gray">Memuat...</div>;
  if (!order) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-28 pb-16 text-center">
        <p className="text-neutral-gray">Tiket gak ketemu.</p>
        <Link href="/tickets" className="text-primary-navy font-medium">Balik ke tiket saya</Link>
      </div>
    );
  }

  const copy = (t: string) => { navigator.clipboard?.writeText(t); toast.success("Disalin"); };

  const doRelease = () => {
    setActing(true);
    setTimeout(() => { release(order.id); setActing(false); toast.success("Dana cair ke penjual."); }, 1300);
  };
  const submitDispute = () => {
    setShowDispute(false); setActing(true);
    setTimeout(() => {
      openDispute(order.id, dReason, dEvidence ?? "bukti.jpg");
      setActing(false);
      toast.success("Sengketa diajukan. Ditinjau admin OperTix.");
    }, 1300);
  };

  const locked = order.escrowStatus === "LOCKED";
  const watermark = `${user?.name ?? "Pembeli"} · ${new Date().toLocaleDateString("id-ID")} · OperTix`;

  return (
    <PageContainer width="app">
      <Link href="/tickets" className="inline-flex items-center gap-1 text-neutral-gray hover:text-primary-navy text-sm mb-4">
        <ArrowLeft className="w-4 h-4" /> Tiket saya
      </Link>

      {/* Event header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-neutral-light-gray-1 shrink-0">
          <Image src={order.eventImage} alt={order.eventTitle} fill className="object-cover" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-neutral-black">{order.eventTitle}</h1>
          <p className="text-sm text-neutral-gray">{formatEventDate(order.eventDateISO)} · {order.tierName}{order.quantity > 1 ? ` · ${order.quantity} tiket` : ""} · Penjual {order.sellerName}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        {/* Escrow / transparency */}
        <div className="bg-neutral-white rounded-3xl border border-lummy-500 shadow-lummy p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="font-fredoka font-semibold text-neutral-black flex items-center gap-2">
              <Lock className="w-5 h-5 text-lummy-500" /> Dana Terkunci
            </span>
            <EscrowStatusPill status={order.escrowStatus} />
          </div>

          <div className="font-fredoka font-bold text-3xl text-neutral-black mb-1">{formatIDR(order.amount)}</div>
          <p className="text-sm text-neutral-gray mb-4">
            {locked
              ? "Ditahan aman sampai konser selesai, bukan di rekening kami atau penjual."
              : order.escrowStatus === "RELEASED"
              ? "Sudah cair ke penjual setelah konser aman."
              : order.escrowStatus === "REFUNDED"
              ? "Sudah dikembalikan ke kamu."
              : "Sengketa lagi ditinjau. Dana ketahan sampai diputus."}
          </p>

          <button
            onClick={() => setShowProof((v) => !v)}
            aria-expanded={showProof}
            className="flex items-center gap-1.5 text-xs text-primary-navy font-medium hover:opacity-80 cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5" /> {showProof ? "Sembunyikan detail teknis" : "Bukti transparan · cek sendiri"}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showProof ? "rotate-180" : ""}`} />
          </button>
          {showProof && (
          <div className="mt-3">
          <p className="text-xs text-neutral-gray mb-2">Dana kamu tercatat publik & bisa diverifikasi siapa aja — buat yang mau cek teknisnya.</p>
          <div className="bg-secondary-blue-extra rounded-2xl p-4">
            <ChainRow label="Kontrak escrow" value={shortHash(order.contractAddress)} href={explorerAddr(order.contractAddress)} onCopy={() => copy(order.contractAddress)} />
            <ChainRow label="Tx pendanaan" value={shortHash(order.fundTxHash)} href={explorerTx(order.fundTxHash)} onCopy={() => copy(order.fundTxHash)} />
            {order.settleTxHash && (
              <ChainRow label={order.escrowStatus === "RELEASED" ? "Tx pencairan" : "Tx refund"} value={shortHash(order.settleTxHash)} href={explorerTx(order.settleTxHash)} onCopy={() => copy(order.settleTxHash!)} />
            )}
            <ChainRow label="Kondisi rilis" value={`Konser + 48 jam`} />
            <ChainRow label="Jaringan" value="Monad testnet (10143)" />
          </div>

          <p className="flex items-center gap-1.5 text-xs text-neutral-gray mt-3">
            <ShieldCheck className="w-3.5 h-3.5 text-secondary-green-dark" /> Jangan percaya kami, cek sendiri di explorer.
          </p>
          </div>
          )}

          {/* Timeline: plain-language journey (jargon disembunyiin) */}
          <div className="mt-5">
            <div className="text-xs text-neutral-gray mb-2">Riwayat</div>
            <ol className="relative border-l-2 border-dashed border-neutral-light-gray-1 ml-1.5 flex flex-col gap-4">
              <li className="pl-4 relative">
                <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-lummy-500 border-2 border-neutral-white" />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-neutral-black">Dana masuk escrow</span>
                  {showProof && <a href={explorerTx(order.fundTxHash)} target="_blank" rel="noreferrer" className="text-xs text-primary-navy flex items-center gap-1 shrink-0">{shortHash(order.fundTxHash, 4)} <ExternalLink className="w-3 h-3" /></a>}
                </div>
                <span className="text-xs text-neutral-gray">{formatDateTime(order.createdAtISO)}</span>
              </li>
              {order.settleTxHash ? (
                <li className="pl-4 relative">
                  <span className={`absolute -left-[7px] top-1 w-3 h-3 rounded-full border-2 border-neutral-white ${order.escrowStatus === "RELEASED" ? "bg-secondary-green-dark" : "bg-neutral-gray"}`} />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-neutral-black">{order.escrowStatus === "RELEASED" ? "Dana cair ke penjual" : "Dana dikembalikan"}</span>
                    {showProof && <a href={explorerTx(order.settleTxHash)} target="_blank" rel="noreferrer" className="text-xs text-primary-navy flex items-center gap-1 shrink-0">{shortHash(order.settleTxHash, 4)} <ExternalLink className="w-3 h-3" /></a>}
                  </div>
                  <span className="text-xs text-neutral-gray">Baru saja</span>
                </li>
              ) : (
                <li className="pl-4 relative">
                  <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-neutral-light-gray-1 border-2 border-neutral-white" />
                  <span className="text-sm text-neutral-gray">Menunggu konser selesai + 48 jam</span>
                </li>
              )}
            </ol>
          </div>

          {/* Actions */}
          {locked && (
            <div className="mt-5 flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <Button.Primary wrapperClass="flex-1" className="w-full text-sm" onClick={doRelease}>
                  Simulasi event selesai
                </Button.Primary>
                <button
                  onClick={() => setShowDispute(true)}
                  className="flex-1 px-4 py-3 rounded-2xl border-2 border-secondary-orange-dark text-secondary-orange-dark text-sm font-medium hover:bg-secondary-orange-soft transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <AlertTriangle className="w-4 h-4" /> Tiket bermasalah? Ajukan sengketa
                </button>
              </div>
              <div className="text-xs text-neutral-gray leading-relaxed flex flex-col gap-1.5">
                <span>✅ Kalau lancar, gak usah ngapa-ngapain. Uang otomatis ke penjual <b className="text-neutral-black">2 hari setelah konser</b>.</span>
                <span>⚠️ Tiket bermasalah? <b className="text-neutral-black">Ajukan sengketa + foto bukti pas di gate</b>. Tim kami yang cek, uang balik kalau kebukti.</span>
                <span>🎟️ Gak jadi dateng? <Link href="/sell" className="text-primary-navy font-medium hover:opacity-80">Jual lagi</Link> tiketnya sebelum konser — kalau dibiarin, tiketnya hangus.</span>
              </div>
            </div>
          )}
          {order.escrowStatus === "DISPUTED" && (
            <div className="mt-5 flex flex-col gap-2 text-sm bg-secondary-orange-soft text-secondary-orange-dark rounded-2xl p-4">
              <span className="flex items-center gap-2 font-medium"><AlertTriangle className="w-4 h-4" /> Sengketa lagi ditinjau admin</span>
              <span className="text-xs leading-relaxed">
                Alasan: <b>{order.dispute?.reason}</b>. Bukti: {order.dispute?.evidence}. Admin OperTix bakal mutusin dana ke penjual atau refund ke kamu. Sampai selesai, dana tetap ketahan (gak ke mana-mana).
              </span>
            </div>
          )}
          {order.escrowStatus === "RELEASED" && (
            <div className="mt-5 flex items-center gap-2 text-sm text-secondary-green-dark bg-secondary-green-soft rounded-2xl p-3">
              <CheckCircle2 className="w-4 h-4" /> Transaksi selesai. Dana sudah cair ke penjual.
            </div>
          )}
          {order.escrowStatus === "REFUNDED" && (
            <div className="mt-5 flex items-center gap-2 text-sm text-neutral-gray bg-neutral-light-gray-2 rounded-2xl p-3">
              <RotateCcw className="w-4 h-4" /> Dana sudah dikembalikan ke kamu.
            </div>
          )}
        </div>

        {/* Documents */}
        <div className="flex flex-col gap-4">
          <div className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5">
            <h4 className="font-fredoka font-semibold text-neutral-black mb-3">Dokumen serah-terima</h4>
            <button onClick={() => setShowKuasa(true)} className="w-full flex items-center gap-3 p-3 rounded-2xl border border-neutral-light-gray-1 hover:border-lummy-500 transition cursor-pointer text-left">
              <span className="w-10 h-10 rounded-xl bg-secondary-blue-soft text-lummy-500 grid place-items-center shrink-0"><FileText className="w-5 h-5" /></span>
              <div>
                <div className="text-sm font-medium text-neutral-black">Surat kuasa</div>
                <div className="text-xs text-neutral-gray">Siap-print, e-materai + TTE</div>
              </div>
            </button>
            {order.gateKtp && (
              <button onClick={() => setShowKtp(true)} className="mt-3 w-full flex items-center gap-3 p-3 rounded-2xl border border-neutral-light-gray-1 hover:border-lummy-500 transition cursor-pointer text-left">
                <span className="w-10 h-10 rounded-xl bg-secondary-pink-soft text-secondary-pink-dark grid place-items-center shrink-0"><CreditCard className="w-5 h-5" /></span>
                <div>
                  <div className="text-sm font-medium text-neutral-black">Foto KTP penjual (gate)</div>
                  <div className="text-xs text-neutral-gray">{ktpOpen ? "Akses terbuka, view-only" : "Kebuka pas kamu di gate"}</div>
                </div>
              </button>
            )}
          </div>
          <div className="bg-secondary-cream-light rounded-3xl border border-neutral-light-gray-1 p-5 text-xs text-neutral-gray">
            Order <span className="font-mono text-neutral-black">{order.id}</span> · dibuat {formatDateTime(order.createdAtISO)}
          </div>
        </div>
      </div>

      {/* Surat kuasa modal */}
      <Modal open={showKuasa} onClose={() => setShowKuasa(false)} title="Surat Kuasa">
        <div className="bg-secondary-gray-soft rounded-2xl p-6 text-sm text-neutral-black leading-relaxed">
          <p className="text-center font-fredoka font-bold text-base mb-4">SURAT KUASA</p>
          <p>Yang bertanda tangan di bawah ini memberi kuasa kepada:</p>
          <p className="mt-2"><b>Penerima:</b> {user?.name ?? "Pembeli"}</p>
          <p><b>Pemberi:</b> {order.sellerName}</p>
          <p className="mt-3">Untuk mengambil dan menggunakan tiket <b>{order.eventTitle}</b> ({order.tierName}) pada {formatEventDate(order.eventDateISO)}.</p>
          <div className="flex justify-between mt-6 text-xs text-neutral-gray">
            <span>Ditandatangani secara elektronik (TTE)</span>
            <span className="bg-secondary-gold-soft text-secondary-gold-dark px-2 py-1 rounded">e-Materai Rp10.000</span>
          </div>
        </div>
        <Button.Primary wrapperClass="w-full mt-4" className="w-full text-sm" onClick={() => toast("Print / download (demo)")}>Print surat kuasa</Button.Primary>
      </Modal>

      {/* KTP modal — akses kebuka mendekati event, lalu watermarked view-only */}
      <Modal open={showKtp} onClose={() => { setShowKtp(false); }} title="Foto KTP penjual">
        {!ktpOpen ? (
          <div className="flex flex-col items-center text-center gap-3 py-2">
            <span className="w-14 h-14 rounded-2xl bg-secondary-blue-soft text-lummy-500 grid place-items-center"><Lock className="w-7 h-7" /></span>
            <h4 className="font-fredoka font-semibold text-neutral-black">Akses kebuka mendekati event</h4>
            <p className="text-sm text-neutral-gray max-w-sm">
              Demi privasi penjual, foto KTP baru bisa dibuka pas mendekati hari-H atau waktu kamu sudah di gate.
              Sekali kebuka, tetap bisa dilihat sampai konser lewat, lalu dihapus.
            </p>
            <Button.Primary className="text-sm mt-1" onClick={() => setKtpOpen(true)}>Aku di gate, buka akses</Button.Primary>
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
              {/* dynamic watermark overlay */}
              <div className="absolute inset-0 flex flex-wrap gap-6 content-center justify-center opacity-30 pointer-events-none">
                {Array.from({ length: 9 }).map((_, i) => (
                  <span key={i} className="text-[10px] text-neutral-black -rotate-[20deg] whitespace-nowrap">{watermark}</span>
                ))}
              </div>
            </div>
            <p className="flex items-start gap-2 text-xs text-neutral-gray mt-3">
              <AlertTriangle className="w-4 h-4 text-secondary-orange-dark shrink-0 mt-0.5" />
              View-only. Watermark melacak siapa yang menyebar. Screenshot gak bisa dicegah di web, tapi kebocoran ketahuan.
            </p>
          </>
        )}
      </Modal>

      {/* Ajukan sengketa (bukan auto-refund) */}
      <Modal open={showDispute} onClose={() => setShowDispute(false)} title="Ajukan sengketa">
        <p className="text-sm text-neutral-gray leading-relaxed">
          Sengketa diperiksa <b className="text-neutral-black">admin OperTix</b>, bukan otomatis refund. Kalau kamu beneran masuk, dana tetap cair ke penjual. Butuh <b className="text-neutral-black">bukti gagal-masuk saat di gate</b> (foto layar scanner yang nolak / surat dari petugas), maksimal 48 jam setelah event.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-neutral-gray">Masalahnya apa?</span>
            <div className="relative">
              <select value={dReason} onChange={(e) => setDReason(e.target.value)} className="appearance-none w-full rounded-xl border border-lummy-500 px-4 py-3 pr-10 text-sm text-neutral-black bg-neutral-white outline-none cursor-pointer">
                <option>Gagal masuk gate (barcode ditolak)</option>
                <option>Barcode sudah pernah dipakai</option>
                <option>Tiket beda dari deskripsi</option>
                <option>Tiket gak dikirim</option>
              </select>
              <ChevronDown className="w-4 h-4 text-neutral-gray absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-neutral-gray">Bukti (foto/video penolakan di gate)</span>
            <button onClick={() => setDEvidence("foto-scanner-error.jpg")} className="w-full flex items-center gap-2 p-3 rounded-xl border border-dashed border-lummy-500 text-sm text-lummy-500 hover:bg-secondary-blue-light transition cursor-pointer">
              <Paperclip className="w-4 h-4 shrink-0" /> {dEvidence ?? "Upload bukti (demo)"}
            </button>
            {!dEvidence && <span className="text-xs text-secondary-orange-dark">Bukti wajib. Tanpa bukti gagal-masuk, sengketa ditolak dan dana cair ke penjual.</span>}
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={() => setShowDispute(false)} className="flex-1 px-4 py-3 rounded-2xl border-2 border-neutral-light-gray-1 text-neutral-gray text-sm cursor-pointer">Batal</button>
          <Button.Primary wrapperClass="flex-1" className="w-full text-sm" disabled={!dEvidence} onClick={submitDispute}>Kirim sengketa</Button.Primary>
        </div>
      </Modal>

      <Modal open={acting} onClose={() => {}}>
        <div className="flex flex-col items-center gap-3 py-4">
          <Loader2 className="w-8 h-8 text-lummy-500 animate-spin" />
          <p className="font-fredoka font-semibold text-neutral-black">Mengirim transaksi...</p>
          <p className="text-sm text-neutral-gray">Sebentar ya, lagi diproses aman.</p>
        </div>
      </Modal>
    </PageContainer>
  );
}
