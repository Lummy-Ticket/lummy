"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  UploadCloud, FileText, ScanLine, CheckCircle2, AlertTriangle, Loader2, ArrowRight, ArrowLeft, Sparkles, ShieldCheck, ChevronDown, Minus, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getEvents, getEventById, getTier, CAP_PCT, FLOOR_PCT, useSellerListings, type ListingAI,
  isLateListing, LATE_LISTING_H,
} from "@/lib/mock";
import { PageContainer } from "@/components/layout/PageContainer";
import { useAccessGuard } from "@/lib/access";
import { PageGate } from "@/components/layout/PageGate";
import { useT, useFormatters } from "@/lib/i18n";

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

const STEPS = [
  { en: "Upload PDF", id: "Upload PDF" },
  { en: "AI check & details", id: "Cek AI & data" },
  { en: "Price & publish", id: "Harga & publish" },
];

export default function SellPage() {
  const t = useT();
  const { formatIDR } = useFormatters();
  const ready = useAccessGuard("account");
  const router = useRouter();
  const addListing = useSellerListings((s) => s.add);
  const fileInput = useRef<HTMLInputElement>(null);
  // Read per visit, not at module load: the catalogue changes with the date.
  const events = useMemo(() => getEvents(), []);

  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sample, setSample] = useState<"good" | "edited" | "dup">("good");
  const [analyzing, setAnalyzing] = useState(false);
  const [dragging, setDragging] = useState(false);

  // extracted / editable
  const [eventId, setEventId] = useState("ev-tulus");
  const [tierId, setTierId] = useState("t-tl-vip");
  const [orderer, setOrderer] = useState("");
  const [barcode, setBarcode] = useState("");
  const [ai, setAi] = useState<ListingAI | null>(null);
  const [price, setPrice] = useState<number>(0);
  const [qty, setQty] = useState(1);

  const event = getEventById(eventId);
  const tier = event ? getTier(event, tierId) : undefined;
  const faceValue = tier?.faceValue ?? 0;
  const cap = Math.round(faceValue * (CAP_PCT / 100));
  const floor = Math.round(faceValue * (FLOOR_PCT / 100));
  const markup = faceValue ? Math.round((price / faceValue - 1) * 100) : 0;

  // A duplicate barcode is a hard block. Tampering or a high score does not go live
  // straight away, it queues for admin review.
  const blocked = !!ai?.barcodeDuplicate;
  const flagged = !!ai && !blocked && (ai.pdfSuspicious || ai.forgeryScore >= 60);
  // Duplicate-pass fraud clusters in the hours before doors, when buyers are
  // panicking. Late listings still go live, but a human sees them first.
  const late = !!event && isLateListing(event.dateISO);

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
      setPrice(Math.round(faceValue * 1.15));
      setAnalyzing(false);
      setStep(1);
    }, 1800);
  };

  const publish = () => {
    if (!event || !tier || blocked) return;
    addListing({
      eventId: event.id, eventTitle: event.title, tierName: tier.name,
      askPrice: price, faceValue, quantity: qty, ai: ai!,
      status: flagged || late ? "review" : "active",
      lateListing: late,
    });
    toast.success(flagged || late ? t("Submitted for admin review", "Diajukan untuk review admin") : t("Listing is live, protected by escrow.", "Listing tayang, dijaga escrow."));
    router.push("/seller");
  };

  if (!ready) return <PageGate />;

  return (
    <PageContainer width="form">
      <h1 className="text-2xl md:text-3xl font-bold text-neutral-black">{t("Sell a ticket", "Jual tiket")}</h1>
      <p className="text-neutral-gray mt-1">
        {t("Upload the PDF. AI fills in the details and checks it is genuine.", "Upload PDF-nya. AI mengisi datanya otomatis dan mengecek keasliannya.")}
      </p>

      {/* Steps */}
      <div className="flex items-center gap-2 mt-6 mb-8">
        {STEPS.map((s, i) => (
          <div key={s.en} className="flex items-center gap-2">
            <span className={`w-7 h-7 rounded-full grid place-items-center text-xs font-fredoka font-bold ${i <= step ? "bg-primary-navy text-white" : "bg-neutral-light-gray-2 text-neutral-gray"}`}>{i + 1}</span>
            <span className={`text-sm ${i === step ? "text-neutral-black font-medium" : "text-neutral-gray"} hidden sm:block`}>{t(s.en, s.id)}</span>
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
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) setFileName(f.name);
            }}
            className={`border-2 border-dashed border-lummy-500 rounded-3xl py-12 flex flex-col items-center gap-3 text-center hover:bg-secondary-blue-light transition cursor-pointer ${dragging ? "bg-secondary-blue-light scale-[1.01]" : ""}`}
          >
            <UploadCloud className="w-10 h-10 text-lummy-500" />
            <span className="font-fredoka font-semibold text-neutral-black">{t("Upload your ticket PDF", "Upload PDF tiketmu")}</span>
            <span className="text-sm text-neutral-gray">{t("Drop a file here or click to choose", "Tarik file ke sini atau klik untuk pilih")}</span>
          </button>
          {fileName ? (
            <div className="flex items-center gap-2 text-sm text-neutral-black bg-secondary-blue-extra rounded-xl p-3">
              <FileText className="w-4 h-4 text-lummy-500" /> {fileName}
            </div>
          ) : (
            <button onClick={() => setFileName("tulus-vip-ticket.pdf")} className="text-sm text-primary-navy font-medium hover:opacity-80 w-fit">
              {t("No file handy? Use a sample", "Gak punya file? Pakai contoh")}
            </button>
          )}

          <div className="bg-secondary-gray-soft rounded-2xl p-4">
            <div className="text-xs text-neutral-gray mb-2">{t("Demo: try the analyser on different tickets", "Demo: coba analisa beberapa jenis tiket")}</div>
            <div className="flex flex-wrap gap-2">
              {([
                { id: "good", en: "Genuine ticket", id_: "Tiket asli", file: "tulus-genuine.pdf" },
                { id: "edited", en: "Edited ticket", id_: "Tiket editan", file: "tulus-edited.pdf" },
                { id: "dup", en: "Duplicate barcode", id_: "Barcode duplikat", file: "tulus-duplicate.pdf" },
              ] as const).map((s) => (
                <button key={s.id} onClick={() => { setSample(s.id); setFileName(s.file); }} className={`px-3 py-1.5 rounded-lg text-sm border cursor-pointer ${sample === s.id ? "bg-primary-navy text-white border-primary-navy" : "bg-neutral-white text-neutral-gray border-neutral-light-gray-1"}`}>
                  {t(s.en, s.id_)}
                </button>
              ))}
            </div>
          </div>

          <Button.Primary wrapperClass="w-fit" className="flex items-center gap-2" disabled={!fileName} onClick={analyze}>
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {analyzing ? t("Analysing...", "Menganalisis...") : t("Analyse with AI", "Analisis dengan AI")}
          </Button.Primary>
        </div>
      )}

      {/* Step 2: AI result + details */}
      {step === 1 && ai && (
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="font-fredoka font-semibold text-neutral-black flex items-center gap-2 mb-3"><ScanLine className="w-5 h-5 text-lummy-500" /> {t("AI authenticity check", "Cek keaslian AI")}</h3>
            <div className="grid sm:grid-cols-3 gap-3">
              <Check ok={!ai.pdfSuspicious} label={t("PDF structure forensics", "Forensik struktur PDF")} detail={ai.pdfSuspicious ? t("Traces of editing or re-export", "Ada jejak edit atau re-export") : t("Clean, no tampering", "Bersih, bukan editan")} />
              <Check ok={!ai.barcodeDuplicate} label={t("Duplicate barcode", "Barcode duplikat")} detail={ai.barcodeDuplicate ? t("Already sold once", "Sudah pernah dijual") : t("Unique, not registered before", "Unik, belum terdaftar")} />
              <Check ok={ai.forgeryScore < 60} label={t("Forgery score", "Skor pemalsuan")} detail={`${ai.forgeryScore}/100 · ${ai.forgeryScore < 60 ? t("in the clear", "aman") : t("needs review", "perlu review")}`} />
            </div>
            {(ai.pdfSuspicious || ai.forgeryScore >= 60) && (
              <div className="mt-3 flex items-start gap-2 text-sm text-secondary-orange-dark bg-secondary-orange-soft rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {t("Flagged, so this goes to manual admin review first. The score is a signal for a human, not an automatic verdict.", "Kena flag, jadi masuk review manual admin dulu. Skor itu sinyal buat manusia, bukan putusan otomatis.")}
              </div>
            )}
          </div>

          <div>
            <h3 className="font-fredoka font-semibold text-neutral-black mb-3">{t("Auto-filled details", "Data terisi otomatis")} <span className="text-neutral-gray font-normal text-sm">{t("(check and adjust)", "(cek & sesuaikan)")}</span></h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-neutral-gray">{t("Event", "Event")}</span>
                <div className="relative">
                  <select value={eventId} onChange={(e) => { setEventId(e.target.value); const ev = getEventById(e.target.value); setTierId(ev?.tiers[0]?.id ?? ""); }} className="appearance-none w-full rounded-xl border border-lummy-500 px-4 py-3 pr-10 text-sm text-neutral-black bg-neutral-white outline-none cursor-pointer">
                    {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
                  </select>
                  <ChevronDown className="w-4 h-4 text-neutral-gray absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-neutral-gray">{t("Ticket tier", "Kategori tiket")}</span>
                <div className="relative">
                  <select value={tierId} onChange={(e) => setTierId(e.target.value)} className="appearance-none w-full rounded-xl border border-lummy-500 px-4 py-3 pr-10 text-sm text-neutral-black bg-neutral-white outline-none cursor-pointer">
                    {event?.tiers.map((t) => <option key={t.id} value={t.id}>{t.name} · {formatIDR(t.faceValue)}</option>)}
                  </select>
                  <ChevronDown className="w-4 h-4 text-neutral-gray absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-neutral-gray">{t("Original buyer name", "Nama pemesan asli")}</span>
                <input value={orderer} onChange={(e) => setOrderer(e.target.value)} className="rounded-xl border border-lummy-500 px-4 py-3 text-sm text-neutral-black outline-none" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-neutral-gray">{t("Barcode (from the decoder)", "Barcode (dari decoder)")}</span>
                <input value={barcode} readOnly className="rounded-xl border border-neutral-light-gray-1 bg-secondary-gray-soft px-4 py-3 text-sm text-neutral-gray font-mono outline-none" />
              </label>
              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-xs text-neutral-gray">{t("Tickets in this PDF", "Jumlah tiket dalam PDF ini")}</span>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-10 h-10 rounded-xl border border-lummy-500 grid place-items-center text-lummy-500 hover:bg-secondary-blue-light transition cursor-pointer"><Minus className="w-4 h-4" /></button>
                  <span className="font-fredoka font-bold text-lg text-neutral-black w-8 text-center">{qty}</span>
                  <button type="button" onClick={() => setQty((q) => Math.min(8, q + 1))} className="w-10 h-10 rounded-xl border border-lummy-500 grid place-items-center text-lummy-500 hover:bg-secondary-blue-light transition cursor-pointer"><Plus className="w-4 h-4" /></button>
                  <span className="text-xs text-neutral-gray">{t("Sold as one set, seated together.", "Dijual sebagai 1 set, duduk bersebelahan.")}{qty > 1 ? t(` All ${qty} at once.`, ` ${qty} tiket sekaligus.`) : ""}</span>
                </div>
              </label>
            </div>
          </div>

          <div className="flex gap-3">
            <Button.Ghost onClick={() => setStep(0)}><ArrowLeft className="w-4 h-4" /> {t("Back", "Kembali")}</Button.Ghost>
            <Button.Primary className="flex items-center gap-2" onClick={() => { setPrice((p) => Math.min(Math.max(p || cap, floor), cap)); setStep(2); }}>{t("Continue to price", "Lanjut ke harga")} <ArrowRight className="w-4 h-4" /></Button.Primary>
          </div>
        </div>
      )}

      {/* Step 3: price + publish */}
      {step === 2 && event && tier && (
        <div className="flex flex-col gap-6">
          <div className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-6">
            <div className="flex justify-between text-sm mb-5">
              <span className="text-neutral-gray">{t("Face value", "Harga asli")}</span>
              <span className="font-medium text-neutral-black">{formatIDR(faceValue)} <span className="text-neutral-gray font-normal"> {t("each", "/tiket")}</span></span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-neutral-gray">{t("Your asking price, per ticket", "Harga jual kamu, per tiket")}</span>
              <span className="font-fredoka font-bold text-xl text-lummy-500">{formatIDR(price)}</span>
            </div>
            <input type="range" min={floor} max={cap} step={10000} value={price} onChange={(e) => setPrice(Number(e.target.value))} className="w-full accent-[#3A6CB4] cursor-pointer" />
            <div className="flex justify-between items-center text-xs text-neutral-gray mt-2">
              <span className="flex flex-col"><span>{formatIDR(floor)}</span><span className="text-[10px]">{t("min 50%", "min 50%")}</span></span>
              <span className={`font-medium ${markup >= 0 ? "text-secondary-green-dark" : "text-secondary-orange-dark"}`}>{markup >= 0 ? `+${markup}%` : `${markup}%`} {t("vs face value", "dari harga asli")}</span>
              <span className="flex flex-col text-right"><span>{formatIDR(cap)}</span><span className="text-[10px]">{t("max 150%", "maks 150%")}</span></span>
            </div>
            {qty > 1 && (
              <div className="mt-4 pt-4 border-t border-dashed border-neutral-light-gray-1 flex justify-between text-sm">
                <span className="text-neutral-gray">{t(`Total for ${qty} tickets (one set)`, `Total ${qty} tiket (1 set)`)}</span>
                <span className="font-fredoka font-bold text-neutral-black">{formatIDR(price * qty)}</span>
              </div>
            )}
          </div>

          {late && !blocked && (
            <div className="flex items-start gap-2 text-sm text-secondary-brown-dark bg-secondary-gold-soft rounded-2xl p-4">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{t(
                `This show starts within ${LATE_LISTING_H} hours. Most duplicate-ticket fraud happens in exactly this window, to buyers in a hurry, so last-minute listings are reviewed by a person before they go live.`,
                `Acaranya mulai dalam ${LATE_LISTING_H} jam. Penipuan tiket ganda paling banyak terjadi persis di rentang ini, ke pembeli yang buru-buru, jadi listing menit terakhir ditinjau manusia dulu sebelum tayang.`
              )}</span>
            </div>
          )}
          {blocked ? (
            <div className="flex items-start gap-2 text-sm text-secondary-pink-dark bg-secondary-pink-soft rounded-2xl p-4">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              {t("This barcode has already been sold on Lummy. The listing is blocked automatically. That check is deterministic, not a guess.", "Barcode ini sudah pernah dijual di Lummy. Listing diblokir otomatis. Pengecekannya deterministik, bukan tebakan.")}
            </div>
          ) : flagged ? (
            <div className="flex items-start gap-2 text-sm text-secondary-orange-dark bg-secondary-orange-soft rounded-2xl p-4">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{t("AI flagged this ticket, either on forgery score or PDF structure. It will not go live yet, it joins the admin review queue. If it passes, buyers can see it.", "AI menandai tiket ini, entah dari skor pemalsuan atau struktur PDF. Belum langsung tayang, masuk antrian review admin dulu. Kalau lolos, baru bisa dilihat pembeli.")}</span>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-sm text-neutral-gray bg-secondary-blue-extra rounded-2xl p-4">
              <ShieldCheck className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
              {t("Once published, the sale is escrow-backed. You get paid after the show is over and the dispute window has passed.", "Setelah publish, penjualannya dijaga escrow. Kamu dibayar setelah konser selesai dan masa sengketa lewat.")}
            </div>
          )}

          <div className="flex gap-3">
            <Button.Ghost onClick={() => setStep(1)}><ArrowLeft className="w-4 h-4" /> {t("Back", "Kembali")}</Button.Ghost>
            <Button.Primary disabled={blocked} onClick={publish}>
              {blocked ? t("Blocked (duplicate)", "Diblokir (duplikat)") : flagged || late ? t("Submit for review", "Ajukan untuk review") : t("Publish listing", "Publish listing")}
            </Button.Primary>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
