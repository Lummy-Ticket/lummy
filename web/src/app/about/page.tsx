import Link from "next/link";
import Image from "next/image";
import { Lock, ScanLine, TrendingUp, Eye, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/PageContainer";

const pillars = [
  { Icon: Lock, cls: "bg-secondary-blue-soft text-lummy-500", title: "Dana di-escrow", body: "Uang dikunci smart contract sampai konser selesai. Penjual gak bisa kabur, pembeli gak bisa dighosting." },
  { Icon: ScanLine, cls: "bg-secondary-pink-soft text-secondary-pink-dark", title: "AI anti tiket palsu", body: "Tiap PDF dicek: forensik struktur file, barcode duplikat, dan skor pemalsuan, sebelum tiket tayang." },
  { Icon: TrendingUp, cls: "bg-secondary-green-soft text-secondary-green-dark", title: "Harga dibatasi", body: "Maksimal 150% harga asli. Anti-calo, harga wajar, bukan pasar liar." },
  { Icon: Eye, cls: "bg-secondary-orange-soft text-secondary-orange-dark", title: "Transparan on-chain", body: "Status dana (terkunci/cair/refund) bisa dicek siapa aja di block explorer. Jangan percaya kami, cek sendiri." },
];

const charter = [
  { title: "Aman & terjaga", body: "Penjual gak dibayar sebelum kamu beneran masuk gate. Dana ditahan escrow, bukan di rekening kami." },
  { title: "Transparansi total", body: "Harga asli, markup, dan biaya kelihatan jelas sebelum bayar. Semua transaksi bisa diverifikasi publik." },
  { title: "Keaslian dijaga AI", body: "Tiket editan atau barcode dobel ketahan sebelum tayang. Yang mencurigakan masuk review manual." },
  { title: "Gagal masuk, uang balik", body: "Kalau tiket bermasalah atau kamu ditolak di gate, dana dikembalikan penuh. Itu janji, dijamin kode." },
];

const journey = [
  { n: 1, title: "Pilih & bayar", body: "Pilih tiket resale, bayar seperti biasa. Gak ada wallet, gak ada istilah crypto." },
  { n: 2, title: "Dana dikunci escrow", body: "Uangmu ditahan di smart contract, bukan di rekening kami. Bisa dicek publik." },
  { n: 3, title: "Serah-terima aman", body: "Kamu langsung dapat surat kuasa siap-print. Akses KTP penjual pas mendekati hari-H." },
  { n: 4, title: "Konser selesai, dana cair", body: "Setelah event lewat tanpa masalah, dana baru cair ke penjual. Gagal masuk? Uang balik." },
];

export default function AboutPage() {
  return (
    <PageContainer width="wide">
      {/* Intro */}
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8 items-center">
        <div>
          <h1 className="text-3xl md:text-5xl font-bold text-neutral-black leading-tight">
            Beli-jual tiket konser <span className="text-primary-navy">tanpa takut ketipu.</span>
          </h1>
          <p className="text-neutral-gray mt-4 max-w-xl">
            OperTix lahir dari masalah nyata: pasar resale tiket di Indonesia penuh calo, harga liar, dan penipuan
            transfer manual. Kami jadi pihak ketiga tepercaya, tempat penjual bisa pasang harga wajar dan pembeli
            gak perlu takut kehilangan uang.
          </p>
          <p className="text-neutral-gray mt-3 max-w-xl">
            Di balik layar ada escrow dan AI. Di depan, rasanya seperti aplikasi biasa, tanpa ribet crypto. Dana kamu
            dijaga kode, bukan sekadar janji.
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <Link href="/events"><Button.Primary className="flex items-center gap-2">Jelajah event <ArrowRight className="w-4 h-4" /></Button.Primary></Link>
            <Link href="/how-it-works"><Button.Secondary>Cara kerja</Button.Secondary></Link>
          </div>
        </div>
        <div className="hidden lg:flex justify-center">
          <Image src="/assets/images/mascot.png" alt="OperTix" width={300} height={300} className="object-contain drop-shadow-xl" priority />
        </div>
      </div>

      {/* Pillars */}
      <div className="grid sm:grid-cols-2 gap-5 mt-14">
        {pillars.map((p) => (
          <div key={p.title} className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 shadow-lummy p-6 flex gap-4">
            <span className={`w-12 h-12 rounded-2xl grid place-items-center shrink-0 ${p.cls}`}>
              <p.Icon className="w-6 h-6" />
            </span>
            <div>
              <h3 className="font-fredoka font-semibold text-lg text-neutral-black">{p.title}</h3>
              <p className="text-sm text-neutral-gray mt-1">{p.body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Journey */}
      <div className="mt-16">
        <h2 className="text-2xl md:text-3xl font-bold text-neutral-black text-center">Aman dari klik pertama sampai konser</h2>
        <p className="text-neutral-gray text-center mt-2">Empat langkah. Dana kamu dijaga kode di sepanjang jalan.</p>
        <div className="grid md:grid-cols-4 gap-5 mt-8">
          {journey.map((s) => (
            <div key={s.n} className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-6">
              <span className="font-fredoka font-bold text-lg w-10 h-10 rounded-2xl bg-primary-navy text-white grid place-items-center">{s.n}</span>
              <h3 className="font-fredoka font-semibold text-neutral-black mt-4">{s.title}</h3>
              <p className="text-sm text-neutral-gray mt-2">{s.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Charter */}
      <div className="mt-16">
        <h2 className="text-2xl md:text-3xl font-bold text-neutral-black">Janji kami</h2>
        <div className="grid sm:grid-cols-2 gap-5 mt-6">
          {charter.map((c) => (
            <div key={c.title} className="border-l-2 border-lummy-500 pl-4 py-1">
              <h3 className="font-fredoka font-semibold text-neutral-black">{c.title}</h3>
              <p className="text-sm text-neutral-gray mt-1">{c.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="rounded-3xl bg-lummy-gradient text-white px-8 py-12 text-center flex flex-col items-center gap-4 mt-16">
        <h2 className="text-2xl md:text-3xl font-bold">Siap cari tiketmu?</h2>
        <p className="text-white/85 max-w-lg">Ratusan tiket resale terverifikasi, semuanya dijaga escrow sampai konser selesai.</p>
        <Link href="/events"><Button.Secondary className="flex items-center gap-2">Jelajah event <ArrowRight className="w-4 h-4" /></Button.Secondary></Link>
      </div>
    </PageContainer>
  );
}
