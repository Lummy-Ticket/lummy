import Link from "next/link";
import Image from "next/image";
import { Lock, ScanLine, TrendingUp, ShieldCheck, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getFeaturedEvents, formatEventDate, formatIDR } from "@/lib/mock";

const pillars = [
  {
    icon: Lock, color: "bg-secondary-blue-soft text-lummy-500",
    title: "Dana di-escrow",
    body: "Uang dikunci smart contract sampai konser selesai. Penjual gak bisa kabur, pembeli gak bisa dighosting.",
  },
  {
    icon: ScanLine, color: "bg-secondary-pink-soft text-secondary-pink-dark",
    title: "AI anti tiket palsu",
    body: "Tiap PDF dicek: forensik struktur file, barcode duplikat, dan skor pemalsuan, sebelum tiket tayang.",
  },
  {
    icon: TrendingUp, color: "bg-secondary-green-soft text-secondary-green-dark",
    title: "Harga dibatasi",
    body: "Maksimal 150% harga asli. Anti-calo, harga wajar, bukan pasar liar.",
  },
];

const steps = [
  { n: 1, title: "Pilih & bayar", body: "Pilih tiket resale, bayar seperti biasa. Gak ada wallet, gak ada istilah crypto." },
  { n: 2, title: "Dana dikunci escrow", body: "Uangmu ditahan di smart contract, bukan di rekening kami. Bisa dicek publik." },
  { n: 3, title: "Serah-terima aman", body: "Kamu langsung dapat surat kuasa siap-print. Akses KTP penjual pas mendekati hari-H." },
  { n: 4, title: "Konser selesai, dana cair", body: "Setelah event lewat tanpa masalah, dana baru cair ke penjual. Gagal masuk? Uang balik." },
];

export default function Home() {
  const featured = getFeaturedEvents();

  return (
    <>
      {/* Hero */}
      <section className="bg-hero-gradient pt-28 pb-20">
        <div className="max-w-6xl mx-auto px-5 lg:px-10 grid lg:grid-cols-2 gap-10 items-center">
          <div className="flex flex-col gap-6">
            <Badge.Base className="w-fit bg-secondary-blue-soft text-lummy-500 text-sm">
              Escrow + AI, tanpa ribet crypto
            </Badge.Base>
            <h1 className="text-4xl md:text-5xl font-bold text-neutral-black leading-tight">
              Beli &amp; jual tiket konser{" "}
              <span className="text-primary-navy">tanpa takut ketipu.</span>
            </h1>
            <p className="text-lg text-neutral-gray max-w-lg">
              OperTix jadi pihak ketiga tepercaya: uang dikunci sampai konser selesai, AI jaga dari
              tiket palsu. Kerasa seperti aplikasi biasa.
            </p>
            <div className="flex flex-wrap gap-4 items-center">
              <Link href="/events">
                <Button.Primary className="flex items-center gap-2">
                  Jelajah event <ArrowRight className="w-4 h-4" />
                </Button.Primary>
              </Link>
              <Link href="#cara-kerja">
                <Button.Secondary>Cara kerja</Button.Secondary>
              </Link>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2">
              {["Dana di-escrow", "AI anti palsu", "Harga dibatasi 150%"].map((t) => (
                <span key={t} className="flex items-center gap-2 text-sm text-neutral-gray">
                  <CheckCircle2 className="w-4 h-4 text-secondary-green-dark" /> {t}
                </span>
              ))}
            </div>
          </div>

          {/* Right: mascot + floating trust card */}
          <div className="relative hidden lg:flex justify-center">
            <Image src="/assets/images/mascot.png" alt="OperTix" width={360} height={360} className="object-contain drop-shadow-xl" priority />
            <div className="absolute bottom-4 -left-2 w-64 bg-neutral-white rounded-2xl border border-lummy-500 shadow-lummy-lg p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-neutral-gray">Dana kamu</span>
                <Badge.Base className="bg-secondary-blue-soft text-lummy-500 text-xs">TERKUNCI</Badge.Base>
              </div>
              <div className="font-fredoka font-bold text-xl text-neutral-black">{formatIDR(2_800_000)}</div>
              <div className="flex items-center gap-1.5 mt-2 text-xs text-secondary-green-dark">
                <ShieldCheck className="w-3.5 h-3.5" /> Dikunci di kontrak, cek sendiri di explorer
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust pillars */}
      <section className="max-w-6xl mx-auto px-5 lg:px-10 -mt-10 grid md:grid-cols-3 gap-5">
        {pillars.map((p) => (
          <div key={p.title} className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 shadow-lummy p-6 flex flex-col gap-3">
            <span className={`w-12 h-12 rounded-2xl grid place-items-center ${p.color}`}>
              <p.icon className="w-6 h-6" />
            </span>
            <h5 className="font-fredoka font-semibold text-lg text-neutral-black">{p.title}</h5>
            <p className="text-sm text-neutral-gray">{p.body}</p>
          </div>
        ))}
      </section>

      {/* How it works */}
      <section id="cara-kerja" className="max-w-6xl mx-auto px-5 lg:px-10 mt-24">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <Badge.Base className="bg-secondary-pink-soft text-secondary-pink-dark text-sm">Cara kerja</Badge.Base>
          <h2 className="text-3xl md:text-4xl font-bold text-neutral-black mt-4">Aman dari klik pertama sampai konser</h2>
          <p className="text-neutral-gray mt-3">Empat langkah. Dana kamu dijaga kode di sepanjang jalan.</p>
        </div>
        <div className="grid md:grid-cols-4 gap-5">
          {steps.map((s) => (
            <div key={s.n} className="relative bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-6">
              <span className="font-fredoka font-bold text-lg w-10 h-10 rounded-2xl bg-primary-navy text-white grid place-items-center">{s.n}</span>
              <h5 className="font-fredoka font-semibold text-neutral-black mt-4">{s.title}</h5>
              <p className="text-sm text-neutral-gray mt-2">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured events */}
      <section className="max-w-6xl mx-auto px-5 lg:px-10 mt-24">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-neutral-black">Event pilihan</h2>
            <p className="text-neutral-gray mt-2">Tiket resale terverifikasi, siap dijaga escrow.</p>
          </div>
          <Link href="/events" className="hidden sm:flex items-center gap-1 text-primary-navy font-medium hover:opacity-80 transition">
            Lihat semua <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {featured.map((e) => (
            <Card.Event
              key={e.id}
              image={e.image}
              date={formatEventDate(e.dateISO)}
              title={e.title}
              location={`${e.venue}, ${e.city}`}
              category={e.category}
              price={e.fromPrice}
              redirect={`/events/${e.id}`}
            />
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="max-w-6xl mx-auto px-5 lg:px-10 mt-24">
        <div className="rounded-3xl bg-lummy-gradient text-white px-8 py-14 text-center flex flex-col items-center gap-5">
          <h2 className="text-3xl md:text-4xl font-bold">Punya tiket yang gak kepakai?</h2>
          <p className="text-white/85 max-w-xl">Jual di OperTix. AI bantu isi datanya otomatis, dan dana kamu aman sampai konser lewat.</p>
          <Link href="/events">
            <Button.Secondary className="flex items-center gap-2">Mulai sekarang <ArrowRight className="w-4 h-4" /></Button.Secondary>
          </Link>
        </div>
      </section>
    </>
  );
}
