"use client";

import type React from "react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight, Banknote, CalendarClock, CalendarX, Eye, FileText, FileUp, Flag, Landmark, Lock, PackageX, QrCode, Repeat,
  ScanLine, Search, ShieldAlert, Tag, Timer, TrendingUp, XCircle, FileWarning, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TicketFeature } from "@/components/ui/ticket-feature";
import { TicketBand } from "@/components/ui/ticket-band";
import { Notch } from "@/components/ui/notch";
import { StepTimeline, MiniTrack, TONE_CHIP, type Step } from "@/components/how/StepTimeline";
import { Faq, type FaqItem } from "@/components/how/Faq";
import { cn } from "@/lib/utils";
import { useFormatters, useT } from "@/lib/i18n";
import { CAP_PCT, FLOOR_PCT, DISPUTE_WINDOW_H, LATE_LISTING_H, SELLER_PENALTY_PCT, MATERAI, platformFee } from "@/lib/mock";

// One ticket, followed from both sides: the buyer's order and the seller's listing are the
// same sale, so the numbers on the two tabs agree. Illustrative, and computed with the
// same fee rules checkout uses.
const FACE = 1_300_000;
const PRICE = 1_500_000;

// ---- Which side the page is explaining. Lives in the URL hash, so /how-it-works#selling
// can be linked from anywhere, and a plain link (or #coverage) opens on buying.
type Side = "buying" | "selling";
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener("hashchange", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("hashchange", cb);
  };
};
const readSide = (): Side => (window.location.hash === "#selling" ? "selling" : "buying");
const writeSide = (s: Side) => {
  window.history.replaceState(null, "", s === "selling" ? "#selling" : window.location.pathname);
  listeners.forEach((l) => l());
};

function SideTabs({ side, onPick }: { side: Side; onPick: (s: Side) => void }) {
  const t = useT();
  const sides: { id: Side; label: string; Icon: typeof Wallet }[] = [
    { id: "buying", label: t("Buying a ticket", "Beli tiket"), Icon: Wallet },
    { id: "selling", label: t("Selling a ticket", "Jual tiket"), Icon: Tag },
  ];
  const at = sides.findIndex((s) => s.id === side);
  return (
    <div
      role="tablist"
      aria-label={t("Explain", "Jelaskan")}
      className="relative grid grid-cols-2 w-full max-w-md rounded-2xl border-2 border-primary-navy bg-neutral-white p-1"
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const other: Side = side === "buying" ? "selling" : "buying";
        onPick(other);
        e.currentTarget.querySelector<HTMLElement>(`#tab-${other}`)?.focus();
      }}
    >
      <span
        aria-hidden
        className="absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-xl bg-primary-navy transition-transform duration-500 ease-spring"
        style={{ transform: `translateX(${at * 100}%)` }}
      />
      {sides.map((s) => (
        <button
          key={s.id}
          role="tab"
          id={`tab-${s.id}`}
          aria-selected={side === s.id}
          aria-controls={`panel-${s.id}`}
          tabIndex={side === s.id ? 0 : -1}
          onClick={() => onPick(s.id)}
          className={cn(
            "relative z-10 flex items-center justify-center gap-2 h-11 rounded-xl font-fredoka font-medium transition-colors duration-300 cursor-pointer",
            side === s.id ? "text-white" : "text-primary-navy hover:text-primary-navy-dark"
          )}
        >
          <s.Icon className="w-4 h-4" /> {s.label}
        </button>
      ))}
    </div>
  );
}

