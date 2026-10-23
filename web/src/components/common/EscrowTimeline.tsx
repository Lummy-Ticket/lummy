"use client";

// What happened to one escrow, in plain words. Every line comes from an event the contract emitted,
// read from the chain rather than from our database, and links to its transaction as proof. The raw
// hashes stay out of the way: people read the sentence, and whoever wants to check opens the link.
// Two kinds: an escrow whose money sits in the contract, and the public record of a QRIS order, whose
// money sits with the payment provider while the contract records each step (docs/09 §7). The words
// never claim the second holds money.
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

const REFUND_REASON: Record<string, Copy> = {
  EventCancelled: { en: "The organiser cancelled the show.", id: "Penyelenggara membatalkan acara." },
  EventPostponed: { en: "The show was postponed and the buyer chose the money.", id: "Acara diundur dan pembeli memilih uangnya kembali." },
};

function describe(e: ChainHistoryEvent, when: (unix: number) => string, money: (units: string) => string, ledger: boolean): Line {
  const amount = e.amount ? money(e.amount) : "";
  switch (e.kind) {
    case "Paid":
      return {
        dot: DOT.step,
        title: { en: "Payment received, the record opened on chain", id: "Pembayaran masuk, catatannya dibuka di chain" },
        detail: {
          en: `${amount} held for the seller.${e.deadline ? ` Claims are open until ${when(e.deadline)}.` : ""}`,
          id: `${amount} ditahan untuk penjual.${e.deadline ? ` Klaim bisa diajukan sampai ${when(e.deadline)}.` : ""}`,
        },
      };
    case "Listed":
      return { dot: DOT.step, title: { en: "Ticket listed, the rules written into the contract", id: "Tiket dipasang, aturannya ditulis ke kontrak" } };
    case "Funded":
      return {
        dot: DOT.step,
        title: { en: "The buyer's money is locked in escrow", id: "Uang pembeli dikunci di escrow" },
        detail: {
          en: `${amount}. Only this buyer or this seller can ever receive it.`,
          id: `${amount}. Hanya pembeli atau penjual transaksi ini yang bisa menerimanya.`,
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
      return {
        dot: DOT.warn,
        title: ledger
          ? { en: "The buyer filed a claim, the payout is on hold", id: "Pembeli mengajukan klaim, pencairan ditahan" }
          : { en: "The buyer filed a claim, the payout is frozen", id: "Pembeli mengajukan klaim, pencairan dibekukan" },
      };
    case "Resolved":
      return {
        dot: DOT.good,
        title: { en: "Claim decided", id: "Klaim diputus" },
        detail: {
          en: `${money(e.toBuyer ?? "0")} to the buyer, ${money(e.toSeller ?? "0")} to the seller`,
          id: `${money(e.toBuyer ?? "0")} ke pembeli, ${money(e.toSeller ?? "0")} ke penjual`,
        },
      };
    case "Released":
      return {
        dot: DOT.good,
        title: ledger ? { en: "Payout to the seller recorded", id: "Pencairan ke penjual dicatat" } : { en: "Paid out to the seller", id: "Dana cair ke penjual" },
        detail: amount ? same(amount) : undefined,
      };
    case "Refunded": {
      const why = e.reason ? REFUND_REASON[e.reason] : undefined;
      return {
        dot: DOT.end,
        title: ledger ? { en: "Refund to the buyer recorded", id: "Refund ke pembeli dicatat" } : { en: "Refunded to the buyer", id: "Dana dikembalikan ke pembeli" },
        detail: amount ? (why ? { en: `${amount}. ${why.en}`, id: `${amount}. ${why.id}` } : same(amount)) : undefined,
      };
    }
    case "ListingCancelled":
      return { dot: DOT.end, title: { en: "Listing cancelled", id: "Listing dibatalkan" } };
  }
}

/** The step still to come, from the contract's live state. Nothing once the escrow is settled. */
function upcoming(live: ChainListing, when: (unix: number) => string, ledger: boolean): Copy | null {
  switch (live.status) {
    case "Listed":
      return { en: "Waiting for a buyer", id: "Menunggu pembeli" };
    case "Funded":
      return { en: "Waiting for the handover", id: "Menunggu serah terima" };
    case "DisputeWindow":
      if (live.disputed) return { en: "Waiting for the claim to be decided", id: "Menunggu putusan klaim" };
      if (live.now > live.deadline) {
        return ledger
          ? {
              en: "The claim window has passed. Anyone can now record the payout to the seller.",
              id: "Masa klaim sudah lewat. Siapa pun sekarang bisa mencatat pencairan ke penjual.",
            }
          : {
              en: "The claim window has passed. Anyone can now trigger the payout to the seller.",
              id: "Masa klaim sudah lewat. Siapa pun sekarang bisa memicu pencairan ke penjual.",
            };
      }
      return ledger
        ? { en: `Becomes the seller's after ${when(live.deadline)} unless a claim is filed`, id: `Jadi hak penjual setelah ${when(live.deadline)} kalau tidak ada klaim` }
        : { en: `Pays the seller after ${when(live.deadline)} unless a claim is filed`, id: `Cair ke penjual setelah ${when(live.deadline)} kalau tidak ada klaim` };
    default:
      return null;
  }
}

/**
 * Where a settled escrow ends, from the contract's live status, while the event that settled it is still
 * being read from the chain. No amount and no proof link: those come with the event itself.
 */
function settledLine(live: ChainListing, ledger: boolean): Line | null {
  switch (live.status) {
    case "Released":
      return { dot: DOT.good, title: ledger ? { en: "Payout to the seller recorded", id: "Pencairan ke penjual dicatat" } : { en: "Paid out to the seller", id: "Dana cair ke penjual" } };
    case "Refunded":
      return { dot: DOT.end, title: ledger ? { en: "Refund to the buyer recorded", id: "Refund ke pembeli dicatat" } : { en: "Refunded to the buyer", id: "Dana dikembalikan ke pembeli" } };
    case "Cancelled":
      return { dot: DOT.end, title: { en: "Listing cancelled", id: "Listing dibatalkan" } };
    default:
      return null;
  }
}

export function EscrowTimeline({ history, live }: { history: ChainHistory; live?: ChainListing | null }) {
  const t = useT();
  const { formatDateTime, formatIDR } = useFormatters();
  const ledger = history.source === "ledger";
  const when = (unix: number) => formatDateTime(new Date(unix * 1000).toISOString());
  const money = (units: string) => (ledger ? formatIDR(Number(units)) : usdcText(units));
  const next = upcoming(live ?? history.live, when, ledger);
  // Some events are not read yet (a slow node): the contract's live status still says where it stands.
  const settled = history.incomplete ? settledLine(history.live, ledger) : null;

  return (
    <div>
      <div className="text-xs text-neutral-gray">{ledger ? t("Public record", "Catatan publik") : t("Escrow history", "Riwayat escrow")}</div>
      <p className="text-xs text-neutral-gray mt-0.5 mb-3">
        {ledger
          ? t(
              "Written to a contract on Arbitrum at every step and read straight from it. The money itself is held by our payment provider, not by the contract.",
              "Ditulis ke kontrak di Arbitrum di setiap langkah dan dibaca langsung dari sana. Uangnya sendiri dipegang penyedia pembayaran kami, bukan oleh kontrak."
            )
          : t("Read straight from the contract on Arbitrum, not from Lummy's database.", "Dibaca langsung dari kontrak di Arbitrum, bukan dari database Lummy.")}
      </p>
      <ol className="relative border-l-2 border-dashed border-neutral-light-gray-1 ml-1.5 flex flex-col gap-4">
        {history.events.map((e, i) => {
          const line = describe(e, when, money, ledger);
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
        {settled && (
          <li className="pl-4 relative">
            <span className={`absolute -left-[7px] top-1 w-3 h-3 rounded-full border-2 border-neutral-white ${settled.dot}`} />
            <div className="text-sm text-neutral-black">{t(settled.title.en, settled.title.id)}</div>
            <div className="text-xs text-neutral-gray mt-0.5">
              {t(
                "The contract already shows this. Its transaction is still being read from the chain, and the proof link appears here in a moment.",
                "Kontrak sudah menunjukkan ini. Transaksinya masih dibaca dari chain, dan tautan buktinya sebentar lagi muncul di sini."
              )}
            </div>
          </li>
        )}
        {history.incomplete && !settled && (
          <li className="pl-4 relative">
            <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-neutral-light-gray-1 border-2 border-neutral-white" />
            <span className="text-xs text-neutral-gray">
              {t("Some steps are still being read from the chain and appear here in a moment.", "Beberapa langkah masih dibaca dari chain dan sebentar lagi muncul di sini.")}
            </span>
          </li>
        )}
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
