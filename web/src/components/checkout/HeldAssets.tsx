"use client";

// The buyer's own wallet, read before they choose what to pay with: which of the assets NEAR Intents
// takes it holds, and which of those cover this order. The one that does is picked for them, so the
// next step is one confirmation in the wallet and nothing is copied by hand (lib/near/held.ts says
// why). Reading moves nothing; without a browser wallet this shows nothing and the list below stays.
import { useState } from "react";
import { Check, Loader2, Wallet as WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { connectWallet, injectedWallet, shortAddress, walletRefused } from "@/lib/chain/wallet";
import { useT } from "@/lib/i18n";
import { orderHeld, pickHeld, shortAmount, type HeldAsset } from "@/lib/near/held";
import { nearHeld } from "@/lib/payments/client";

type Asset = { assetId: string; symbol: string; chain: string; chainLabel: string; chainId: number | null };

/** Rows shown before "Show more". */
const SHOWN = 3;

export function HeldAssets({
  assets,
  amount,
  selected,
  onPick,
  onRead,
}: {
  assets: Asset[];
  /** Micro-USDC. */
  amount: string;
  selected: string;
  onPick: (assetId: string) => void;
  /** The connected account and what it holds, once read. */
  onRead?: (account: string, held: HeldAsset[]) => void;
}) {
  const t = useT();
  const [account, setAccount] = useState<string | null>(null);
  const [held, setHeld] = useState<HeldAsset[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const wallet = injectedWallet();
  if (!wallet) return null;

  const read = async () => {
    setBusy(true);
    setError(null);
    try {
      const who = await connectWallet(wallet);
      setAccount(who);
      const { held: found } = await nearHeld(who, amount);
      setHeld(found);
      onRead?.(who, found);
      const pick = pickHeld(assets, found);
      if (pick) onPick(pick);
    } catch (e) {
      setError(walletRefused(e) ? t("You declined the connection in your wallet.", "Kamu menolak koneksinya di wallet.") : t("Your wallet's balances could not be read. You can still choose below.", "Saldo wallet-mu tidak bisa dibaca. Kamu tetap bisa memilih di bawah."));
    } finally {
      setBusy(false);
    }
  };

  if (!account || !held) {
    return (
      <div data-held className="flex flex-col gap-1.5">
        <Button.Secondary data-held-connect wrapperClass="w-full" className="w-full" disabled={busy} onClick={() => void read()}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <WalletIcon className="w-4 h-4" />}
          {busy ? t("Reading what your wallet holds...", "Membaca isi wallet-mu...") : t("Connect a wallet to see what can pay", "Hubungkan wallet untuk lihat yang bisa dipakai")}
        </Button.Secondary>
        <p className="text-[11px] text-center text-neutral-gray">
          {t("Lummy only reads balances on six chains. Nothing moves until you confirm it in your wallet.", "Lummy hanya membaca saldo di enam chain. Tidak ada yang berpindah sebelum kamu konfirmasi di wallet.")}
        </p>
        {error && <p data-held-error className="text-xs text-center text-secondary-pink-dark">{error}</p>}
      </div>
    );
  }

  // What can pay comes first. A wallet with much in it would fill the panel, so the rest folds away.
  const rows = orderHeld(assets, held).flatMap((a) => {
    const h = held.find((x) => x.assetId === a.assetId);
    return h && h.balance !== null && h.balance !== "0" ? [{ a, h }] : [];
  });
  const unread = assets.filter((a) => a.chainId !== null && held.find((x) => x.assetId === a.assetId)?.balance === null);
  const payable = rows.some((r) => r.h.enough && r.h.gas);

  return (
    <div data-held data-held-account={account} className="flex flex-col gap-2 rounded-2xl border border-neutral-light-gray-1 p-3">
      <div className="flex items-center justify-between gap-2 text-xs text-neutral-gray">
        <span className="inline-flex items-center gap-1.5">
          <WalletIcon className="w-3.5 h-3.5 text-primary-navy" /> {t("Your wallet", "Wallet-mu")} <span className="font-mono text-neutral-black">{shortAddress(account)}</span>
        </span>
        <button type="button" disabled={busy} onClick={() => void read()} className="text-primary-navy font-medium hover:opacity-80 cursor-pointer disabled:opacity-50">
          {busy ? t("Reading...", "Membaca...") : t("Read again", "Baca lagi")}
        </button>
      </div>
      {rows.length === 0 ? (
        <p data-held-none className="text-sm text-neutral-black">
          {t("This wallet holds none of the assets NEAR Intents takes here. You can still pay from another wallet or an exchange below.", "Wallet ini tidak memegang aset yang diterima NEAR Intents di sini. Kamu tetap bisa bayar dari wallet lain atau exchange di bawah.")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {(all ? rows : rows.slice(0, SHOWN)).map(({ a, h }) => {
            const ok = h.enough && h.gas;
            const on = selected === a.assetId;
            const state = ok ? t("Enough", "Cukup") : !h.enough ? (h.needs ? t(`Needs ${shortAmount(h.needs)}`, `Butuh ${shortAmount(h.needs)}`) : t("No quote", "Tanpa quote")) : t("No gas on this chain", "Tanpa gas di chain ini");
            return (
              <li key={a.assetId}>
                <button
                  type="button"
                  data-held-row={a.assetId}
                  data-held-ok={ok}
                  aria-pressed={on && ok}
                  disabled={!ok}
                  onClick={() => onPick(a.assetId)}
                  className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm text-left transition ${on && ok ? "border-primary-navy bg-secondary-blue-extra" : "border-neutral-light-gray-1"} ${ok ? "cursor-pointer hover:border-primary-navy" : "opacity-60"}`}
                >
                  <span className="flex flex-col">
                    <span className="font-semibold text-neutral-black">{`${a.symbol} on ${a.chainLabel}`}</span>
                    <span className="text-xs text-neutral-gray tabular-nums">{t(`You hold ${shortAmount(h.balance ?? "0")}`, `Kamu punya ${shortAmount(h.balance ?? "0")}`)}</span>
                  </span>
                  <span className={`shrink-0 inline-flex items-center gap-1 text-xs font-medium ${ok ? "text-secondary-green-dark" : "text-secondary-orange-dark"}`}>
                    {on && ok && <Check className="w-3.5 h-3.5" />}
                    {state}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > SHOWN && (
        <button type="button" data-held-more onClick={() => setAll(!all)} className="text-xs text-primary-navy font-medium hover:opacity-80 cursor-pointer self-start">
          {all ? t("Show fewer", "Tampilkan lebih sedikit") : t(`Show ${rows.length - SHOWN} more`, `Tampilkan ${rows.length - SHOWN} lagi`)}
        </button>
      )}
      {rows.length > 0 && !payable && (
        <p data-held-short className="text-xs text-neutral-gray">
          {t("Nothing here covers this order yet. Top one up, or pay from another wallet or an exchange below.", "Belum ada yang cukup untuk pesanan ini. Isi salah satunya, atau bayar dari wallet lain atau exchange di bawah.")}
        </p>
      )}
      {unread.length > 0 && (
        <p data-held-unread className="text-[11px] text-neutral-gray">
          {t(`Not read just now: ${[...new Set(unread.map((a) => a.chainLabel))].join(", ")}.`, `Belum terbaca saat ini: ${[...new Set(unread.map((a) => a.chainLabel))].join(", ")}.`)}
        </p>
      )}
      {error && <p data-held-error className="text-xs text-secondary-pink-dark">{error}</p>}
    </div>
  );
}
