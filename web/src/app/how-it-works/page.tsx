import Link from "next/link";
import Image from "next/image";
import { Lock, ScanLine, TrendingUp, Eye, RotateCcw, Repeat, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const sections = [
  {
    Icon: Lock,
    title: "Dana dikunci escrow",
    body: "Waktu kamu bayar, uangnya masuk ke smart contract, bukan ke rekening kami atau langsung ke penjual. Dana baru cair ke penjual setelah konser selesai dan serah-terima beres.",
  },
  {
    Icon: ScanLine,
    title: "AI cek keaslian tiket",
    body: "Tiap PDF tiket diperiksa berlapis: forensik struktur file (deteksi tiket yang diedit), barcode di-decode dan dicek duplikat, plus skor pemalsuan. Sinyal buat review, bukan gantiin manusia.",
  },
  {
    Icon: TrendingUp,
    title: "Harga dibatasi",
    body: "Maksimal 150% dari harga asli. Ini bikin OperTix jadi pasar resale yang wajar, bukan lahan calo.",
  },
  {
    Icon: Eye,
    title: "Transparan, bisa dicek sendiri",
    body: "Status dana kamu (terkunci / cair / dikembalikan) bisa diverifikasi publik di block explorer. Jangan percaya kami, cek sendiri.",
  },
  {
    Icon: RotateCcw,
    title: "Gagal masuk? Ajukan sengketa",
    body: "Ditolak di gate karena tiket bermasalah? Ajukan sengketa dengan bukti (foto layar scanner yang nolak) maksimal 48 jam setelah event. Diputus admin, bukan otomatis, jadi yang beneran masuk gak bisa ngaku gagal. Garansinya uang balik, jujur, bukan 'dijamin masuk'.",
  },
  {
    Icon: Repeat,
    title: "Gak bisa dateng? Jual lagi",
    body: "Kalau kamu gak jadi hadir, itu bukan alasan refund (tiketnya valid, kamu yang gak dateng, jadi hangus). Tapi sebelum event kamu bisa jual lagi tiketnya di OperTix, balikin nilainya lewat pasar, bukan minta refund.",
  },
];

export default function HowItWorks() {
  return (
    <div className="pb-10">
      <section className="bg-hero-gradient pt-28 pb-16">
        <div className="max-w-3xl mx-auto px-5 text-center flex flex-col items-center">
          <Image src="/assets/images/mascot-powered.svg" alt="" width={110} height={110} className="mb-3 drop-shadow-lg" />
          <h1 className="flex flex-col font-bold leading-[1.05] text-4xl md:text-5xl mt-2">
            <span className="text-neutral-black">Kenapa resale di OperTix</span>
            <span className="text-primary-navy">beneran aman</span>
          </h1>
          <p className="text-lg text-neutral-gray mt-4">Blockchain + AI kerja di belakang layar. Kamu cukup beli seperti biasa.</p>
        </div>
      </section>

      {/* Stepper: enam lapis perlindungan. Node navy hard-shadow + garis dashed nyambung
          (perforasi tiket), panel putih dengan border tipis di atas latar putih. */}
      <section className="border-y border-neutral-light-gray-1 py-16 lg:py-20">
        <div className="max-w-2xl mx-auto px-5">
          <h2 className="text-center font-bold text-2xl md:text-3xl text-neutral-black leading-tight">Enam lapisan yang jaga uangmu</h2>
          <p className="text-center text-neutral-gray mt-3 mb-12">Nyala di belakang layar, dari klik pertama sampai konser lewat.</p>
          <div className="flex flex-col">
            {sections.map((s, i) => (
              <div key={s.title} className="flex gap-4 sm:gap-5">
                {/* kolom node + garis nyambung */}
                <div className="flex flex-col items-center shrink-0">
                  <span className="relative z-10 w-12 h-12 rounded-full bg-primary-navy text-white font-fredoka font-bold text-lg grid place-items-center shadow-[3px_3px_0px_#245397]">
                    {i + 1}
                  </span>
                  {i < sections.length - 1 && (
                    <span className="w-0.5 grow my-2 border-l-2 border-dashed border-lummy-500/50" aria-hidden />
                  )}
                </div>
                {/* panel putih */}
                <div className="flex-1 mb-7 bg-neutral-white rounded-2xl border border-neutral-light-gray-1 p-5">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <span className="w-9 h-9 rounded-lg bg-secondary-blue-soft text-lummy-500 grid place-items-center shrink-0">
                      <s.Icon className="w-5 h-5" />
                    </span>
                    <h3 className="font-fredoka font-semibold text-lg text-neutral-black">{s.title}</h3>
                  </div>
                  <p className="text-neutral-gray text-sm leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-5 mt-16 text-center flex flex-col items-center">
        <h2 className="font-bold text-2xl md:text-3xl text-neutral-black">Sekarang tinggal cari tiketnya</h2>
        <p className="text-neutral-gray mt-3 mb-6">Ratusan tiket resale terverifikasi, semuanya dijaga escrow.</p>
        <Link href="/events"><Button.Primary className="flex items-center gap-2">Jelajah event <ArrowRight className="w-4 h-4" /></Button.Primary></Link>
      </section>
    </div>
  );
}
