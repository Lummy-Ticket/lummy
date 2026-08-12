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

      {/* Timeline: 6 lapis perlindungan, garis dashed = perforasi tiket, band cream */}
      <section className="bg-secondary-cream-light border-y border-secondary-cream-soft py-14 lg:py-16">
        <div className="max-w-2xl mx-auto px-5">
          <p className="text-center text-sm font-medium text-secondary-brown-dark mb-10">6 lapis perlindungan, dari klik pertama sampai konser lewat</p>
          <div className="relative">
            {/* garis vertikal putus-putus */}
            <div className="absolute left-[21px] top-3 bottom-3 border-l-2 border-dashed border-lummy-500/40" aria-hidden />
            <div className="flex flex-col gap-9">
              {sections.map((s, i) => (
                <div key={s.title} className="relative flex gap-5">
                  {/* node bernomor */}
                  <span className="relative z-10 shrink-0 w-11 h-11 rounded-full bg-primary-navy text-white font-fredoka font-bold grid place-items-center border-4 border-secondary-cream-light">
                    {i + 1}
                  </span>
                  {/* konten */}
                  <div className="pt-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-secondary-blue-soft text-lummy-500 grid place-items-center shrink-0">
                        <s.Icon className="w-4 h-4" />
                      </span>
                      <h3 className="font-fredoka font-semibold text-lg text-neutral-black">{s.title}</h3>
                    </div>
                    <p className="text-neutral-gray text-sm mt-2 leading-relaxed">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-5 mt-14 text-center">
        <Link href="/events"><Button.Primary className="flex items-center gap-2 mx-auto">Jelajah event <ArrowRight className="w-4 h-4" /></Button.Primary></Link>
      </section>
    </div>
  );
}