/** Ticket-shaped card for the example beside the steps. */
function ExampleCard({ label, children, stub }: { label: string; children: React.ReactNode; stub: React.ReactNode }) {
  const notch = "w-6 h-6 border border-primary-navy bg-neutral-white";
  return (
    <div className="relative rounded-3xl border border-primary-navy bg-neutral-white shadow-[5px_5px_0_#245397]">
      <div className="px-6 pt-5 pb-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-gray">{label}</div>
        {children}
      </div>
      <div aria-hidden className="relative mx-6 border-t-2 border-dashed border-neutral-light-gray-1">
        <Notch side="left" className={`${notch} -left-[37px] -top-[11px]`} />
        <Notch side="right" className={`${notch} -right-[37px] -top-[11px]`} />
      </div>
      <div className="px-6 pt-5 pb-6 rounded-b-3xl bg-secondary-blue-extra">{stub}</div>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 text-sm", strong ? "text-neutral-black font-semibold" : "text-neutral-gray")}>
      <span>{label}</span>
      <span className={cn("tabular-nums whitespace-nowrap", strong && "font-fredoka text-base text-primary-navy")}>{value}</span>
    </div>
  );
}

/** The status line in the stub. Keyed on the text, so each change eases in rather than snapping. */
function Status({ text, note, tone }: { text: string; note: string; tone: keyof typeof TONE_CHIP }) {
  return (
    <div key={text} className="lm-in">
      <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-semibold", TONE_CHIP[tone])}>{text}</span>
      <p className="text-sm text-neutral-gray mt-2 leading-relaxed min-h-[2.75rem]">{note}</p>
    </div>
  );
}

