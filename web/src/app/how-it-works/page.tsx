import Link from "next/link";
import { Lock, ScanLine, TrendingUp, Eye, RotateCcw, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const sections = [
  {
    icon: Lock, color: "bg-secondary-blue-soft text-lummy-500",
    title: "Dana dikunci escrow",
    body: "Waktu kamu bayar, uangnya masuk ke smart contract, bukan ke rekening kami atau langsung ke penjual. Dana baru cair ke penjual setelah konser selesai dan serah-terima beres.",
  },
  {
    icon: ScanLine, color: "bg-secondary-pink-soft text-secondary-pink-dark",
    title: "AI cek keaslian tiket",
    body: "Tiap PDF tiket diperiksa berlapis: forensik struktur file (deteksi tiket yang diedit), barcode di-decode dan dicek duplikat, plus skor pemalsuan. Sinyal buat review, bukan gantiin manusia.",
  },
  {
    icon: TrendingUp, color: "bg-secondary-green-soft text-secondary-green-dark",
    title: "Harga dibatasi",
    body: "Maksimal 150% dari harga asli. Ini bikin OperTix jadi pasar resale yang wajar, bukan lahan calo.",
  },
  {
    icon: Eye, color: "bg-secondary-indigo-soft text-secondary-indigo-dark",
    title: "Transparan, bisa dicek sendiri",
    body: "Status dana kamu (terkunci / cair / dikembalikan) bisa diverifikasi publik di block explorer. Jangan percaya kami, cek sendiri.",
  },
  {
    icon: RotateCcw, color: "bg-secondary-gold-soft text-secondary-gold-dark",
    title: "Gagal masuk? Uang balik",
    body: "Kalau tiket bermasalah atau kamu ditolak di gate, dana di-refund karena belum cair ke penjual. Garansinya uang balik, jujur, bukan 'dijamin masuk'.",
  },
];

export default function HowItWorks() {
  return (
    <div className="pb-10">
      <section className="bg-hero-gradient pt-28 pb-16">
        <div className="max-w-3xl mx-auto px-5 text-center">
          <Badge.Base className="bg-secondary-blue-soft text-lummy-500 text-sm">Cara kerja</Badge.Base>
          <h1 className="text-3xl md:text-5xl font-bold text-neutral-black mt-4">Kenapa resale di OperTix aman</h1>
          <p className="text-lg text-neutral-gray mt-4">Blockchain + AI kerja di belakang layar. Kamu cukup beli seperti biasa.</p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-5 mt-14 flex flex-col gap-5">
        {sections.map((s) => (
          <div key={s.title} className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 shadow-lummy p-6 flex gap-5">
            <span className={`w-12 h-12 rounded-2xl grid place-items-center shrink-0 ${s.color}`}><s.icon className="w-6 h-6" /></span>
            <div>
              <h3 className="font-fredoka font-semibold text-lg text-neutral-black">{s.title}</h3>
              <p className="text-neutral-gray text-sm mt-1.5">{s.body}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="max-w-3xl mx-auto px-5 mt-14 text-center">
        <Link href="/events"><Button.Primary className="flex items-center gap-2 mx-auto">Jelajah event <ArrowRight className="w-4 h-4" /></Button.Primary></Link>
      </section>
    </div>
  );
}
