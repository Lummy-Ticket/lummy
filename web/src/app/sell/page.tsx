"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  UploadCloud, FileText, ScanLine, CheckCircle2, AlertTriangle, Loader2, ArrowRight, ArrowLeft, ShieldCheck, Minus, Plus, IdCard, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TransferPolicyNote } from "@/components/common/TransferPolicyNote";
import {
  getTier, CAP_PCT, FLOOR_PCT, useSellerListings, useUser, type ListingAI,
  isLateListing, LATE_LISTING_H, resaleAllowed,
} from "@/lib/mock";
import { SAMPLE_SIGNALS, type SampleTicket } from "@/lib/listings/rules";
import { FILL_BY, ListingError, checkTicketFile, createListing, fillFromTicket, useTicketFill, useTicketReader, type TicketFill } from "@/lib/listings/client";
import { factDiffs, formatName, isDuplicate, isPastDay, MIN_HOLDER_CHARS, reasonText, reviewReasons, toListingChecks, type TicketCheck } from "@/lib/tickets/checks";
import { PageContainer } from "@/components/layout/PageContainer";
import { useCatalogue } from "@/lib/catalogue";
import { FEATURES } from "@/lib/features";
import { useAccessGuard } from "@/lib/access";
import { PageGate } from "@/components/layout/PageGate";
import { NativeSelect } from "@/components/ui/select-menu";
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

type T = (en: string, id: string) => string;

/** Why the form was not filled in from the ticket, in the seller's words. */
function fillMessage(outcome: Exclude<TicketFill["outcome"], "filled">, t: T) {
  switch (outcome) {
    case "no_text":
      return t("This PDF has no text to read (a scan or a photo), so fill it in yourself.", "PDF ini tidak punya teks yang bisa dibaca (hasil scan atau foto), jadi isi sendiri ya.");
    case "no_ticket_page":
      return t("No page of this PDF reads like a ticket, so fill it in yourself.", "Tidak ada halaman yang terbaca sebagai tiket, jadi isi sendiri ya.");
    case "holder_not_found":
      return t(
        "The buyer's name was not found on the ticket, so nothing was sent. Type it exactly as the ticket prints it, every word, and try again. Listed as it is, a person checks the ticket first.",
        "Nama pemesan tidak ketemu di tiket, jadi tidak ada yang dikirim. Ketik persis seperti tercetak di tiket, semua katanya, lalu coba lagi. Kalau tetap begini, listing dicek admin dulu."
      );
    case "personal_data_left":
      return t(
        "Something personal could not be taken out safely, so the ticket was not sent. Fill it in yourself.",
        "Ada data pribadi yang tidak bisa dibuang dengan aman, jadi tiketnya tidak dikirim. Isi sendiri ya."
      );
    case "no_shows":
      return t("No show is on sale to match it with.", "Belum ada acara yang dijual untuk dicocokkan.");
    default:
      return t("Filling in is not available right now. Fill it in yourself.", "Isi otomatis sedang tidak tersedia. Isi sendiri ya.");
  }
}

/** The sample tickets' file names, as a seller would see them. */
const SAMPLE_FILES: Record<SampleTicket, string> = {
  good: "tulus-genuine.pdf",
  edited: "tulus-edited.pdf",
  dup: "tulus-duplicate.pdf",
};
const SAMPLE_NAMES = new Set([...Object.values(SAMPLE_FILES), "tulus-vip-ticket.pdf"]);

const STEPS = [
  { en: "Upload PDF", id: "Upload PDF" },
  { en: "Check & details", id: "Cek & data" },
  { en: "Price & publish", id: "Harga & publish" },
];

