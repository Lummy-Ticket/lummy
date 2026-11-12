"use client";

// The public list of orders in the escrow on Arbitrum One: where a reader with no id starts. Each row
// is read from the contract (lib/chain/recent.ts), never from our database, and opens that order's own
// proof page. Today every row is one of the team's own orders, and the page says so.
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatUnits } from "viem";
import { ArrowRight, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { useT } from "@/lib/i18n";

type Order = { id: string; price: string; at: number; tx: string; status: string; disputed: boolean };
type Recent = { chainId: number; escrow: string; total: number; orders: Order[]; readAt: number };

const STATUS: Record<string, { en: string; id: string; tone: string }> = {
  Funded: { en: "Locked in escrow", id: "Terkunci di escrow", tone: "bg-secondary-blue-extra text-primary-blue" },
  DisputeWindow: { en: "Held: ticket handed over", id: "Ditahan: tiket sudah diserahkan", tone: "bg-secondary-blue-extra text-primary-blue" },
  Released: { en: "Paid to the seller", id: "Cair ke penjual", tone: "bg-green-50 text-green-700" },
  Refunded: { en: "Returned to the buyer", id: "Kembali ke pembeli", tone: "bg-amber-50 text-amber-700" },
};

const when = (at: number) => `${new Date(at * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;
const short = (hex: string) => `${hex.slice(0, 8)}…${hex.slice(-6)}`;

export default function ProofListPage() {
  const t = useT();
  const [recent, setRecent] = useState<Recent | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/chain/recent")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Recent) => live && setRecent(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  return (
    <PageContainer width="form">
      <div className="flex items-center gap-2 text-primary-blue text-sm font-medium">
        <ShieldCheck className="size-4" aria-hidden />
        {t("Public proof", "Bukti publik")}
      </div>
      <h1 className="font-semibold text-2xl sm:text-3xl text-neutral-black mt-2">{t("Orders in escrow on Arbitrum One", "Pesanan di escrow Arbitrum One")}</h1>
      <p className="mt-2 text-neutral-dark-gray">
        {t(
          "Every order paid into the escrow contract, newest first, read from the contract itself and not from our database. Real USDC. For now these are the team's own orders: payments are not open to the public yet.",
          "Setiap pesanan yang dibayar ke kontrak escrow, terbaru di atas, dibaca dari kontraknya sendiri dan bukan dari database kami. USDC sungguhan. Untuk sekarang ini pesanan tim sendiri: pembayaran belum dibuka untuk umum.",
        )}
      </p>

      {!recent && !failed && (
        <div className="mt-6 rounded-3xl border border-neutral-light-gray-1 p-6 flex items-center gap-3 text-neutral-dark-gray" data-proof-loading>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t("Reading the contract...", "Membaca kontrak...")}
        </div>
      )}
      {failed && (
        <div className="mt-6 rounded-3xl border border-neutral-light-gray-1 p-6 text-neutral-dark-gray" data-proof-failed>
          {t("The chain could not be read just now. Reload in a moment.", "Chain belum bisa dibaca. Muat ulang sebentar lagi.")}
        </div>
      )}

      {recent && (
        <>
          <ul className="mt-6 flex flex-col gap-3" data-proof-list>
            {recent.orders.map((o) => {
              const s = STATUS[o.status];
              return (
                <li key={o.id}>
                  <Link href={`/proof/${o.id}`} className="block bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5 hover:border-primary-blue transition-colors" data-proof-row>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-lg text-neutral-black">{formatUnits(BigInt(o.price), 6)} USDC</span>
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${s?.tone ?? "bg-neutral-light-gray-1 text-neutral-dark-gray"}`}>
                        {o.disputed && o.status === "Funded" ? t("Under a claim", "Sedang diklaim") : s ? t(s.en, s.id) : o.status}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-neutral-dark-gray">
                      <span>{t("Paid", "Dibayar")} {when(o.at)}</span>
                      <span className="inline-flex items-center gap-1 text-primary-blue font-medium">
                        <span className="font-mono">{short(o.id)}</span>
                        <ArrowRight className="size-4" aria-hidden />
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          {recent.orders.length === 0 && <p className="mt-6 text-neutral-dark-gray">{t("No order has been paid into this escrow yet.", "Belum ada pesanan yang dibayar ke escrow ini.")}</p>}
          <p className="mt-4 text-sm text-neutral-dark-gray">
            {t(`${recent.total} in all.`, `${recent.total} seluruhnya.`)}{" "}
            <a href={`https://arbiscan.io/address/${recent.escrow}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-blue font-medium">
              {t("The contract on Arbiscan", "Kontraknya di Arbiscan")}
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </p>
        </>
      )}
    </PageContainer>
  );
}
