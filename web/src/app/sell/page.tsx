"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  UploadCloud, FileText, ScanLine, CheckCircle2, AlertTriangle, Loader2, ArrowRight, ArrowLeft, Sparkles, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getEvents, getEventById, getTier, formatIDR, CAP_PCT, FLOOR_PCT, useSellerListings, type ListingAI,
} from "@/lib/mock";

const events = getEvents();

function Check({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-neutral-white border border-neutral-light-gray-1">
      {ok ? <CheckCircle2 className="w-5 h-5 text-secondary-green-dark shrink-0" /> : <AlertTriangle className="w-5 h-5 text-secondary-orange-dark shrink-0" />}
      <div>
        <div className="text-sm font-medium text-neutral-black">{label}</div>
        <div className="text-xs text-neutral-gray">{detail}</div>
      </div>
    </div>
  );
}

const STEPS = ["Upload PDF", "Hasil AI & data", "Harga & publish"];

export default function SellPage() {
  const router = useRouter();
  const addListing = useSellerListings((s) => s.add);
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sample, setSample] = useState<"good" | "edited" | "dup">("good");
  const [analyzing, setAnalyzing] = useState(false);

  // extracted / editable
  const [eventId, setEventId] = useState("ev-tulus");
  const [tierId, setTierId] = useState("t-tl-vip");
  const [orderer, setOrderer] = useState("");
  const [barcode, setBarcode] = useState("");
  const [ai, setAi] = useState<ListingAI | null>(null);
  const [price, setPrice] = useState<number>(0);

  const event = getEventById(eventId);
  const tier = event ? getTier(event, tierId) : undefined;
  const faceValue = tier?.faceValue ?? 0;
  const cap = Math.round(faceValue * (CAP_PCT / 100));
  const floor = Math.round(faceValue * (FLOOR_PCT / 100));
  const priceValid = price >= floor && price <= cap;
  const markup = faceValue ? Math.round((price / faceValue - 1) * 100) : 0;

  const analyze = () => {
    setAnalyzing(true);
    setTimeout(() => {
      const result: ListingAI =
        sample === "good"
          ? { autofilled: true, forgeryScore: 9, barcodeDuplicate: false, pdfSuspicious: false }
          : sample === "edited"
          ? { autofilled: true, forgeryScore: 78, barcodeDuplicate: false, pdfSuspicious: true }
          : { autofilled: true, forgeryScore: 11, barcodeDuplicate: true, pdfSuspicious: false };
      setAi(result);
      setOrderer("Zahra Amelia");
      setBarcode("TIX-8842-7731-2290");
      setPrice(Math.round((getEventById("ev-tulus")?.tiers.find((t) => t.id === "t-tl-vip")?.faceValue ?? 0) * 1.15));
      setAnalyzing(false);
      setStep(1);
    }, 1800);
  };

  const publish = () => {
    if (!event || !tier) return;
    addListing({ eventId: event.id, eventTitle: event.title, tierName: tier.name, askPrice: price, faceValue, ai: ai! });
    toast.success("Listing tayang. Dijaga escrow.");
    router.push("/seller");
  };

  return (
    <div className="max-w-3xl mx-auto px-5 lg:px-10 pt-28 pb-10">
      <h1 className="text-2xl md:text-3xl font-bold text-neutral-black">Jual tiket</h1>
      <p className="text-neutral-gray mt-1">Upload PDF, AI isi datanya otomatis dan cek keasliannya.</p>

      {/* Steps */}
      <div className="flex items-center gap-2 mt-6 mb-8">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`w-7 h-7 rounded-full grid place-items-center text-xs font-fredoka font-bold ${i <= step ? "bg-primary-navy text-white" : "bg-neutral-light-gray-2 text-neutral-gray"}`}>{i + 1}</span>
            <span className={`text-sm ${i === step ? "text-neutral-black font-medium" : "text-neutral-gray"} hidden sm:block`}>{s}</span>
            {i < STEPS.length - 1 && <span className="w-6 h-px bg-neutral-light-gray-1" />}
          </div>
        ))}
      </div>

      {/* Step 1: upload */}
      {step === 0 && (
        <div className="flex flex-col gap-5">
          <input ref={fileInput} type="file" accept="application/pdf" hidden onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
          <button
            onClick={() => fileInput.current?.click()}
            className="border-2 border-dashed border-lummy-500 rounded-3xl py-12 flex flex-col items-center gap-3 text-center hover:bg-secondary-blue-light transition cursor-pointer"
          >
            <UploadCloud className="w-10 h-10 text-lummy-500" />
            <span className="font-fredoka font-semibold text-neutral-black">Upload PDF tiket</span>
            <span className="text-sm text-neutral-gray">Tarik file ke sini atau klik untuk pilih</span>
          </button>
          {fileName ? (
            <div className="flex items-center gap-2 text-sm text-neutral-black bg-secondary-blue-extra rounded-xl p-3">
              <FileText className="w-4 h-4 text-lummy-500" /> {fileName}
            </div>
          ) : (
            <button onClick={() => setFileName("tiket-tulus-vip.pdf")} className="text-sm text-primary-navy font-medium hover:opacity-80 w-fit">
              Gak punya file? Pakai contoh
            </button>
          )}

          <div className="bg-secondary-gray-soft rounded-2xl p-4">
            <div className="text-xs text-neutral-gray mb-2">Demo: coba analisa beberapa jenis tiket</div>
            <div className="flex flex-wrap gap-2">
              {([
                { id: "good", label: "Tiket asli" },
                { id: "edited", label: "Tiket editan" },
                { id: "dup", label: "Barcode duplikat" },
              ] as const).map((s) => (
                <button key={s.id} onClick={() => setSample(s.id)} className={`px-3 py-1.5 rounded-lg text-sm border cursor-pointer ${sample === s.id ? "bg-primary-navy text-white border-primary-navy" : "bg-neutral-white text-neutral-gray border-neutral-light-gray-1"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <Button.Primary wrapperClass="w-fit" className="flex items-center gap-2" disabled={!fileName} onClick={analyze}>
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {analyzing ? "Menganalisis..." : "Analisis dengan AI"}
          </Button.Primary>
        </div>
      )}

      {/* Step 2: AI result + data */}
      {step === 1 && ai && (
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="font-fredoka font-semibold text-neutral-black flex items-center gap-2 mb-3"><ScanLine className="w-5 h-5 text-lummy-500" /> Cek keaslian AI</h3>
            <div className="grid sm:grid-cols-3 gap-3">
              <Check ok={!ai.pdfSuspicious} label="Forensik struktur PDF" detail={ai.pdfSuspicious ? "Ada jejak edit / re-export" : "Bersih, bukan editan"} />
              <Check ok={!ai.barcodeDuplicate} label="Barcode duplikat" detail={ai.barcodeDuplicate ? "Sudah pernah dijual" : "Unik, belum terdaftar"} />
              <Check ok={ai.forgeryScore < 60} label="Skor pemalsuan" detail={`${ai.forgeryScore}/100 · ${ai.forgeryScore < 60 ? "aman" : "perlu review"}`} />
            </div>
            {(ai.pdfSuspicious || ai.forgeryScore >= 60) && (
              <div className="mt-3 flex items-start gap-2 text-sm text-secondary-orange-dark bg-secondary-orange-soft rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> Kena flag. Normalnya masuk review manual admin dulu. (Skor buat review, bukan gate mutlak.)
              </div>
            )}
          </div>

          <div>
            <h3 className="font-fredoka font-semibold text-neutral-black mb-3">Data terisi otomatis <span className="text-neutral-gray font-normal text-sm">(cek & sesuaikan)</span></h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-neutral-gray">Event</span>
                <select value={eventId} onChange={(e) => { setEventId(e.target.value); const ev = getEventById(e.target.value); setTierId(ev?.tiers[0]?.id ?? ""); }} className="rounded-xl border border-lummy-500 px-4 py-3 text-sm text-neutral-black bg-neutral-white outline-none">
                  {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-neutral-gray">Kategori tiket</span>
                <select value={tierId} onChange={(e) => setTierId(e.target.value)} className="rounded-xl border border-lummy-500 px-4 py-3 text-sm text-neutral-black bg-neutral-white outline-none">
                  {event?.tiers.map((t) => <option key={t.id} value={t.id}>{t.name} · {formatIDR(t.faceValue)}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-neutral-gray">Nama pemesan asli</span>
                <input value={orderer} onChange={(e) => setOrderer(e.target.value)} className="rounded-xl border border-lummy-500 px-4 py-3 text-sm text-neutral-black outline-none" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-neutral-gray">Barcode (dari decoder)</span>
                <input value={barcode} readOnly className="rounded-xl border border-neutral-light-gray-1 bg-secondary-gray-soft px-4 py-3 text-sm text-neutral-gray font-mono outline-none" />
              </label>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(0)} className="px-5 py-3 rounded-2xl border-2 border-neutral-light-gray-1 text-neutral-gray text-sm flex items-center gap-1 cursor-pointer"><ArrowLeft className="w-4 h-4" /> Kembali</button>
            <Button.Primary className="flex items-center gap-2" onClick={() => setStep(2)}>Lanjut ke harga <ArrowRight className="w-4 h-4" /></Button.Primary>
          </div>
        </div>
      )}

      {/* Step 3: price + publish */}
      {step === 2 && event && tier && (
        <div className="flex flex-col gap-6">
          <div className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-6">
            <div className="flex justify-between text-sm mb-4">
              <span className="text-neutral-gray">Harga asli (face value)</span>
              <span className="font-medium text-neutral-black">{formatIDR(faceValue)}</span>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-neutral-gray">Harga jual kamu</span>
              <div className="flex items-center gap-2 rounded-xl border border-lummy-500 px-4 py-3">
                <span className="text-neutral-gray text-sm">IDR</span>
                <input type="number" value={price || ""} onChange={(e) => setPrice(Number(e.target.value))} className="w-full outline-none text-neutral-black" />
              </div>
            </label>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className={priceValid ? "text-secondary-green-dark" : "text-secondary-pink-dark"}>
                {priceValid ? `Dalam batas · markup ${markup}%` : "Di luar batas harga"}
              </span>
              <span className="text-neutral-gray text-xs">Batas {formatIDR(floor)} – {formatIDR(cap)} ({CAP_PCT}%)</span>
            </div>
          </div>

          {ai?.barcodeDuplicate ? (
            <div className="flex items-start gap-2 text-sm text-secondary-pink-dark bg-secondary-pink-soft rounded-2xl p-4">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              Barcode tiket ini sudah pernah dijual di OperTix. Listing diblokir otomatis, gak bisa publish. (Deterministik, bukan tebakan.)
            </div>
          ) : (
            <div className="flex items-start gap-2 text-sm text-neutral-gray bg-secondary-blue-extra rounded-2xl p-4">
              <ShieldCheck className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
              Setelah publish, tiket dijaga escrow. Kamu baru dibayar setelah konser selesai + pembeli beres serah-terima.
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="px-5 py-3 rounded-2xl border-2 border-neutral-light-gray-1 text-neutral-gray text-sm flex items-center gap-1 cursor-pointer"><ArrowLeft className="w-4 h-4" /> Kembali</button>
            <Button.Primary disabled={!priceValid || ai?.barcodeDuplicate} onClick={publish}>
              {ai?.barcodeDuplicate ? "Diblokir (duplikat)" : "Publish listing"}
            </Button.Primary>
          </div>
        </div>
      )}
    </div>
  );
}
