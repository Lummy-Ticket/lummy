"use client";

// What happened to one escrow, in plain words. Every line comes from an event the contract emitted,
// read from the chain rather than from our database, and links to its transaction as proof. The raw
// hashes stay out of the way: people read the sentence, and whoever wants to check opens the link.
import { ExternalLink, ShieldCheck } from "lucide-react";
import { useFormatters, useT } from "@/lib/i18n";
import { explorerTx } from "@/lib/chain/config";
import { usdcText, type ChainHistory, type ChainHistoryEvent, type ChainListing } from "@/lib/chain/client";

type Copy = { en: string; id: string };
type Line = { title: Copy; detail?: Copy; dot: string };

const DOT = {
  step: "bg-lummy-500",
  good: "bg-secondary-green-dark",
  warn: "bg-secondary-orange-dark",
  end: "bg-neutral-gray",
};

const same = (s: string): Copy => ({ en: s, id: s });

function describe(e: ChainHistoryEvent, when: (unix: number) => string): Line {
  const money = e.amount ? usdcText(e.amount) : "";
  switch (e.kind) {
    case "Listed":
      return { dot: DOT.step, title: { en: "Ticket listed, the rules written into the contract", id: "Tiket dipasang, aturannya ditulis ke kontrak" } };
    case "Funded":
      return {
        dot: DOT.step,
        title: { en: "The buyer's money is locked in escrow", id: "Uang pembeli dikunci di escrow" },
        detail: {
          en: `${money}. Only this buyer or this seller can ever receive it.`,
          id: `${money}. Hanya pembeli atau penjual transaksi ini yang bisa menerimanya.`,
        },
      };
    case "HandoverMarked":
      return {
        dot: DOT.step,
        title: { en: "Handover recorded", id: "Serah terima dicatat" },
        detail: e.deadline ? { en: `Claims are open until ${when(e.deadline)}`, id: `Klaim bisa diajukan sampai ${when(e.deadline)}` } : undefined,
      };
    case "EventPostponed":
      return {
        dot: DOT.warn,
        title: { en: "Show rescheduled, the claim window moved with it", id: "Acara diundur, masa klaim ikut bergeser" },
        detail: e.eventEndsAt ? { en: `The show now ends ${when(e.eventEndsAt)}`, id: `Acara sekarang selesai ${when(e.eventEndsAt)}` } : undefined,
      };
    case "DisputeRaised":
      return { dot: DOT.warn, title: { en: "The buyer filed a claim, the payout is frozen", id: "Pembeli mengajukan klaim, pencairan dibekukan" } };
    case "Resolved":
      return {
        dot: DOT.good,
        title: { en: "Claim decided", id: "Klaim diputus" },
        detail: {
          en: `${usdcText(e.toBuyer ?? "0")} to the buyer, ${usdcText(e.toSeller ?? "0")} to the seller`,
          id: `${usdcText(e.toBuyer ?? "0")} ke pembeli, ${usdcText(e.toSeller ?? "0")} ke penjual`,
        },
      };
    case "Released":
      return { dot: DOT.good, title: { en: "Paid out to the seller", id: "Dana cair ke penjual" }, detail: money ? same(money) : undefined };
    case "Refunded":
      return { dot: DOT.end, title: { en: "Refunded to the buyer", id: "Dana dikembalikan ke pembeli" }, detail: money ? same(money) : undefined };
    case "ListingCancelled":
      return { dot: DOT.end, title: { en: "Listing cancelled", id: "Listing dibatalkan" } };
  }
}

/** The step still to come, from the contract's live state. Nothing once the escrow is settled. */
function upcoming(live: ChainListing, when: (unix: number) => string): Copy | null {
  switch (live.status) {
    case "Listed":
      return { en: "Waiting for a buyer", id: "Menunggu pembeli" };
    case "Funded":
      return { en: "Waiting for the handover", id: "Menunggu serah terima" };
    case "DisputeWindow":
      if (live.disputed) return { en: "Waiting for the claim to be decided", id: "Menunggu putusan klaim" };
      if (live.now > live.deadline) {
        return {
          en: "The claim window has passed. Anyone can now trigger the payout to the seller.",
          id: "Masa klaim sudah lewat. Siapa pun sekarang bisa memicu pencairan ke penjual.",
        };
      }
      return { en: `Pays the seller after ${when(live.deadline)} unless a claim is filed`, id: `Cair ke penjual setelah ${when(live.deadline)} kalau tidak ada klaim` };
    default:
      return null;
  }
}

export function EscrowTimeline({ history, live }: { history: ChainHistory; live?: ChainListing | null }) {
  const t = useT();
  const { formatDateTime } = useFormatters();
  const when = (unix: number) => formatDateTime(new Date(unix * 1000).toISOString());
  const next = upcoming(live ?? history.live, when);

  return (
    <div>
      <div className="text-xs text-neutral-gray">{t("Escrow history", "Riwayat escrow")}</div>
      <p className="text-xs text-neutral-gray mt-0.5 mb-3">
        {t("Read straight from the contract on Arbitrum, not from Lummy's database.", "Dibaca langsung dari kontrak di Arbitrum, bukan dari database Lummy.")}
      </p>
      <ol className="relative border-l-2 border-dashed border-neutral-light-gray-1 ml-1.5 flex flex-col gap-4">
        {history.events.map((e, i) => {
          const line = describe(e, when);
          const href = explorerTx(history.chainId, e.tx);
          return (
            <li key={`${e.tx}-${e.kind}-${i}`} className="pl-4 relative">
              <span className={`absolute -left-[7px] top-1 w-3 h-3 rounded-full border-2 border-neutral-white ${line.dot}`} />
              <div className="text-sm text-neutral-black">{t(line.title.en, line.title.id)}</div>
              {line.detail && <div className="text-xs text-neutral-gray mt-0.5">{t(line.detail.en, line.detail.id)}</div>}
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="text-neutral-gray">{when(e.at)}</span>
                <span className="inline-flex items-center gap-1 text-secondary-green-dark">
                  <ShieldCheck className="w-3.5 h-3.5" /> {t("Recorded on the blockchain", "Tercatat di blockchain")}
                </span>
                {href && (
                  <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-navy hover:opacity-70">
                    {t("Proof", "Bukti")} <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </li>
          );
        })}
        {next && (
          <li className="pl-4 relative">
            <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-neutral-light-gray-1 border-2 border-neutral-white" />
            <span className="text-sm text-neutral-gray">{t(next.en, next.id)}</span>
          </li>
        )}
      </ol>
    </div>
  );
}
