"use client";

// The USDC step of checkout, for a show abroad (tasks/founder-house-usdc.md). The buyer's own wallet
// connects and signs two messages: an authorisation for exactly this much USDC to go into the escrow,
// and the purchase itself. Neither is a transaction, so the wallet needs no ETH: the server checks
// both signatures and sends the transactions, paying the gas. The seats are held from the first
// signature request until the hold runs out; giving up gives them back.
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Wallet } from "lucide-react";
import type { Address } from "viem";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/lib/access";
import { connectWallet, ensureChain, injectedWallet, shortAddress, signTyped, walletRefused } from "@/lib/chain/wallet";
import { useFormatters, useT } from "@/lib/i18n";
import { OrderError } from "@/lib/orders/client";
import { paymentAction, startUsdcPayment, submitUsdcPayment, type UsdcStart } from "@/lib/payments/client";

/** Circle's faucet hands out testnet USDC, Arbitrum Sepolia included. */
export const USDC_FAUCET = "https://faucet.circle.com";

type Step = "idle" | "connecting" | "holding" | "auth" | "fund" | "locking";
const ORDER: Step[] = ["auth", "fund", "locking"];

export function UsdcPanel({
  listingId,
  quantity,
  total,
  onPaid,
  onClose,
}: {
  listingId: string;
  quantity: number;
  /** Micro-USDC, as the checkout shows it. */
  total: number;
  onPaid: (orderId: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const { formatMoney } = useFormatters();
  // Read after mounting: the server has no window, and the first paint must match it.
  const mounted = useHydrated();
  const hasWallet = mounted ? !!injectedWallet() : null;
  const [account, setAccount] = useState<Address | null>(null);
  const [hold, setHold] = useState<UsdcStart | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lowBalance, setLowBalance] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const done = useRef(false);

  useEffect(() => {
    if (!hold) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [hold]);

  const left = hold ? Math.max(0, Math.floor((Date.parse(hold.payment.expiresAt) - now) / 1000)) : 0;
  const clock = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
  const busy = step !== "idle";

  const pay = async () => {
    const w = injectedWallet();
    if (!w || done.current) return;
    setError(null);
    setLowBalance(false);
    try {
      // The first press only connects: the buyer sees which wallet pays before anything is held.
      if (!account) {
        setStep("connecting");
        setAccount(await connectWallet(w));
        setStep("idle");
        return;
      }
      const who = account;
      // A hold that ran out, or one for another account in the wallet, is replaced (the server
      // gives the old seats back first).
      let h = hold;
      if (!h || Date.parse(h.payment.expiresAt) <= Date.now() || h.wallet.toLowerCase() !== who.toLowerCase()) {
        setStep("holding");
        h = await startUsdcPayment(listingId, quantity, who);
        setHold(h);
      }
      await ensureChain(w, h.chainId);
      setStep("auth");
      const authSig = await signTyped(w, who, h.auth);
      setStep("fund");
      const fundSig = await signTyped(w, who, h.fund);
      setStep("locking");
      const { orderId } = await submitUsdcPayment(h.payment.id, authSig, fundSig);
      done.current = true;
      onPaid(orderId);
    } catch (e) {
      setStep("idle");
      if (e instanceof OrderError && e.status === 402) setLowBalance(true);
      setError(
        walletRefused(e)
          ? t("You declined in the wallet. Press the button to try again.", "Kamu menolak di wallet. Tekan tombolnya untuk mencoba lagi.")
          : e instanceof Error
            ? e.message
            : String(e)
      );
    }
  };

  const cancel = async () => {
    if (hold) {
      setCancelling(true);
      await paymentAction(hold.payment.id, "cancel").catch(() => null);
      setCancelling(false);
    }
    onClose();
  };

  const doing: Record<Step, { en: string; id: string } | null> = {
    idle: null,
    connecting: { en: "Connect your wallet in its window...", id: "Hubungkan wallet di jendelanya..." },
    holding: { en: "Holding your seats...", id: "Menahan kursimu..." },
    auth: { en: "Signature 1 of 2 in your wallet: allow this USDC into the escrow.", id: "Tanda tangan 1 dari 2 di wallet: izinkan USDC ini masuk ke escrow." },
    fund: { en: "Signature 2 of 2 in your wallet: the purchase itself.", id: "Tanda tangan 2 dari 2 di wallet: pembeliannya." },
    locking: {
      en: "Locking the USDC in the escrow on Arbitrum. Lummy pays the gas; this takes about 20 seconds.",
      id: "Mengunci USDC di escrow di Arbitrum. Gas dibayar Lummy; biasanya sekitar 20 detik.",
    },
  };
  const steps = [
    { key: "auth" as const, en: "Allow the USDC into the escrow", id: "Izinkan USDC masuk ke escrow" },
    { key: "fund" as const, en: "Confirm the purchase", id: "Konfirmasi pembelian" },
    { key: "locking" as const, en: "Money locked on Arbitrum, gas paid by Lummy", id: "Dana terkunci di Arbitrum, gas dibayar Lummy" },
  ];
  const reached = ORDER.indexOf(step);

  return (
    <div data-usdc-panel data-usdc-step={step} className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-center gap-2 font-semibold text-lg text-neutral-black">
        <Wallet className="w-5 h-5 text-lummy-500" /> {t("Pay with USDC", "Bayar dengan USDC")}
      </div>
      <div className="text-center">
        <div className="tabular-nums font-bold text-xl text-neutral-black">{formatMoney(total, "USDC")}</div>
        <div className="text-xs text-neutral-gray mt-0.5">
          {hold && left > 0
            ? t(`Seats held for ${clock}`, `Kursi ditahan ${clock}`)
            : t("Arbitrum Sepolia, from your own wallet", "Arbitrum Sepolia, dari wallet-mu sendiri")}
        </div>
      </div>

      {hasWallet === false && (
        <p data-usdc-no-wallet className="rounded-2xl bg-secondary-blue-extra p-3 text-sm text-neutral-black">
          {t(
            "This browser has no wallet. Install MetaMask or Rabby, or open this page in your wallet app's browser.",
            "Browser ini belum punya wallet. Pasang MetaMask atau Rabby, atau buka halaman ini dari browser di aplikasi wallet."
          )}{" "}
          <a href="https://metamask.io/download/" target="_blank" rel="noreferrer" className="text-primary-navy font-medium">
            MetaMask
          </a>
        </p>
      )}

      {account && (
        <p className="text-xs text-neutral-gray text-center">
          {t("Wallet", "Wallet")} <span data-usdc-wallet className="font-mono text-neutral-black">{shortAddress(account)}</span>
        </p>
      )}

      <ol className="flex flex-col gap-2 text-sm">
        {steps.map((s, i) => {
          const isDone = reached > i;
          const isNow = reached === i;
          return (
            <li key={s.key} className={`flex items-center gap-2 ${isDone || isNow ? "text-neutral-black" : "text-neutral-gray"}`}>
              <span className={`w-5 h-5 shrink-0 rounded-full grid place-items-center text-[11px] border ${isDone ? "bg-secondary-green-dark border-secondary-green-dark text-neutral-white" : "border-neutral-light-gray-1"}`}>
                {isDone ? <Check className="w-3 h-3" /> : isNow ? <Loader2 className="w-3 h-3 animate-spin text-lummy-500" /> : i + 1}
              </span>
              {t(s.en, s.id)}
            </li>
          );
        })}
      </ol>

      {doing[step] && (
        <p data-usdc-doing className="flex items-start gap-2 text-sm text-neutral-gray">
          <Loader2 className="w-4 h-4 animate-spin text-lummy-500 shrink-0 mt-0.5" />
          {t(doing[step]!.en, doing[step]!.id)}
        </p>
      )}

      <div className="rounded-2xl bg-secondary-orange-soft p-3 text-xs text-secondary-orange-dark">
        {t(
          "Testnet: test USDC on Arbitrum Sepolia, not real money. Two signatures, no transaction from your wallet, so it needs no ETH.",
          "Testnet: USDC uji di Arbitrum Sepolia, bukan uang sungguhan. Dua tanda tangan, tanpa transaksi dari wallet-mu, jadi tidak perlu ETH."
        )}
      </div>

      {error && (
        <p data-usdc-error className="rounded-2xl bg-secondary-pink-soft p-3 text-sm text-secondary-pink-dark">
          {error}
          {lowBalance && (
            <>
              {" "}
              <a href={USDC_FAUCET} target="_blank" rel="noreferrer" className="font-medium underline">
                {t("Get test USDC from Circle's faucet", "Ambil USDC uji dari faucet Circle")}
              </a>{" "}
              {t("(choose Arbitrum Sepolia).", "(pilih Arbitrum Sepolia).")}
            </>
          )}
        </p>
      )}

      <div className="flex w-full flex-col gap-2">
        <Button.Primary data-usdc-pay wrapperClass="w-full" className="w-full" disabled={busy || cancelling || hasWallet !== true} onClick={() => void pay()}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {account ? t("Sign and pay", "Tanda tangani dan bayar") : t("Connect wallet", "Hubungkan wallet")}
        </Button.Primary>
        <button
          data-usdc-cancel
          type="button"
          disabled={(busy && step !== "auth" && step !== "fund") || cancelling}
          onClick={() => void cancel()}
          className="text-sm text-neutral-gray hover:text-primary-navy disabled:opacity-50 cursor-pointer"
        >
          {cancelling ? t("Cancelling...", "Membatalkan...") : hold ? t("Cancel and release the seats", "Batalkan dan lepas kursinya") : t("Close", "Tutup")}
        </button>
      </div>
    </div>
  );
}