export default function SellPage() {
  const t = useT();
  const { formatIDR, formatEventDate } = useFormatters();
  const ready = useAccessGuard("account");
  const router = useRouter();
  const addListing = useSellerListings((s) => s.add);
  // An account's listing goes to the database through the server; a sample persona's stays in
  // this browser, as before.
  const account = useUser((s) => !!s.user?.account);
  const [publishing, setPublishing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // An account on a server that checks real PDFs uploads its own ticket; the sample tickets stay
  // for demos. `check` is what the server read in that file.
  const reader = useTicketReader(account);
  const realUpload = account && reader === true;
  // With an AI provider on this server, a real ticket can fill the form in (docs/09 §5.1), and the
  // page names the provider wherever it says the ticket is read.
  const fillBy = useTicketFill(realUpload);
  const fillName = fillBy ? FILL_BY[fillBy] : null;
  const [filling, setFilling] = useState(false);
  const [fill, setFill] = useState<TicketFill | null>(null);
  const [ticketFile, setTicketFile] = useState<File | null>(null);
  const [check, setCheck] = useState<TicketCheck | null>(null);
  // A real ticket carries someone's name and maybe their ID number, so publishing it asks first.
  const [agreed, setAgreed] = useState(false);
  const sendsRealFile = !!(check && ticketFile);
  const catalogue = useCatalogue();
  const [fileName, setFileName] = useState<string | null>(null);
  // Selling for a show priced in USDC is not open yet: its listings are added by the team.
  const events = catalogue.events.filter((e) => e.currency !== "USDC");

  const [step, setStep] = useState(0);
  const [sample, setSample] = useState<SampleTicket>("good");
  const [analyzing, setAnalyzing] = useState(false);
  const [dragging, setDragging] = useState(false);

  // extracted / editable
  const [eventId, setEventId] = useState("ev-5sos-jakarta");
  const [tierId, setTierId] = useState("t-5sos-cat3");
  const [orderer, setOrderer] = useState("");
  // With the AI step on, a real ticket is read by a model, here and again at publish. The original
  // buyer's name, typed as printed, is what keeps it out of what the model reads, so it comes first.
  const holderNeeded = !!check && !!fillName;
  const holderTyped = orderer.trim().length >= MIN_HOLDER_CHARS;
  const [barcode, setBarcode] = useState("");
  const [ai, setAi] = useState<ListingAI | null>(null);
  const [price, setPrice] = useState<number>(0);
  const [qty, setQty] = useState(1);
  // Venues that still check ID want the seller's KTP next to the letter of authorisation.
  // It is staged now so nobody scrambles for it on the day (docs/02, gate KTP).
  const [gateKtp, setGateKtp] = useState(false);
  const [ktpFile, setKtpFile] = useState<string | null>(null);
  const ktpInput = useRef<HTMLInputElement>(null);
  const ktpMissing = gateKtp && !ktpFile;

  const event = catalogue.eventById(eventId);
  const tier = event ? getTier(event, tierId) : undefined;
  const faceValue = tier?.faceValue ?? 0;
  const cap = Math.round(faceValue * (CAP_PCT / 100));
  const floor = Math.round(faceValue * (FLOOR_PCT / 100));
  const markup = faceValue ? Math.round((price / faceValue - 1) * 100) : 0;

  // A duplicate barcode is a hard block. Tampering or a high score does not go live
  // straight away, it queues for admin review; so does a real PDF with no barcode to hold.
  const review = check ? reviewReasons(toListingChecks(check)) : [];
  // What the ticket prints, once the AI step has filled the form in: another category or day than
  // the one picked sends the listing to a person, as the server decides again at publish.
  const facts = fill?.outcome === "filled" ? fill.facts : null;
  const aiDiffs = facts && event && tier ? factDiffs(facts, { tierId: tier.id, startsAt: event.dateISO }) : [];
  const blocked = check ? isDuplicate(check) : !!ai?.barcodeDuplicate;
  const flagged = !!ai && !blocked && (check ? review.length > 0 || aiDiffs.length > 0 : ai.pdfSuspicious || ai.forgeryScore >= 60);
  // A ticket for a day already gone cannot be sold, whatever show is picked.
  const pastTicket = isPastDay(facts?.date ?? null);
  // One barcode is one ticket, and the buyer gets the whole PDF, so that count is not the seller's to set.
  const lockedQty = !!check && check.barcodes.length > 0;
  const tooMany = !!check && check.barcodes.length > 8;
  // Duplicate-pass fraud clusters in the hours before doors, when buyers are
  // panicking. Late listings still go live, but a human sees them first.
  const late = !!event && isLateListing(event.dateISO);
  // The organiser's rule for this show: closed to resale, or a name the gate checks.
  const closed = !!event && !resaleAllowed(event.transferPolicy);
  const nameChecked = event?.transferPolicy === "letter" || event?.transferPolicy === "id_match";

  /** A file chosen from disk, for an account whose server checks real PDFs. */
  const pickTicket = (f: File | null | undefined) => {
    if (!f) return;
    setTicketFile(f);
    setFileName(f.name);
    setCheck(null);
    setFill(null);
  };

  /** Asks the server to read the show, category, date and price off the ticket, and picks them. */
  const fillIn = async () => {
    if (!ticketFile) return;
    setFilling(true);
    try {
      const res = await fillFromTicket(ticketFile, orderer);
      setFill(res);
      // The show and category the ticket prints, and nothing picked where it found none: a show or
      // category left as it was would be listed without the seller ever choosing it.
      if (res.outcome === "filled") {
        const ev = res.eventId ? catalogue.eventById(res.eventId) : undefined;
        setEventId(ev?.id ?? "");
        setTierId(ev?.tiers.some((x) => x.id === res.facts.tierId) ? res.facts.tierId! : "");
      }
    } catch (e) {
      setFill(null);
      toast.error(`${t("Could not fill it in", "Gagal mengisi otomatis")}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setFilling(false);
    }
  };

  const analyzeReal = async (file: File) => {
    setAnalyzing(true);
    try {
      const res = await checkTicketFile(file);
      setCheck(res);
      setFill(null);
      setAi({ autofilled: false, forgeryScore: res.score, barcodeDuplicate: isDuplicate(res), pdfSuspicious: res.suspicious });
      setOrderer("");
      setBarcode(res.barcodes.map((b) => `${formatName(b.format)}${b.tail ? ` ...${b.tail}` : ""}`).join(", "));
      if (res.barcodes.length) setQty(Math.min(res.barcodes.length, 8));
      setPrice(Math.round(faceValue * 1.15));
      setStep(1);
    } catch (e) {
      toast.error(`${t("Could not check the file", "File gagal dicek")}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const analyze = () => {
    if (realUpload && ticketFile) return void analyzeReal(ticketFile);
    // An account lists a sample ticket, and one is always picked, so name its file here.
    setCheck(null);
    if (!fileName) setFileName(SAMPLE_FILES[sample]);
    setAnalyzing(true);
    setTimeout(() => {
      // The same table the server uses, so the page shows what the server will decide.
      const result: ListingAI = SAMPLE_SIGNALS[sample];
      setAi(result);
      setOrderer("Zahra Amelia");
      setBarcode("TIX-8842-7731-2290");
      setPrice(Math.round(faceValue * 1.15));
      setAnalyzing(false);
      setStep(1);
    }, 1800);
  };

  const publishAccount = async () => {
    if (!event || !tier) return;
    setPublishing(true);
    try {
      const base = { eventId: event.id, tierId: tier.id, askPrice: price, quantity: qty, splittable: false, gateKtp };
      const res = await createListing(check && ticketFile ? { ...base, ticket: ticketFile, holder: orderer } : { ...base, sample });
      toast.success(res.status === "review" ? t("Submitted for admin review", "Diajukan untuk review admin") : t("Listing is live, protected by escrow.", "Listing tayang, dijaga escrow."));
      router.push("/seller");
      // The catalogue lives in the root layout: fetch it again so the new listing shows.
      router.refresh();
    } catch (e) {
      setPublishing(false);
      toast.error(`${t("Not published", "Gagal publish")}: ${e instanceof ListingError || e instanceof Error ? e.message : String(e)}`);
    }
  };

  const publish = () => {
    if (!event || !tier || blocked || ktpMissing || closed || (sendsRealFile && !agreed)) return;
    if (account) return void publishAccount();
    addListing({
      eventId: event.id, eventTitle: event.title, tierName: tier.name,
      askPrice: price, faceValue, quantity: qty, ai: ai!,
      status: flagged || late ? "review" : "active",
      lateListing: late,
      gateKtp,
    });
    toast.success(flagged || late ? t("Submitted for admin review", "Diajukan untuk review admin") : t("Listing is live, protected by escrow.", "Listing tayang, dijaga escrow."));
    router.push("/seller");
  };

  if (!ready) return <PageGate />;

  return (
    <PageContainer width="form">
      <h1 className="text-2xl md:text-3xl font-bold text-neutral-black">{t("Sell a ticket", "Jual tiket")}</h1>
      <p className="text-neutral-gray mt-1">
        {t(
          "Upload the PDF from the organiser. Lummy reads every barcode in it and checks the file was not edited.",
          "Upload PDF dari penyelenggara. Lummy membaca semua barcode di dalamnya dan mengecek file-nya bukan editan."
        )}
      </p>

      {/* Steps */}
      <div className="flex items-center gap-2 mt-6 mb-8">
        {STEPS.map((s, i) => (
          <div key={s.en} className="flex items-center gap-2">
            <span className={`w-7 h-7 rounded-full grid place-items-center text-xs font-bold ${i <= step ? "bg-primary-navy text-white" : "bg-neutral-light-gray-2 text-neutral-gray"}`}>{i + 1}</span>
            <span className={`text-sm ${i === step ? "text-neutral-black font-medium" : "text-neutral-gray"} hidden sm:block`}>
              {t(s.en, s.id)}
            </span>
            {i < STEPS.length - 1 && <span className="w-6 h-px bg-neutral-light-gray-1" />}
          </div>
        ))}
      </div>

      {/* Step 1: upload */}
      {step === 0 && (
        <div className="flex flex-col gap-5">
          {account && !realUpload ? (
            reader === null ? (
              // Asking the server whether it checks real files; the box keeps its size meanwhile.
              <div className="border-2 border-dashed border-neutral-light-gray-1 rounded-3xl py-16 grid place-items-center">
                <Loader2 className="w-6 h-6 text-neutral-gray animate-spin" />
              </div>
            ) : (
            <div data-upload-closed className="border-2 border-dashed border-neutral-light-gray-1 rounded-3xl py-10 px-6 flex flex-col items-center gap-3 text-center bg-secondary-gray-soft/60">
              <UploadCloud className="w-10 h-10 text-neutral-gray" />
              <span className="font-semibold text-neutral-black">{t("Uploading your own PDF is off on this server", "Upload PDF sendiri belum aktif di server ini")}</span>
              <span className="text-sm text-neutral-gray max-w-md">
                {t(
                  "This server does not read real files yet, so a listing is made from one of the sample tickets below. Nothing claims to have checked a file it never read.",
                  "Server ini belum membaca file asli, jadi listing dibuat dari salah satu tiket contoh di bawah. Tidak ada yang mengaku sudah mengecek file yang tidak pernah dibacanya."
                )}
              </span>
            </div>
            )
          ) : (
          <>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (realUpload) pickTicket(f);
              else setFileName(f?.name ?? null);
            }}
          />
          <button
            data-upload={realUpload ? "real" : "sample"}
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (!f) return;
              if (realUpload) pickTicket(f);
              else setFileName(f.name);
            }}
            className={`border-2 border-dashed border-lummy-500 rounded-3xl py-12 flex flex-col items-center gap-3 text-center hover:bg-secondary-blue-light transition cursor-pointer ${dragging ? "bg-secondary-blue-light scale-[1.01]" : ""}`}
          >
            <UploadCloud className="w-10 h-10 text-lummy-500" />
            <span className="font-semibold text-neutral-black">{t("Upload your ticket PDF", "Upload PDF tiketmu")}</span>
            <span className="text-sm text-neutral-gray">
              {realUpload
                ? t("The PDF from the organiser, up to 4 MB. Drop it here or click to choose", "PDF dari penyelenggara, maksimal 4 MB. Tarik ke sini atau klik untuk pilih")
                : t("Drop a file here or click to choose", "Tarik file ke sini atau klik untuk pilih")}
            </span>
          </button>
          {fileName ? (
            <div className="flex items-center gap-2 text-sm text-neutral-black bg-secondary-blue-extra rounded-xl p-3">
              <FileText className="w-4 h-4 text-lummy-500" /> {fileName}
            </div>
          ) : !realUpload ? (
            <button onClick={() => setFileName("tulus-vip-ticket.pdf")} className="text-sm text-primary-navy font-medium hover:opacity-80 w-fit">
              {t("No file handy? Use a sample", "Gak punya file? Pakai contoh")}
            </button>
          ) : null}
          {!account && fileName && !SAMPLE_NAMES.has(fileName) && (
            <p data-simulated-check className="text-xs text-neutral-gray">
              {t(
                "A demo account only simulates the check: the result comes from the sample you pick below, not from this file. Sign in with email to check a real PDF.",
                "Akun demo cuma menyimulasikan cek: hasilnya dari contoh yang kamu pilih di bawah, bukan dari file ini. Masuk dengan email untuk mengecek PDF asli."
              )}
            </p>
          )}
          </>
          )}
          {account && !realUpload && fileName && (
            <div className="flex items-center gap-2 text-sm text-neutral-black bg-secondary-blue-extra rounded-xl p-3">
              <FileText className="w-4 h-4 text-lummy-500" /> {fileName}
            </div>
          )}

          <div className="bg-secondary-gray-soft rounded-2xl p-4">
            <div className="text-xs text-neutral-gray mb-2">
              {realUpload
                ? t("No file handy? List a sample ticket instead", "Gak punya file? Jual tiket contoh saja")
                : account
                  ? t("Pick a sample ticket to list", "Pilih tiket contoh untuk dijual")
                  : t("Demo: try the check on different tickets", "Demo: coba cek beberapa jenis tiket")}
            </div>
            <div className="flex flex-wrap gap-2">
              {([
                { id: "good", en: "Genuine ticket", id_: "Tiket asli" },
                { id: "edited", en: "Edited ticket", id_: "Tiket editan" },
                { id: "dup", en: "Duplicate barcode", id_: "Barcode duplikat" },
              ] as const).map((s) => {
                // With real uploads on, no sample counts as picked until one is clicked.
                const picked = !ticketFile && sample === s.id && (!realUpload || fileName === SAMPLE_FILES[s.id]);
                return (
                  <button
                    key={s.id}
                    onClick={() => { setSample(s.id); setFileName(SAMPLE_FILES[s.id]); setTicketFile(null); setCheck(null); }}
                    className={`px-3 py-1.5 rounded-lg text-sm border cursor-pointer ${picked ? "bg-primary-navy text-white border-primary-navy" : "bg-neutral-white text-neutral-gray border-neutral-light-gray-1"}`}
                  >
                    {t(s.en, s.id_)}
                  </button>
                );
              })}
            </div>
          </div>

          <Button.Primary wrapperClass="w-fit" className="flex items-center gap-2" disabled={analyzing || (realUpload ? !fileName : !fileName && !account)} onClick={analyze}>
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
            {analyzing ? t("Reading the ticket...", "Membaca tiket...") : t("Check the ticket", "Cek tiketnya")}
          </Button.Primary>
        </div>
      )}

      {/* Step 2: the check + details */}
      {step === 1 && ai && (
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="font-semibold text-neutral-black flex items-center gap-2 mb-3">
              <ScanLine className="w-5 h-5 text-lummy-500" /> {t("Ticket check", "Cek tiket")}
            </h3>
            <div className="grid sm:grid-cols-3 gap-3">
              <Check
                ok={!ai.pdfSuspicious}
                label={t("PDF structure forensics", "Forensik struktur PDF")}
                detail={
                  !ai.pdfSuspicious
                    ? t("Clean, no tampering", "Bersih, bukan editan")
                    : check?.reasons.some((r) => r.code === "void_marker")
                      ? t("Marked as a sample, not a ticket", "Bertanda contoh, bukan tiket")
                      : t("Traces of editing or re-export", "Ada jejak edit atau re-export")
                }
              />
              {check ? (
                <Check
                  ok={!blocked && check.barcodes.length > 0}
                  label={t("Barcode", "Barcode")}
                  detail={
                    blocked
                      ? t("Already behind another listing on Lummy", "Sudah ada di listing lain di Lummy")
                      : check.barcodes.length === 0
                        ? t("None could be read", "Tidak ada yang terbaca")
                        : t(`${check.barcodes.length} read, none listed before`, `${check.barcodes.length} terbaca, belum pernah dijual`)
                  }
                />
              ) : (
                <Check ok={!ai.barcodeDuplicate} label={t("Duplicate barcode", "Barcode duplikat")} detail={ai.barcodeDuplicate ? t("Already sold once", "Sudah pernah dijual") : t("Unique, not registered before", "Unik, belum terdaftar")} />
              )}
              {check ? (
                // With a real file the card follows the outcome, so it never reads "in the clear"
                // next to a flag raised by the file's structure.
                <Check
                  ok={!review.includes("flagged")}
                  label={t("Forgery score", "Skor pemalsuan")}
                  detail={`${ai.forgeryScore}/100 · ${review.includes("flagged") ? t("goes to review", "masuk review") : t("in the clear", "aman")}`}
                />
              ) : (
                <Check ok={ai.forgeryScore < 60} label={t("Forgery score", "Skor pemalsuan")} detail={`${ai.forgeryScore}/100 · ${ai.forgeryScore < 60 ? t("in the clear", "aman") : t("needs review", "perlu review")}`} />
              )}
            </div>
            {check && check.reasons.length > 0 && (
              <ul data-check-reasons className="mt-3 flex flex-col gap-1 text-sm text-neutral-black">
                {check.reasons.map((r) => (
                  <li key={r.code} className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-secondary-orange-dark" /> {reasonText(r, t)}
                  </li>
                ))}
              </ul>
            )}
            {(check ? review.includes("flagged") : ai.pdfSuspicious || ai.forgeryScore >= 60) && (
              <div className="mt-3 flex items-start gap-2 text-sm text-secondary-orange-dark bg-secondary-orange-soft rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {t("Flagged, so this goes to manual admin review first. The score is a signal for a human, not an automatic verdict.", "Kena flag, jadi masuk review manual admin dulu. Skor itu sinyal buat manusia, bukan putusan otomatis.")}
              </div>
            )}
            {check && !blocked && review.includes("no_barcode") && (
              <div className="mt-3 flex items-start gap-2 text-sm text-secondary-orange-dark bg-secondary-orange-soft rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                {t(
                  "No barcode could be read, so nothing would stop the same ticket being listed twice. A person checks it before it goes live.",
                  "Tidak ada barcode yang terbaca, jadi tidak ada yang mencegah tiket yang sama dijual dua kali. Manusia mengeceknya dulu sebelum tayang."
                )}
              </div>
            )}
            {check && !blocked && review.includes("unread_pages") && (
              <div className="mt-3 flex items-start gap-2 text-sm text-secondary-orange-dark bg-secondary-orange-soft rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                {t(
                  `Only ${check.scannedPages} of ${check.pages} pages could be read in time. A person checks the rest before it goes live.`,
                  `Baru ${check.scannedPages} dari ${check.pages} halaman yang sempat dibaca. Manusia mengecek sisanya dulu sebelum tayang.`
                )}
              </div>
            )}
            {tooMany && (
              <div className="mt-3 flex items-start gap-2 text-sm text-secondary-pink-dark bg-secondary-pink-soft rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                {t(
                  `This PDF holds ${check!.barcodes.length} tickets, and a listing takes at most 8. Split the PDF and list each part.`,
                  `PDF ini berisi ${check!.barcodes.length} tiket, sedangkan satu listing paling banyak 8. Pisahkan PDF-nya lalu jual per bagian.`
                )}
              </div>
            )}
          </div>

          <div>
            <h3 className="font-semibold text-neutral-black mb-3">
              {check ? t("Ticket details", "Data tiket") : t("Details from the sample", "Data dari tiket contoh")}{" "}
              <span className="text-neutral-gray font-normal text-sm">{check ? t("(fill in from your ticket)", "(isi sesuai tiketmu)") : t("(check and adjust)", "(cek & sesuaikan)")}</span>
            </h3>
            {check && fillName && (
              <div data-fill className="mb-4 rounded-2xl border border-lummy-500 bg-secondary-blue-extra p-4 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <ScanLine className="w-5 h-5 text-lummy-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-neutral-black">{t("Fill this in from your ticket", "Isi dari tiketmu")}</div>
                    <p className="text-xs text-neutral-gray mt-0.5 leading-relaxed">
                      {t(
                        `${fillName.en} reads the ticket's text after the buyer's name, ID and phone numbers, email and order codes are taken out, and picks the show and category for you. Check what it fills in.`,
                        `${fillName.id} membaca teks tiketnya setelah nama pemesan, nomor KTP dan HP, email, dan kode pesanan dibuang, lalu memilihkan acara dan kategorinya. Cek lagi hasilnya.`
                      )}
                    </p>
                  </div>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-neutral-gray">{t("Original buyer name", "Nama pemesan asli")}</span>
                  <input
                    data-holder
                    value={orderer}
                    onChange={(e) => setOrderer(e.target.value)}
                    autoComplete="off"
                    placeholder={t("As printed on the ticket", "Seperti tercetak di tiket")}
                    className="rounded-xl border border-lummy-500 bg-neutral-white px-4 py-3 text-sm text-neutral-black outline-none"
                  />
                  {!holderTyped && (
                    <span className="text-xs text-neutral-gray">
                      {t("Needed to go on: the name is taken out before the ticket is read.", "Wajib diisi untuk lanjut: nama ini dibuang dulu sebelum tiketnya dibaca.")}
                    </span>
                  )}
                </label>
                <Button.Ghost className="w-fit text-sm" disabled={filling || !holderTyped} onClick={() => void fillIn()}>
                  {filling ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
                  {filling ? t("Reading the ticket...", "Membaca tiket...") : fill ? t("Fill in again", "Isi ulang") : t("Fill in from the ticket", "Isi dari tiket")}
                </Button.Ghost>
                {fill?.outcome === "filled" ? (
                  <div data-fill-result="filled" className="text-xs text-neutral-black flex flex-col gap-1.5">
                    <span>
                      {t("Read from the ticket", "Terbaca dari tiket")}:{" "}
                      {[
                        fill.facts.eventTitle,
                        fill.facts.date && formatEventDate(`${fill.facts.date}T12:00:00+07:00`),
                        fill.facts.tierPrinted,
                        fill.facts.seat,
                        fill.facts.printedPrice && formatIDR(fill.facts.printedPrice),
                        fill.facts.quantity && fill.facts.quantity > 1 ? t(`${fill.facts.quantity} tickets`, `${fill.facts.quantity} tiket`) : null,
                      ].filter(Boolean).join(" · ")}
                    </span>
                    <span className="text-neutral-gray">
                      {fill.eventId && catalogue.eventById(fill.eventId)
                        ? fill.facts.tierId
                          ? t("The show and category are picked below. Check them.", "Acara dan kategorinya sudah dipilihkan di bawah. Cek lagi.")
                          : t("The show is picked below. Its category was not found, so pick it yourself.", "Acaranya sudah dipilihkan di bawah. Kategorinya tidak ketemu, jadi pilih sendiri.")
                        : t("The show was not found in the catalogue: pick it below.", "Acaranya tidak ketemu di katalog: pilih sendiri di bawah.")}
                    </span>
                    {pastTicket && fill.facts.date && (
                      <span data-fill-past className="flex items-start gap-1.5 text-secondary-pink-dark">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                        {t(
                          `This ticket is for ${formatEventDate(`${fill.facts.date}T12:00:00+07:00`)}, which has passed. A ticket for a show that is over cannot be listed.`,
                          `Tiket ini untuk ${formatEventDate(`${fill.facts.date}T12:00:00+07:00`)}, yang sudah lewat. Tiket untuk acara yang sudah lewat tidak bisa dijual.`
                        )}
                      </span>
                    )}
                    {aiDiffs.includes("tier") && (
                      <span className="flex items-start gap-1.5 text-secondary-orange-dark">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                        {t("The category printed on the ticket is not the one picked. Listed like this, a person checks it first.", "Kategori yang tercetak di tiket bukan yang dipilih. Kalau tetap begini, listing dicek admin dulu.")}
                      </span>
                    )}
                    {aiDiffs.includes("date") && event && fill.facts.date && (
                      <span className="flex items-start gap-1.5 text-secondary-orange-dark">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                        {t(
                          `The ticket is for ${formatEventDate(`${fill.facts.date}T12:00:00+07:00`)}, the show is on ${formatEventDate(event.dateISO)}. Listed like this, a person checks it first.`,
                          `Tiketnya untuk ${formatEventDate(`${fill.facts.date}T12:00:00+07:00`)}, acaranya ${formatEventDate(event.dateISO)}. Kalau tetap begini, listing dicek admin dulu.`
                        )}
                      </span>
                    )}
                    {!!fill.facts.printedPrice && !!faceValue && Math.abs(fill.facts.printedPrice - faceValue) > faceValue / 100 && (
                      <span className="text-neutral-gray">
                        {t(
                          `The printed price, ${formatIDR(fill.facts.printedPrice)}, is not this category's face value of ${formatIDR(faceValue)}. The price band follows the category.`,
                          `Harga tercetak ${formatIDR(fill.facts.printedPrice)} beda dengan harga asli kategori ini, ${formatIDR(faceValue)}. Batas harga jual tetap mengikuti kategori.`
                        )}
                      </span>
                    )}
                  </div>
                ) : fill ? (
                  <p data-fill-result={fill.outcome} className="text-xs text-secondary-orange-dark">{fillMessage(fill.outcome, t)}</p>
                ) : null}
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-neutral-gray">{t("Event", "Event")}</span>
                <NativeSelect value={eventId} onChange={(e) => { setEventId(e.target.value); const ev = catalogue.eventById(e.target.value); setTierId(ev?.tiers[0]?.id ?? ""); }}>
                  {!event && <option value="" disabled>{t("Pick the show", "Pilih acaranya")}</option>}
                  {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
                </NativeSelect>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-neutral-gray">{t("Ticket tier", "Kategori tiket")}</span>
                <NativeSelect value={tierId} onChange={(e) => setTierId(e.target.value)}>
                  {!tier && <option value="" disabled>{event ? t("Pick the category", "Pilih kategorinya") : t("Pick the show first", "Pilih acaranya dulu")}</option>}
                  {event?.tiers.map((t) => <option key={t.id} value={t.id}>{t.name} · {formatIDR(t.faceValue)}</option>)}
                </NativeSelect>
              </label>
              {!holderNeeded && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-neutral-gray">{t("Original buyer name", "Nama pemesan asli")}</span>
                  <input value={orderer} onChange={(e) => setOrderer(e.target.value)} className="rounded-xl border border-lummy-500 px-4 py-3 text-sm text-neutral-black outline-none" />
                </label>
              )}
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-neutral-gray">{check ? t("Barcodes read (last characters)", "Barcode terbaca (karakter terakhir)") : t("Barcode (from the decoder)", "Barcode (dari decoder)")}</span>
                <input value={barcode || "-"} readOnly className="rounded-xl border border-neutral-light-gray-1 bg-secondary-gray-soft px-4 py-3 text-sm text-neutral-gray font-mono outline-none" />
              </label>
              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-xs text-neutral-gray">{t("Tickets in this PDF", "Jumlah tiket dalam PDF ini")}</span>
                {lockedQty ? (
                  <div data-locked-qty className="flex items-center gap-3">
                    <span className="font-bold text-lg text-neutral-black w-8 text-center">{check!.barcodes.length}</span>
                    <span className="text-xs text-neutral-gray">
                      {t(
                        "One ticket per barcode read. The buyer receives the whole file, so every ticket in it is sold together, seated as printed.",
                        "Satu tiket per barcode yang terbaca. Pembeli menerima file utuh, jadi semua tiket di dalamnya dijual sekaligus, kursinya sesuai yang tercetak."
                      )}
                    </span>
                  </div>
                ) : (
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-10 h-10 rounded-xl border border-lummy-500 grid place-items-center text-lummy-500 hover:bg-secondary-blue-light transition cursor-pointer"><Minus className="w-4 h-4" /></button>
                  <span className="font-bold text-lg text-neutral-black w-8 text-center">{qty}</span>
                  <button type="button" onClick={() => setQty((q) => Math.min(8, q + 1))} className="w-10 h-10 rounded-xl border border-lummy-500 grid place-items-center text-lummy-500 hover:bg-secondary-blue-light transition cursor-pointer"><Plus className="w-4 h-4" /></button>
                  <span className="text-xs text-neutral-gray">{t("Sold as one set, placed as printed.", "Dijual sebagai 1 set, posisinya sesuai yang tercetak.")}{qty > 1 ? t(` All ${qty} at once.`, ` ${qty} tiket sekaligus.`) : ""}</span>
                </div>
                )}
              </label>
            </div>
          </div>

          {event && <TransferPolicyNote policy={event.transferPolicy} audience="seller" />}

          <div className="flex gap-3">
            <Button.Ghost onClick={() => setStep(0)}><ArrowLeft className="w-4 h-4" /> {t("Back", "Kembali")}</Button.Ghost>
            <Button.Primary className="flex items-center gap-2" disabled={!event || !tier || closed || tooMany || pastTicket || (holderNeeded && !holderTyped)} onClick={() => { setPrice((p) => Math.min(Math.max(p || cap, floor), cap)); setStep(2); }}>{t("Continue to price", "Lanjut ke harga")} <ArrowRight className="w-4 h-4" /></Button.Primary>
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
              <span className="tabular-nums font-bold text-xl text-lummy-500">{formatIDR(price)}</span>
            </div>
            <input type="range" min={floor} max={cap} step={10000} value={price} onChange={(e) => setPrice(Number(e.target.value))} className="w-full accent-primary-navy cursor-pointer" />
            <div className="flex justify-between items-center text-xs text-neutral-gray mt-2">
              <span className="flex flex-col"><span>{formatIDR(floor)}</span><span className="text-[10px]">{t("min 50%", "min 50%")}</span></span>
              <span className={`font-medium ${markup >= 0 ? "text-secondary-green-dark" : "text-secondary-orange-dark"}`}>{markup >= 0 ? `+${markup}%` : `${markup}%`} {t("vs face value", "dari harga asli")}</span>
              <span className="flex flex-col text-right"><span>{formatIDR(cap)}</span><span className="text-[10px]">{t("max 150%", "maks 150%")}</span></span>
            </div>
            {qty > 1 && (
              <div className="mt-4 pt-4 border-t border-dashed border-neutral-light-gray-1 flex justify-between text-sm">
                <span className="text-neutral-gray">{t(`Total for ${qty} tickets (one set)`, `Total ${qty} tiket (1 set)`)}</span>
                <span className="tabular-nums font-bold text-neutral-black">{formatIDR(price * qty)}</span>
              </div>
            )}
          </div>

          {/* Staging an ID card for the gate. Lummy does not store ID cards yet (lib/features.ts), so an
              account does not see this, and the server ignores it; a sample persona keeps the stand-in,
              labelled, for the demo. The transfer note above tells a seller what to do instead. */}
          {(FEATURES.sellerIdCard || !account) && (
          <div className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-6">
            <label className="flex items-start justify-between gap-4 cursor-pointer">
              <span>
                <span className="block font-semibold text-neutral-black">
                  {t("The venue checks ID at the gate", "Venue cek KTP di gate")}
                  {!FEATURES.sellerIdCard && <span className="ml-1.5 text-xs font-normal text-neutral-gray">{t("(sample)", "(contoh)")}</span>}
                </span>
                <span className="block text-sm text-neutral-gray mt-0.5">
                  {t("The buyer will need a photo of your ID card next to the letter of authorisation.", "Pembeli butuh foto KTP kamu di samping surat kuasa.")}
                </span>
              </span>
              <input type="checkbox" checked={gateKtp} onChange={(e) => setGateKtp(e.target.checked)} className="mt-1 w-5 h-5 shrink-0 accent-primary-navy cursor-pointer" />
            </label>
            {nameChecked && !gateKtp && (
              <p className="mt-3 flex items-start gap-2 text-xs text-secondary-orange-dark">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {t(
                  "This show checks names at the gate. Without your ID card staged, a refusal over the name counts as a failed ticket, with the seller penalty.",
                  "Acara ini mengecek nama di gate. Tanpa KTP yang disiapkan, penolakan karena nama dihitung sebagai tiket gagal, lengkap dengan penalti penjual."
                )}
              </p>
            )}
            {gateKtp && (
              <div className="mt-4 flex flex-col gap-3">
                <input ref={ktpInput} type="file" accept="image/*" hidden onChange={(e) => setKtpFile(e.target.files?.[0]?.name ?? null)} />
                <div className="flex flex-wrap items-center gap-3">
                  {!account && (
                    <Button.Ghost className="text-sm" onClick={() => ktpInput.current?.click()}>
                      <IdCard className="w-4 h-4" /> {ktpFile ? t("Replace photo", "Ganti foto") : t("Upload ID card photo", "Upload foto KTP")}
                    </Button.Ghost>
                  )}
                  {ktpFile ? (
                    <span className="flex items-center gap-1.5 text-sm text-neutral-black min-w-0 break-all">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-secondary-green-dark" /> {ktpFile}
                    </span>
                  ) : (
                    <button type="button" onClick={() => setKtpFile("ktp-sample.jpg")} className="text-sm text-primary-navy font-medium hover:opacity-80 cursor-pointer">
                      {t("Use a sample", "Pakai contoh")}
                    </button>
                  )}
                </div>
                <p className="flex items-start gap-2 text-xs text-neutral-gray leading-relaxed">
                  <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-lummy-500" />
                  {account
                    ? t(
                        "For now only the sample photo can be staged. Real ID photos are accepted once the protected viewer is live: stored encrypted, never sent to AI, viewable by the buyer only close to the show with their name watermarked across it, and deleted after the event.",
                        "Untuk sekarang cuma foto contoh yang bisa disiapkan. Foto KTP asli baru diterima setelah penampil terproteksinya siap: disimpan terenkripsi, tidak pernah dikirim ke AI, hanya bisa dilihat pembeli mendekati acara dengan nama mereka sebagai watermark, lalu dihapus setelah acara."
                      )
                    : t(
                        "Stored encrypted and never sent to AI. The buyer can only view it close to the show, with their name watermarked across it, and it is deleted after the event.",
                        "Disimpan terenkripsi dan tidak pernah dikirim ke AI. Pembeli baru bisa melihatnya mendekati acara, dengan nama mereka sebagai watermark, dan fotonya dihapus setelah acara."
                      )}
                </p>
              </div>
            )}
          </div>
          )}

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
              {check?.sameFile && !check.barcodes.some((b) => b.taken)
                ? t("This exact file is already behind another listing on Lummy. The listing is blocked automatically.", "File yang persis sama sudah ada di listing lain di Lummy. Listing diblokir otomatis.")
                : t("This barcode has already been sold on Lummy. The listing is blocked automatically. That check is deterministic, not a guess.", "Barcode ini sudah pernah dijual di Lummy. Listing diblokir otomatis. Pengecekannya deterministik, bukan tebakan.")}
            </div>
          ) : flagged ? (
            <div className="flex items-start gap-2 text-sm text-secondary-orange-dark bg-secondary-orange-soft rounded-2xl p-4">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {check
                  ? t(
                      "A person checks this ticket first, for the reasons shown in the previous step. It will not go live yet, it joins the admin review queue. If it passes, buyers can see it.",
                      "Tiket ini dicek manusia dulu, dengan alasan yang tampil di langkah sebelumnya. Belum langsung tayang, masuk antrian review admin dulu. Kalau lolos, baru bisa dilihat pembeli."
                    )
                  : t("The check flagged this ticket, on its forgery score or the PDF structure. It will not go live yet, it joins the admin review queue. If it passes, buyers can see it.", "Pengecekan menandai tiket ini, dari skor pemalsuan atau struktur PDF. Belum langsung tayang, masuk antrian review admin dulu. Kalau lolos, baru bisa dilihat pembeli.")}
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-sm text-neutral-gray bg-secondary-blue-extra rounded-2xl p-4">
              <ShieldCheck className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
              {t("Once published, the sale is escrow-backed. You get paid after the show is over and the dispute window has passed.", "Setelah publish, penjualannya dijaga escrow. Kamu dibayar setelah konser selesai dan masa sengketa lewat.")}
            </div>
          )}

          {sendsRealFile && (
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input data-consent type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 accent-primary-navy cursor-pointer" />
              <span className="text-xs text-neutral-gray leading-relaxed">
                {t("This ticket is mine to sell. I agree that the PDF, with the names and numbers on it, is stored and handed to the buyer as described in the ", "Tiket ini berhak saya jual. Saya setuju PDF-nya, dengan nama dan nomor di dalamnya, disimpan dan diberikan ke pembeli seperti dijelaskan di ")}
                <Link href="/privacy" target="_blank" className="text-primary-navy font-medium underline underline-offset-2">{t("privacy policy", "kebijakan privasi")}</Link>
                {t(" and the ", " dan ")}
                <Link href="/terms" target="_blank" className="text-primary-navy font-medium underline underline-offset-2">{t("terms", "syarat dan ketentuan")}</Link>.
                {fillName &&
                  t(
                    ` ${fillName.en} reads its text, with the buyer's name, ID and phone numbers, email and order codes taken out, to match the category and date.`,
                    ` ${fillName.id} membaca teks tiketnya, setelah nama pemesan, nomor KTP dan HP, email, dan kode pesanan dibuang, untuk mencocokkan kategori dan tanggal.`
                  )}
              </span>
            </label>
          )}

          <div className="flex gap-3">
            <Button.Ghost onClick={() => setStep(1)}><ArrowLeft className="w-4 h-4" /> {t("Back", "Kembali")}</Button.Ghost>
            <Button.Primary disabled={blocked || ktpMissing || publishing || closed || (sendsRealFile && !agreed)} onClick={publish}>
              {blocked ? t("Blocked (duplicate)", "Diblokir (duplikat)") : flagged || late ? t("Submit for review", "Ajukan untuk review") : t("Publish listing", "Publish listing")}
            </Button.Primary>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