export default function HowItWorks() {
  const t = useT();
  const { formatIDR } = useFormatters();
  const side = useSyncExternalStore(subscribe, readSide, () => "buying" as Side);
  const panelRef = useRef<HTMLDivElement>(null);

  // Next changes the URL with pushState, which fires no hashchange, so a link to this page
  // from this page (the footer's #selling or #coverage) is caught on click instead.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href*='#']") as HTMLAnchorElement | null;
      if (!a) return;
      const url = new URL(a.href);
      if (url.pathname !== window.location.pathname) return;
      const next: Side = url.hash === "#selling" ? "selling" : "buying";
      if (next !== readSide()) writeSide(next);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  const pick = (s: Side) => {
    if (s === side) return;
    writeSide(s);
    // Switching halfway down the page starts the other story from its top
    const top = (panelRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY - 160;
    if (window.scrollY > top) window.scrollTo({ top });
  };

  const fee = platformFee(PRICE);
  const total = PRICE + fee + MATERAI;
  const pct = Math.round((PRICE / FACE - 1) * 100);

  // ---------------- Buying
  const buySteps: Step[] = [
    {
      Icon: Search,
      title: t("Find a ticket", "Cari tiket"),
      body: t(
        `Every listing shows the tier, the price next to face value, and the checks it passed. No listing can ask more than ${CAP_PCT}% of face value.`,
        `Tiap listing menampilkan tier, harga di samping harga asli, dan pengecekan yang sudah dilewati. Tidak ada listing yang boleh lebih dari ${CAP_PCT}% harga asli.`
      ),
      state: t("Nothing paid yet", "Belum bayar apa-apa"),
      tone: "idle",
    },
    {
      Icon: QrCode,
      title: t("Pay with QRIS", "Bayar pakai QRIS"),
      body: t(
        "Like any other app. The ticket price goes into escrow: not to the seller, and not to us. The service fee and the e-stamp are shown before you pay.",
        "Seperti aplikasi lain. Harga tiketnya masuk escrow: bukan ke penjual, bukan juga ke kami. Biaya layanan dan e-meterai tampil sebelum kamu bayar."
      ),
      state: t("Held in escrow", "Ditahan escrow"),
      tone: "held",
    },
    {
      Icon: FileText,
      title: t("Get the paperwork", "Terima dokumennya"),
      body: t(
        "A letter of authorisation, e-stamped and e-signed, ready to print straight away. If the venue checks ID, you can view the seller's ID card close to the show, with your name watermarked across it.",
        "Surat kuasa ber-e-meterai dan TTE, langsung siap print. Kalau venue cek KTP, kamu bisa melihat KTP penjual mendekati acara, dengan namamu sebagai watermark."
      ),
      state: t("Still held", "Masih ditahan"),
      tone: "held",
    },
    {
      Icon: Flag,
      title: t("Go to the show", "Datang ke acara"),
      body: t(
        `Show your Lummy pass at the door. Where the organiser checks Lummy passes, a ticket someone used before you is refused there and your money comes back on the spot. Anywhere else, got in? You do nothing. Turned away? Take a photo there and file a claim within ${DISPUTE_WINDOW_H} hours of the show ending.`,
        `Tunjukkan pass Lummy di pintu masuk. Di acara yang penyelenggaranya memeriksa pass Lummy, tiket yang sudah dipakai orang lain ditolak di sana dan uangmu langsung kembali. Di tempat lain, berhasil masuk? Kamu tidak perlu apa-apa. Ditolak? Foto di sana dan ajukan klaim dalam ${DISPUTE_WINDOW_H} jam setelah acara selesai.`
      ),
      state: t(`${DISPUTE_WINDOW_H}h to raise a problem`, `${DISPUTE_WINDOW_H} jam untuk melapor`),
      tone: "open",
    },
    {
      Icon: Banknote,
      title: t("The seller is paid", "Penjual dibayar"),
      body: t(
        `${DISPUTE_WINDOW_H} hours after the show, if nobody raised a problem, the escrow pays the seller by itself. Nobody has to approve it.`,
        `${DISPUTE_WINDOW_H} jam setelah acara, kalau tidak ada masalah, escrow membayar penjual dengan sendirinya. Tidak perlu persetujuan siapa pun.`
      ),
      state: t("Paid to the seller", "Cair ke penjual"),
      tone: "done",
    },
  ];
  const buyNotes = [
    t("You only pay once you have picked a listing.", "Kamu baru bayar setelah memilih listing."),
    t("The seller cannot touch it. Neither can we.", "Penjual tidak bisa menyentuhnya. Kami juga tidak."),
    t("Documents in hand, money still waiting.", "Dokumen sudah di tangan, uang masih menunggu."),
    t("Any claim in this window stops the payout until it is settled.", "Klaim di masa ini menahan pencairan sampai diputus."),
    t("Silence means it went fine. The sale is done.", "Diam artinya lancar. Transaksi selesai."),
  ];
  const buyTrackAt = [-1, 1, 1, 2, 3];
  const buyTrack = [t("Paid", "Dibayar"), t("In escrow", "Di escrow"), t("Show over", "Acara selesai"), t("Seller paid", "Penjual dibayar")];

  const coverage: FaqItem[] = [
    {
      Icon: PackageX,
      q: t("What if the seller never hands it over?", "Kalau penjual tidak menyerahkan tiket?"),
      a: t(
        "Claim before the show. Our record of whether you opened the handover documents decides it, so there is nothing for you to prove.",
        "Klaim sebelum acara. Catatan kami soal apakah kamu pernah membuka dokumen serah-terima yang menentukan, jadi tidak ada yang perlu kamu buktikan."
      ),
    },
    {
      Icon: XCircle,
      q: t("What if I am turned away at the gate?", "Kalau aku ditolak di gate?"),
      a: t(
        `Where the door checks Lummy passes, you file nothing: the refusal itself is the proof and the refund is immediate. Elsewhere, file within ${DISPUTE_WINDOW_H} hours with a photo taken there. The time, the venue and the code on screen all have to match, so someone who walked in cannot claim. A person reviews it and decides.`,
        `Di pintu yang memeriksa pass Lummy, kamu tidak perlu mengajukan apa pun: penolakannya sendiri buktinya dan refund langsung terjadi. Di tempat lain, ajukan dalam ${DISPUTE_WINDOW_H} jam dengan foto yang diambil di sana. Waktu, venue, dan kode di layar harus cocok, jadi yang berhasil masuk tidak bisa mengklaim. Orang yang meninjau dan memutus.`
      ),
    },
    {
      Icon: FileWarning,
      q: t("What if it is not the ticket that was listed?", "Kalau tiketnya beda dari listing?"),
      a: t(
        "Still got in on a lower tier? You get the difference back, not the full price.",
        "Tetap masuk dengan tier lebih rendah? Yang kembali selisihnya, bukan harga penuh."
      ),
    },
    {
      Icon: CalendarX,
      q: t("What if the organiser cancels?", "Kalau penyelenggara membatalkan?"),
      a: t(
        "Refunded automatically, service fee included. Nobody files anything and the seller is not penalised.",
        "Dikembalikan otomatis, termasuk biaya layanan. Tidak ada yang perlu mengajukan dan penjual tidak kena penalti."
      ),
    },
    {
      Icon: CalendarClock,
      q: t("What if the date moves?", "Kalau tanggalnya diundur?"),
      a: t(
        "Your ticket stays valid and the money stays held until the new date. If the new date does not work for you, take the refund.",
        "Tiketmu tetap berlaku dan dananya tetap ditahan sampai tanggal baru. Kalau tanggal barunya tidak cocok, ambil refund."
      ),
    },
    {
      Icon: Repeat,
      q: t("What if I cannot make it?", "Kalau aku berhalangan hadir?"),
      a: t(
        "That is not a refund, because the ticket works. Relist it before the show and get your money back from the next buyer.",
        "Itu bukan refund, karena tiketnya berfungsi. Jual lagi sebelum acara dan uangmu kembali dari pembeli berikutnya."
      ),
    },
    {
      Icon: Timer,
      q: t("And if nothing goes wrong?", "Kalau tidak ada masalah?"),
      a: t(
        `You do nothing. ${DISPUTE_WINDOW_H} hours after the show, the seller is paid and the sale is closed.`,
        `Kamu tidak perlu apa-apa. ${DISPUTE_WINDOW_H} jam setelah acara, penjual dibayar dan transaksi selesai.`
      ),
    },
  ];

  // ---------------- Selling
  const sellSteps: Step[] = [
    {
      Icon: FileUp,
      title: t("Upload the PDF", "Upload PDF-nya"),
      body: t(
        "Pick the event and tier, and Lummy reads every barcode in the PDF. If the venue checks ID, add a photo of your ID card too.",
        "Pilih event dan kategorinya, lalu Lummy membaca semua barcode di PDF-nya. Kalau venue cek KTP, tambahkan juga foto KTP-mu."
      ),
      state: t("Reading the ticket", "Membaca tiket"),
      tone: "idle",
    },
    {
      Icon: ScanLine,
      title: t("It gets checked", "Tiketnya dicek"),
      body: t(
        `A barcode already sold on Lummy is blocked outright. The server also looks for signs the PDF was edited; a high score sends it to a person, it never rejects on its own. Listings made in the last ${LATE_LISTING_H} hours before a show are always seen by a person first.`,
        `Barcode yang pernah dijual di Lummy langsung diblokir. Server juga mencari jejak PDF yang diedit; skor tinggi dikirim ke manusia, bukan ditolak otomatis. Listing yang dibuat ${LATE_LISTING_H} jam terakhir sebelum acara selalu dilihat manusia dulu.`
      ),
      state: t("Checked", "Sudah dicek"),
      tone: "held",
    },
    {
      Icon: Tag,
      title: t("Set your price", "Pasang harga"),
      body: t(
        `Anywhere from ${FLOOR_PCT}% to ${CAP_PCT}% of face value. Listing is free: the buyer pays the service fee on top, so the price you set is what you receive.`,
        `Bebas dari ${FLOOR_PCT}% sampai ${CAP_PCT}% harga asli. Pasang listing gratis: pembeli yang bayar biaya layanan, jadi harga yang kamu pasang itulah yang kamu terima.`
      ),
      state: t("Live, open to buyers", "Tayang untuk pembeli"),
      tone: "held",
    },
    {
      Icon: Lock,
      title: t("A buyer pays", "Pembeli membayar"),
      body: t(
        "The money goes into escrow and the buyer gets the letter of authorisation straight away. Your ID card photo, if you added one, is stored encrypted, shown only close to the show with the buyer's name across it, and deleted after.",
        "Uangnya masuk escrow dan pembeli langsung menerima surat kuasa. Foto KTP-mu, kalau ada, disimpan terenkripsi, hanya tampil mendekati acara dengan nama pembeli di atasnya, lalu dihapus setelahnya."
      ),
      state: t("Sold, held in escrow", "Terjual, ditahan escrow"),
      tone: "held",
    },
    {
      Icon: Landmark,
      title: t("You get paid", "Kamu dibayar"),
      body: t(
        `${DISPUTE_WINDOW_H} hours after the show, if no claim stands, the escrow pays out to the bank account in your profile.`,
        `${DISPUTE_WINDOW_H} jam setelah acara, kalau tidak ada klaim yang terbukti, escrow mencairkan dana ke rekening di profilmu.`
      ),
      state: t("Paid out", "Sudah cair"),
      tone: "done",
    },
  ];
  const sellNotes = [
    t("Takes about a minute with the PDF in hand.", "Sekitar satu menit kalau PDF-nya sudah ada."),
    t("Most tickets go live straight away.", "Kebanyakan tiket langsung tayang."),
    t("Buyers see your price next to face value.", "Pembeli melihat hargamu di samping harga asli."),
    t("You cannot be paid for a ticket that did not work.", "Kamu tidak bisa dibayar untuk tiket yang tidak berfungsi."),
    t("The full price, to your bank account.", "Harga penuh, ke rekeningmu."),
  ];
  const sellTrackAt = [0, 0, 1, 2, 3];
  const sellTrack = [t("Uploaded", "Diupload"), t("Live", "Tayang"), t("Sold", "Terjual"), t("Paid out", "Cair")];

  const sellFaq: FaqItem[] = [
    {
      Icon: Wallet,
      q: t("What does it cost me to list?", "Berapa biaya pasang listing?"),
      a: t(
        "Nothing. The buyer pays the service fee on top of your price, so you receive the full amount you set.",
        "Gratis. Pembeli membayar biaya layanan di atas hargamu, jadi kamu menerima penuh harga yang kamu pasang."
      ),
    },
    {
      Icon: Timer,
      q: t("Why am I only paid after the show?", "Kenapa baru dibayar setelah acara?"),
      a: t(
        "Because that is what lets a buyer trust a stranger's ticket, and it is why they will buy yours. Selling a fake ticket gets nobody paid.",
        "Karena itu yang membuat pembeli berani percaya tiket dari orang asing, dan itu alasan mereka mau membeli tiketmu. Menjual tiket palsu tidak membuat siapa pun dibayar."
      ),
    },
    {
      Icon: XCircle,
      q: t("A buyer says they were turned away. Now what?", "Pembeli bilang ditolak di gate. Terus?"),
      a: t(
        "You see the claim and their photo in your dashboard, and you can answer with your own evidence. The photo has to match the time, the venue and your ticket's code. A person decides; without evidence that holds up, you are paid.",
        "Kamu melihat klaim dan fotonya di dasbor, dan bisa menjawab dengan buktimu sendiri. Fotonya harus cocok dengan waktu, venue, dan kode tiketmu. Orang yang memutus; tanpa bukti yang kuat, kamu tetap dibayar."
      ),
    },
    {
      Icon: CalendarX,
      q: t("What if the show is cancelled or moved?", "Kalau acaranya batal atau diundur?"),
      a: t(
        "Cancelled: the buyer is refunded automatically and you are not penalised. Moved: the payout moves with the new date, and if that date does not work for the buyer, they can take a refund instead. No penalty for you either way.",
        "Batal: pembeli dikembalikan otomatis dan kamu tidak kena penalti. Diundur: pencairan ikut tanggal baru, dan kalau tanggal itu tidak cocok untuk pembeli, pembeli boleh ambil refund. Dua-duanya tanpa penalti untukmu."
      ),
    },
    {
      Icon: ShieldAlert,
      q: t("What if a ticket I sold does not work?", "Kalau tiket yang kujual tidak berfungsi?"),
      a: t(
        `You lose the sale and are charged ${SELLER_PENALTY_PCT}% of the price, so selling a ticket that does not work never pays.`,
        `Penjualan batal dan kamu dikenai ${SELLER_PENALTY_PCT}% dari harga, jadi menjual tiket yang tidak berfungsi tidak pernah untung.`
      ),
    },
  ];

  const checks = [
    {
      Icon: ScanLine,
      title: t("Every ticket is read", "Tiap tiket dibaca"),
      body: t(
        "The server reads each barcode and checks how the PDF was made and changed. A suspicious file goes to a person; the machine never decides alone. AI that fills the listing in for you comes next.",
        "Server membaca tiap barcode dan memeriksa cara PDF dibuat dan diubah. File yang mencurigakan dikirim ke manusia, mesin tidak memutus sendiri. AI yang mengisi listing untukmu menyusul."
      ),
    },
    {
      Icon: Lock,
      title: t("One barcode, one sale", "Satu barcode, satu penjualan"),
      body: t(
        "A barcode that has been sold on Lummy before is blocked outright. That check is exact, not a guess.",
        "Barcode yang pernah dijual di Lummy langsung diblokir. Pengecekannya pasti, bukan tebakan."
      ),
    },
    {
      Icon: TrendingUp,
      title: t(`Capped at ${CAP_PCT}%`, `Maksimal ${CAP_PCT}%`),
      body: t("No listing can ask more than one and a half times face value.", "Tidak ada listing yang boleh lebih dari satu setengah kali harga asli."),
    },
    {
      Icon: Eye,
      title: t("Open to audit", "Bisa diaudit"),
      body: t(
        "Whether money is held, released or refunded is recorded publicly. You can check it yourself.",
        "Status dana (ditahan, cair, dikembalikan) tercatat publik. Kamu bisa cek sendiri."
      ),
    },
  ];

  const buyAside = (i: number) => (
    <ExampleCard
      label={t("Example order", "Contoh pesanan")}
      stub={
        <>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-gray mb-2">{t("Where the money is", "Posisi uangnya")}</div>
          <Status text={buySteps[i].state} note={buyNotes[i]} tone={buySteps[i].tone} />
          <div className="mt-4"><MiniTrack stops={buyTrack} at={buyTrackAt[i]} /></div>
        </>
      }
    >
      <div className="mt-1 font-fredoka font-semibold text-lg text-neutral-black">{t("CAT 1 · 1 ticket", "CAT 1 · 1 tiket")}</div>
      <div className="mt-4 flex flex-col gap-2">
        <Line label={t("Ticket price", "Harga tiket")} value={formatIDR(PRICE)} />
        <Line label={t("Service fee (5%, min. IDR 25,000)", "Biaya layanan (5%, min. IDR 25.000)")} value={formatIDR(fee)} />
        <Line label={t("e-stamp + e-signature", "e-Meterai + TTE")} value={formatIDR(MATERAI)} />
        <div className="border-t border-neutral-light-gray-1 pt-2 mt-1">
          <Line label={t("You pay", "Kamu bayar")} value={formatIDR(total)} strong />
        </div>
      </div>
      <p className="mt-3 text-xs text-neutral-gray">
        {t("Only the ticket price sits in escrow. The fees are charged separately at checkout.", "Yang masuk escrow hanya harga tiketnya. Biaya-biayanya ditagih terpisah saat checkout.")}
      </p>
    </ExampleCard>
  );

  const sellAside = (i: number) => (
    <ExampleCard
      label={t("Example listing", "Contoh listing")}
      stub={
        <>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-gray mb-2">{t("Status", "Status")}</div>
          <Status text={sellSteps[i].state} note={sellNotes[i]} tone={sellSteps[i].tone} />
          <div className="mt-4"><MiniTrack stops={sellTrack} at={sellTrackAt[i]} /></div>
        </>
      }
    >
      <div className="mt-1 font-fredoka font-semibold text-lg text-neutral-black">{t("CAT 1 · 1 ticket", "CAT 1 · 1 tiket")}</div>
      <div className="mt-4 flex flex-col gap-2">
        <Line label={t("Face value", "Harga asli")} value={formatIDR(FACE)} />
        <Line
          label={t(`Allowed range (${FLOOR_PCT} to ${CAP_PCT}%)`, `Rentang harga (${FLOOR_PCT} sampai ${CAP_PCT}%)`)}
          value={`${formatIDR(Math.round((FACE * FLOOR_PCT) / 100)).replace("IDR ", "")} ${t("to", "sampai")} ${formatIDR(Math.round((FACE * CAP_PCT) / 100)).replace("IDR ", "")}`}
        />
        <Line label={t(`Your price (+${pct}%)`, `Hargamu (+${pct}%)`)} value={formatIDR(PRICE)} />
        <Line label={t("Listing fee", "Biaya listing")} value={t("Free", "Gratis")} />
        <div className="border-t border-neutral-light-gray-1 pt-2 mt-1">
          <Line label={t("You receive", "Kamu terima")} value={formatIDR(PRICE)} strong />
        </div>
      </div>
    </ExampleCard>
  );

  return (
    <div className="pb-10">
      <section className="relative overflow-hidden bg-hero-gradient pt-28 pb-14">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(#3A6CB41f_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
        />
        <div className="relative max-w-3xl mx-auto px-5 text-center flex flex-col items-center">
          <Image src="/assets/images/mascot-powered.svg" alt="" width={96} height={96} priority className="mb-2 drop-shadow-lg lm-in" />
          <h1 className="font-bold leading-[1.05] text-4xl md:text-6xl tracking-tight">
            <span className="lm-line text-neutral-black"><span>{t("Your money waits", "Uangmu menunggu")}</span></span>
            <span className="lm-line text-primary-navy"><span style={{ "--i": 1 } as React.CSSProperties}>{t("until the show is over.", "sampai acara selesai.")}</span></span>
          </h1>
          <p className="lm-in text-lg text-neutral-gray mt-5 max-w-xl" style={{ "--d": "240ms" } as React.CSSProperties}>
            {t(
              "That one rule is what makes buying from a stranger safe. Here is every step, from either side of the sale.",
              "Satu aturan itu yang membuat beli dari orang asing jadi aman. Ini tiap langkahnya, dari dua sisi transaksi."
            )}
          </p>
        </div>
      </section>

      {/* Stays under the navbar, so either story is one tap away at any point */}
      <div className="sticky top-20 z-30 -mt-7 px-5 flex justify-center pointer-events-none">
        <div className="pointer-events-auto w-full max-w-md rounded-[20px] shadow-lummy">
          <SideTabs side={side} onPick={pick} />
        </div>
      </div>

      <div ref={panelRef} id={side === "selling" ? "selling" : undefined} className="scroll-mt-40">
        {side === "buying" ? (
          <div role="tabpanel" id="panel-buying" aria-labelledby="tab-buying" key="buying" className="lm-page">
            <section className="max-w-6xl mx-auto px-5 lg:px-10 mt-14">
              <div className="max-w-2xl mb-10">
                <h2 className="font-bold text-2xl md:text-3xl text-neutral-black">{t("From checkout to the show", "Dari checkout sampai acara")}</h2>
                <p className="text-neutral-gray mt-2">
                  {t("Five steps. You only act in two of them.", "Lima langkah. Kamu cuma perlu bertindak di dua.")}
                </p>
              </div>
              <StepTimeline steps={buySteps} aside={buyAside} />
            </section>

            {/* Mobile has no side card, so the costs get their own block */}
            <section className="lg:hidden max-w-6xl mx-auto px-5 mt-12">{buyAside(1)}</section>

            <section id="coverage" className="max-w-6xl mx-auto px-5 lg:px-10 mt-20 lg:mt-6 scroll-mt-40">
              <div className="grid lg:grid-cols-[320px_minmax(0,1fr)] gap-8 lg:gap-16">
                <div data-reveal>
                  <h2 className="font-bold text-2xl md:text-3xl text-neutral-black">{t("What if something goes wrong?", "Kalau ada yang tidak beres?")}</h2>
                  <p className="text-neutral-gray mt-2">
                    {t(
                      "Each case has one path, and each path names what decides it. Nothing ends in \"contact support\".",
                      "Tiap kasus punya satu jalur, dan tiap jalur menyebut apa yang menentukannya. Tidak ada yang berakhir di \"hubungi CS\"."
                    )}
                  </p>
                </div>
                <Faq items={coverage} defaultOpen={1} />
              </div>
            </section>
          </div>
        ) : (
          <div role="tabpanel" id="panel-selling" aria-labelledby="tab-selling" key="selling" className="lm-page">
            <section className="max-w-6xl mx-auto px-5 lg:px-10 mt-14">
              <div className="max-w-2xl mb-10">
                <h2 className="font-bold text-2xl md:text-3xl text-neutral-black">{t("From PDF to payout", "Dari PDF sampai cair")}</h2>
                <p className="text-neutral-gray mt-2">
                  {t("List in a few minutes. Get paid once the show has happened.", "Pasang dalam beberapa menit. Dibayar setelah acaranya berlangsung.")}
                </p>
              </div>
              <StepTimeline steps={sellSteps} aside={sellAside} />
            </section>

            <section className="lg:hidden max-w-6xl mx-auto px-5 mt-12">{sellAside(2)}</section>

            <section className="max-w-6xl mx-auto px-5 lg:px-10 mt-20 lg:mt-6">
              <div className="grid lg:grid-cols-[320px_minmax(0,1fr)] gap-8 lg:gap-16">
                <div data-reveal>
                  <h2 className="font-bold text-2xl md:text-3xl text-neutral-black">{t("Good to know before you list", "Perlu tahu sebelum jualan")}</h2>
                  <p className="text-neutral-gray mt-2">
                    {t("The rules are the same for every seller, and they are the reason buyers trust you.", "Aturannya sama untuk semua penjual, dan itu alasan pembeli percaya padamu.")}
                  </p>
                </div>
                <Faq items={sellFaq} />
              </div>
            </section>
          </div>
        )}
      </div>

      <section className="max-w-6xl mx-auto px-5 lg:px-10 mt-20">
        <div data-reveal className="max-w-2xl">
          <h2 className="font-bold text-2xl md:text-3xl text-neutral-black">{t("Checked before it goes on sale", "Dicek sebelum dijual")}</h2>
          <p className="text-neutral-gray mt-2">{t("What protects both sides of every sale.", "Yang melindungi kedua sisi di tiap transaksi.")}</p>
        </div>
        <div data-reveal="stagger" className="grid sm:grid-cols-2 gap-5 mt-8">
          {checks.map((c) => (
            <TicketFeature key={c.title} Icon={c.Icon} title={c.title} body={c.body} />
          ))}
        </div>
      </section>

      <section data-reveal className="max-w-6xl mx-auto px-5 lg:px-10 mt-20">
        <TicketBand>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-5 text-center sm:text-left">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold">
                {side === "buying" ? t("Now go find your ticket", "Sekarang tinggal cari tiketnya") : t("Got a ticket you can't use?", "Punya tiket yang gak kepakai?")}
              </h2>
              <p className="text-white/85 mt-1">
                {side === "buying"
                  ? t("Every listing on Lummy works the way this page says.", "Tiap listing di Lummy bekerja seperti yang tertulis di halaman ini.")
                  : t("Upload the PDF and it is live in minutes.", "Upload PDF-nya dan tayang dalam hitungan menit.")}
              </p>
            </div>
            <Link href={side === "buying" ? "/events" : "/sell"}>
              <Button.Secondary className="flex items-center gap-2 text-nowrap">
                {side === "buying" ? t("Browse events", "Jelajah event") : t("Sell a ticket", "Jual tiket")} <ArrowRight className="w-4 h-4" />
              </Button.Secondary>
            </Link>
          </div>
        </TicketBand>
      </section>
    </div>
  );
}
