"use client";

// Public proof for one escrow: what happened to it, read straight from the contract, and the rules the
// contract holds it to. Anyone with the link can check it, a buyer, a seller or a promoter, without an
// account. Nothing here comes from our database, so there is no personal data to leak. The same page
// shows the public record of a QRIS order (docs/09 §7): there the money sits with the payment provider
// and the contract keeps the record, and the page says so instead of promising what it cannot.
import Link from "next/link";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { AlertTriangle, Copy, ExternalLink, Landmark, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/PageContainer";
import { EscrowTimeline } from "@/components/common/EscrowTimeline";
import { useT } from "@/lib/i18n";
import { explorerAddress } from "@/lib/chain/config";
import { useChainHistory, type ChainHistory } from "@/lib/chain/client";
import { shortHash } from "@/lib/mock";

type Words = { en: string; id: string };

const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const NETWORK: Record<number, string> = { 421614: "Arbitrum Sepolia", 42161: "Arbitrum One", 31337: "Anvil" };
const TESTNETS = new Set([421614, 31337]);

// Each one is a property of the contract itself (docs/09, keputusan C, F, G), not a promise of ours.
const RULES: Words[] = [
  {
    en: "The money can only go to this buyer or this seller. Not to Lummy, not to anyone else.",
    id: "Dana hanya bisa ke pembeli atau penjual transaksi ini. Tidak ke Lummy, tidak ke pihak lain.",
  },
  {
    en: "Once the claim window passes without a claim, nobody can hold the payout back, Lummy included.",
    id: "Setelah masa klaim lewat tanpa klaim, tidak ada yang bisa menahan pencairan, termasuk Lummy.",
  },
  {
    en: "Every step above is public and cannot be changed afterwards.",
    id: "Setiap langkah di atas tercatat publik dan tidak bisa diubah.",
  },
];

// The record of a QRIS order: what the contract itself guarantees about it (LummyLedger).
const LEDGER_RULES: Words[] = [
  {
    en: "One payment backs one order, and one ticket can be sold once. The contract refuses a second record of either.",
    id: "Satu pembayaran untuk satu pesanan, dan satu tiket hanya bisa terjual sekali. Kontrak menolak catatan kedua untuk keduanya.",
  },
  {
    en: "A payout cannot be recorded before the claim window ends. Once it passes without a claim, anyone can record it, and a refund no longer can be.",
    id: "Pencairan tidak bisa dicatat sebelum masa klaim berakhir. Setelah lewat tanpa klaim, siapa pun bisa mencatatnya, dan refund tidak bisa dicatat lagi.",
  },
  {
    en: "Every step above is public and cannot be changed afterwards.",
    id: "Setiap langkah di atas tercatat publik dan tidak bisa diubah.",
  },
];

/** One line on where this escrow stands, from the contract's live state and its last decision. */
function standing(h: ChainHistory): Words {
  const { live } = h;
  const verdict = [...h.events].reverse().find((e) => e.kind === "Resolved");
  if (h.source === "ledger") {
    switch (live.status) {
      case "DisputeWindow":
        if (live.disputed) return { en: "A claim is open, the payout is on hold", id: "Ada klaim, pencairan ditahan" };
        if (live.now > live.deadline) return { en: "Claim window over, the payout is due", id: "Masa klaim lewat, pencairan jatuh tempo" };
        return { en: "Paid, held until the claim window ends", id: "Sudah dibayar, ditahan sampai masa klaim berakhir" };
      case "Released":
        return { en: "Done: payout to the seller recorded", id: "Selesai: pencairan ke penjual dicatat" };
      case "Refunded":
        return verdict?.toSeller && verdict.toSeller !== "0"
          ? { en: "Done: split by the claim decision", id: "Selesai: dibagi sesuai putusan klaim" }
          : { en: "Done: refund to the buyer recorded", id: "Selesai: refund ke pembeli dicatat" };
      default:
        return { en: "Record found", id: "Catatan ditemukan" };
    }
  }
  switch (live.status) {
    case "Listed":
      return { en: "Listed, not paid for yet", id: "Sudah dipasang, belum dibayar" };
    case "Funded":
      return { en: "Money locked, waiting for the handover", id: "Dana terkunci, menunggu serah terima" };
    case "DisputeWindow":
      if (live.disputed) return { en: "A claim is open, the payout is frozen", id: "Ada klaim, pencairan dibekukan" };
      if (live.now > live.deadline) return { en: "Claim window over, ready to pay the seller", id: "Masa klaim lewat, siap cair ke penjual" };
      return { en: "Money locked until the claim window ends", id: "Dana terkunci sampai masa klaim berakhir" };
    case "Released":
      return { en: "Done: paid out to the seller", id: "Selesai: dana cair ke penjual" };
    case "Refunded":
      return verdict?.toSeller && verdict.toSeller !== "0"
        ? { en: "Done: split by the claim decision", id: "Selesai: dana dibagi sesuai putusan klaim" }
        : { en: "Done: refunded to the buyer", id: "Selesai: dana kembali ke pembeli" };
    case "Cancelled":
      return { en: "Listing cancelled", id: "Listing dibatalkan" };
    default:
      return { en: "Escrow found", id: "Escrow ditemukan" };
  }
}

function Row({ label, value, href, onCopy }: { label: string; value: string; href?: string | null; onCopy?: () => void }) {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-dashed border-neutral-light-gray-1 last:border-0">
      <span className="text-xs text-neutral-gray shrink-0">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-xs text-neutral-black truncate">{value}</span>
        {onCopy && (
          <button onClick={onCopy} aria-label={t("Copy", "Salin")} className="text-neutral-gray hover:text-primary-navy cursor-pointer shrink-0">
            <Copy className="w-3.5 h-3.5" />
          </button>
        )}
        {href && (
          <a href={href} target="_blank" rel="noreferrer" className="text-primary-navy hover:opacity-70 shrink-0">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

export default function ProofPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const valid = BYTES32.test(id);
  const { data, state, refresh } = useChainHistory(valid ? id : undefined);
  const copy = (value: string, what: Words) => {
    navigator.clipboard?.writeText(value);
    toast.success(t(what.en, what.id));
  };

  if (!valid || state === "missing") {
    return (
      <PageContainer width="form">
        <h1 className="font-fredoka font-semibold text-2xl text-neutral-black">{t("Not found", "Tidak ditemukan")}</h1>
        <p className="text-sm text-neutral-gray mt-2">
          {t(
            "There is no escrow or order record with this ID in our contracts. A record appears a moment after the payment, so try again shortly, or check the link you were given.",
            "Tidak ada escrow atau catatan pesanan dengan ID ini di kontrak kami. Catatan muncul sesaat setelah pembayaran, jadi coba lagi sebentar, atau cek lagi tautan yang kamu terima."
          )}
        </p>
        <Link href="/" className="inline-block mt-4 text-sm text-primary-navy font-medium">{t("Back to Lummy", "Kembali ke Lummy")}</Link>
      </PageContainer>
    );
  }

  if (!data) {
    return (
      <PageContainer width="form">
        {state === "failed" ? (
          <div className="rounded-3xl border border-neutral-light-gray-1 p-6 text-center flex flex-col items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-secondary-orange-dark" />
            <p className="text-sm text-neutral-gray">
              {t("The blockchain cannot be read right now. Try again in a moment.", "Blockchain belum bisa dibaca sekarang. Coba lagi sebentar.")}
            </p>
            <Button.Ghost className="text-sm" onClick={refresh}>{t("Try again", "Coba lagi")}</Button.Ghost>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-gray">
            <Loader2 className="w-4 h-4 animate-spin" /> {t("Reading the contract...", "Membaca kontrak...")}
          </div>
        )}
      </PageContainer>
    );
  }

  const where = standing(data);
  const ledger = data.source === "ledger";
  return (
    <PageContainer width="form">
      <div className="text-xs font-semibold uppercase tracking-wide text-lummy-500 flex items-center gap-1.5">
        <ShieldCheck className="w-4 h-4" /> {ledger ? t("Order record", "Catatan pesanan") : t("Escrow proof", "Bukti escrow")}
      </div>
      <h1 className="font-fredoka font-semibold text-2xl sm:text-3xl text-neutral-black mt-2">{t(where.en, where.id)}</h1>
      <p className="text-sm text-neutral-gray mt-2">
        {ledger
          ? t(
              "Every step of this order, read straight from the contract on the blockchain. This page holds no personal data.",
              "Setiap langkah pesanan ini, dibaca langsung dari kontrak di blockchain. Halaman ini tidak memuat data pribadi."
            )
          : t(
              "Every step of this escrow, read straight from the contract on the blockchain. This page holds no personal data.",
              "Setiap langkah escrow ini, dibaca langsung dari kontrak di blockchain. Halaman ini tidak memuat data pribadi."
            )}
      </p>

      <div className="mt-6 bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5">
        <EscrowTimeline history={data} />
      </div>

      <div className="mt-4 bg-secondary-blue-extra rounded-3xl p-5">
        <h2 className="font-fredoka font-semibold text-lg text-neutral-black">{t("Rules the contract enforces", "Aturan yang dijaga kontrak")}</h2>
        <ul className="mt-3 flex flex-col gap-2.5">
          {(ledger ? LEDGER_RULES : RULES).map((r) => (
            <li key={r.en} className="flex gap-2 text-sm text-neutral-black">
              <ShieldCheck className="w-4 h-4 text-secondary-green-dark shrink-0 mt-0.5" /> {t(r.en, r.id)}
            </li>
          ))}
        </ul>
      </div>

      {ledger && (
        <div className="mt-4 rounded-3xl border border-neutral-light-gray-1 p-5 flex gap-3">
          <Landmark className="w-5 h-5 text-primary-navy shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-sm text-neutral-black">{t("Where the money is", "Di mana uangnya")}</h2>
            <p className="text-sm text-neutral-gray mt-1">
              {t(
                "This order was paid by QRIS. The money is held by Lummy's payment provider (Xendit), not by this contract. The contract keeps Lummy's public record of the order: if what happens to the money ever differs from it, this page is the evidence.",
                "Pesanan ini dibayar lewat QRIS. Uangnya dipegang penyedia pembayaran Lummy (Xendit), bukan oleh kontrak ini. Kontrak menyimpan catatan publik Lummy atas pesanan ini: kalau yang terjadi pada uangnya berbeda dari catatan ini, halaman inilah buktinya."
              )}
            </p>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-3xl border border-neutral-light-gray-1 p-5">
        <div className="text-xs text-neutral-gray mb-1">{t("Technical details", "Detail teknis")}</div>
        <Row
          label={ledger ? t("Ledger contract", "Kontrak buku besar") : t("Escrow contract", "Kontrak escrow")}
          value={shortHash(data.escrow)}
          href={explorerAddress(data.chainId, data.escrow)}
        />
        <Row
          label={ledger ? t("Record ID", "ID catatan") : t("Escrow ID", "ID escrow")}
          value={shortHash(data.listingId, 10)}
          onCopy={() => copy(data.listingId, ledger ? { en: "Record ID copied", id: "ID catatan disalin" } : { en: "Escrow ID copied", id: "ID escrow disalin" })}
        />
        <Row label={t("Network", "Jaringan")} value={`${NETWORK[data.chainId] ?? "Chain"} (${data.chainId})`} />
      </div>

      {TESTNETS.has(data.chainId) && (
        <p className="mt-4 text-xs text-neutral-gray">
          {ledger
            ? t(
                "This record is on a test network and the payment ran in Xendit's test mode: no real money moved.",
                "Catatan ini di jaringan uji dan pembayarannya berjalan di mode uji Xendit: tidak ada uang sungguhan yang berpindah."
              )
            : t("This runs on a test network: amounts are test USDC, not real money.", "Ini berjalan di jaringan uji: nilainya USDC uji coba, bukan uang sungguhan.")}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button.Ghost className="text-sm" onClick={() => copy(window.location.href, { en: "Link copied", id: "Tautan disalin" })}>
          <Copy className="w-4 h-4" /> {t("Copy link", "Salin tautan")}
        </Button.Ghost>
        <Link href="/how-it-works" className="text-sm text-primary-navy font-medium hover:opacity-80">
          {t("How Lummy works", "Cara kerja Lummy")}
        </Link>
      </div>
    </PageContainer>
  );
}
