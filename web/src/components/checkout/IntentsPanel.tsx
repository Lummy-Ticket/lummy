"use client";

// Paying from any chain and asset through NEAR Intents, for a show abroad (lib/payments/intents.ts). The
// buyer picks what to pay with and sees a live quote. Then they name where a refund should go, and get
// an address and an amount to send, like a QRIS code for crypto. The server moves the money into the
// escrow when it has arrived. Real USDC on Arbitrum One, so only the team reaches this panel for now.
// A browser wallet can be read first (HeldAssets): what covers the order is picked, the refund address
// is filled in from it, and paying is one confirmation there instead of an address copied by hand.
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { injectedWallet, walletRefused } from "@/lib/chain/wallet";
import { previewAmount, type HeldAsset } from "@/lib/near/held";
import { depositTxUrl, sendDeposit } from "@/lib/near/send";
import { HeldAssets } from "@/components/checkout/HeldAssets";
import { Check, ExternalLink, Loader2, Shuffle } from "lucide-react";
import { isAddress } from "viem";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select-menu";
import { explorerAddress, shortAddress } from "@/lib/chain/format";
import { useFormatters, useT } from "@/lib/i18n";
import { nearQuote, openIntentPayment, paymentAction, readIntentPayment, startIntentPayment, type IntentView, type NearOptions, type NearQuote } from "@/lib/payments/client";

const POLL_MS = 4000;
const ARBITRUM_ONE = 42161;

/** The steps a payment goes through, in order. */
const STAGES = ["deposit", "swap", "escrow"] as const;

function stageOf(v: IntentView): number {
  if (v.payment.status === "paid") return 3;
  if (v.swapStatus === "SUCCESS") return 2;
  if (v.swapStatus === "PROCESSING" || v.swapStatus === "KNOWN_DEPOSIT_TX") return 1;
  return 0;
}

export function IntentsPanel({
  options,
  listingId,
  quantity,
  total,
  onPaid,
  onClose,
}: {
  options: NearOptions;
  listingId: string;
  quantity: number;
  /** Micro-USDC, as the checkout shows it. */
  total: number;
  onPaid: (orderId: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const { formatMoney } = useFormatters();
  const [assetId, setAssetId] = useState(options.assets[0]?.assetId ?? "");
  const [quote, setQuote] = useState<NearQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [refundTo, setRefundTo] = useState("");
  const [originRefund, setOriginRefund] = useState("");
  // The connected wallet and what it holds, once HeldAssets has read it.
  const [account, setAccount] = useState<string | null>(null);
  const [held, setHeld] = useState<HeldAsset[] | null>(null);
  const [view, setView] = useState<IntentView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const paid = useRef(false);

  const asset = options.assets.find((a) => a.assetId === assetId);

  useEffect(() => {
    if (view || !assetId) return;
    let live = true;
    void nearQuote(assetId, String(total))
      .then((q) => {
        if (!live) return;
        setQuote(q);
        setQuoteError(null);
      })
      .catch((e: Error) => {
        if (!live) return;
        setQuote(null);
        setQuoteError(e.message);
      });
    return () => {
      live = false;
    };
  }, [assetId, total, view]);

  // A payment left open comes back: a tab closed after paying must not become a second payment. The
  // server finishes the order either way (api/cron/intents); this only shows where it stands.
  const [resumed, setResumed] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    let live = true;
    void openIntentPayment(listingId)
      .then((r) => {
        // A payment started in this panel meanwhile is not one "started earlier".
        if (!live || !r.open || started.current) return;
        const found = r.open;
        setAssetId(found.deposit.assetId);
        setView((now) => now ?? found);
        setResumed(true);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [listingId]);

  const paymentId = view?.payment.id;
  const open = view?.payment.status === "pending";
  useEffect(() => {
    if (!paymentId || !open) return;
    const i = setInterval(() => {
      void readIntentPayment(paymentId)
        .then((v) => {
          setView(v);
          if (v.payment.status === "paid" && v.payment.orderId && !paid.current) {
            paid.current = true;
            onPaid(v.payment.orderId);
          }
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(i);
  }, [paymentId, open, onPaid]);

  useEffect(() => {
    if (!view) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [view]);

  const sameWallet = asset?.evm;
  const refundOk = isAddress(refundTo);
  const originOk = sameWallet ? refundOk : originRefund.trim().length >= 20;

  const [cancelError, setCancelError] = useState<string | null>(null);
  const cancel = async () => {
    if (view && view.payment.status === "pending") {
      try {
        await paymentAction(view.payment.id, "cancel");
      } catch (e) {
        // Refused because money is already on its way: the hold stays, and so does this panel.
        if ((e as { status?: number }).status === 409) {
          setCancelError(e instanceof Error ? e.message : String(e));
          return;
        }
      }
    }
    onClose();
  };

  // On an EVM chain the buyer's own wallet can pay the deposit: the exact asset and amount, nothing copied.
  const [sent, setSent] = useState<{ busy: boolean; hash?: string; error?: string }>({ busy: false });
  // Paying through the wallet: the address and its QR step aside, so the same deposit is not sent twice.
  const [viaWallet, setViaWallet] = useState(false);
  const wallet = injectedWallet();
  const payable = !!view && !!asset?.chainId && asset.assetId === view.deposit.assetId;
  const payDeposit = async (v: IntentView) => {
    if (!wallet || !asset?.chainId) return;
    setViaWallet(true);
    setSent({ busy: true });
    try {
      const hash = await sendDeposit(wallet, { chainId: asset.chainId, to: v.deposit.address, amount: v.deposit.amount, units: v.deposit.units, decimals: asset.decimals, token: asset.contract });
      setSent({ busy: false, hash });
    } catch (e) {
      const said = walletRefused(e) ? t("You cancelled it in your wallet.", "Kamu membatalkannya di wallet.") : e instanceof Error ? e.message.split("\n")[0] : String(e);
      setSent({ busy: false, error: said });
    }
  };

  // With a connected wallet that holds enough of the chosen asset, one press holds the seats and asks
  // the wallet to send the deposit: the buyer confirms once there.
  const mine = held?.find((h) => h.assetId === assetId);
  const direct = !!wallet && !!account && !!asset?.chainId && !!mine?.enough && mine.gas;

  const start = async (pay: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const v = await startIntentPayment({ listingId, quantity, originAsset: assetId, refundTo, originRefund: sameWallet ? refundTo : originRefund.trim() });
      started.current = true;
      setView(v);
      if (pay && asset?.assetId === v.deposit.assetId) void payDeposit(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <div className="flex items-center justify-center gap-2 font-semibold text-lg text-neutral-black">
      <Shuffle className="w-5 h-5 text-lummy-500" /> {t("Pay from any chain", "Bayar dari chain mana pun")}
    </div>
  );

  if (!view) {
    return (
      <div data-intents-panel className="flex flex-col gap-4 p-6">
        {header}
        <p className="text-sm text-neutral-gray text-center">
          {t(
            "NEAR Intents turns what you hold into the USDC this order needs, and the money lands in the escrow, not with the seller.",
            "NEAR Intents mengubah aset yang kamu punya menjadi USDC yang dibutuhkan pesanan ini, dan uangnya masuk ke escrow, bukan ke penjual."
          )}
        </p>
        <HeldAssets
          assets={options.assets}
          amount={String(total)}
          selected={assetId}
          onPick={setAssetId}
          onRead={(who, found) => {
            setAccount(who);
            setHeld(found);
            setRefundTo((now) => now || who);
          }}
        />
        <label className="flex flex-col gap-1.5 text-xs text-neutral-gray">
          {t("Pay with", "Bayar dengan")}
          <NativeSelect data-intents-asset value={assetId} onChange={(e) => setAssetId(e.target.value)}>
            {options.assets.map((a) => (
              <option key={a.assetId} value={a.assetId}>{`${a.symbol} on ${a.chainLabel}`}</option>
            ))}
          </NativeSelect>
        </label>

        <div data-intents-quote className="rounded-2xl bg-secondary-blue-extra p-4 text-sm text-neutral-black">
          {quote ? (
            <>
              <div className="flex justify-between gap-3">
                <span className="text-neutral-gray">{t("You send", "Kamu kirim")}</span>
                <span className="font-semibold tabular-nums">{`${previewAmount(quote.amountIn)} ${quote.symbol}`}</span>
              </div>
              <div className="flex justify-between gap-3 mt-1">
                <span className="text-neutral-gray">{t("Reaches the escrow", "Masuk ke escrow")}</span>
                <span className="font-semibold tabular-nums">{formatMoney(total, "USDC")}</span>
              </div>
              <p className="text-xs text-neutral-gray mt-2">
                {t(
                  // T4, 10 Nov 2026: 0.096 USDC unused on Ethereum stayed with NEAR Intents, whose fee to send it back was 0.30 USDC.
                  `Includes about 1% room for the price to move. What is not used comes back to you, unless sending it back on that chain costs more than it is worth, as on Ethereum.${quote.etaSeconds ? ` Usually about ${quote.etaSeconds} seconds.` : ""}`,
                  `Sudah termasuk ruang sekitar 1% untuk pergerakan harga. Yang tidak terpakai kembali ke kamu, kecuali biaya mengirimnya kembali di chain itu lebih besar dari nilainya, seperti di Ethereum.${quote.etaSeconds ? ` Biasanya sekitar ${quote.etaSeconds} detik.` : ""}`
                )}
              </p>
            </>
          ) : quoteError ? (
            <span className="text-secondary-pink-dark text-xs">{quoteError}</span>
          ) : (
            <span className="flex items-center gap-2 text-neutral-gray text-xs">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("Asking for a live quote...", "Meminta quote live...")}
            </span>
          )}
        </div>

        <label className="flex flex-col gap-1.5 text-xs text-neutral-gray">
          {t("Your EVM address for refunds", "Alamat EVM-mu untuk refund")}
          <input
            data-intents-refund
            value={refundTo}
            onChange={(e) => setRefundTo(e.target.value.trim())}
            placeholder="0x..."
            className="w-full rounded-xl border border-neutral-light-gray-1 px-3 py-2 font-mono text-xs text-neutral-black"
          />
          {account && refundTo.toLowerCase() === account.toLowerCase() && (
            <span data-intents-refund-mine className="text-secondary-green-dark">{t("Filled in from your connected wallet.", "Diisi dari wallet yang terhubung.")}</span>
          )}
          <span>
            {t(
              "Locked on chain before you pay: if a claim is upheld, the refund can only go here, as USDC on Arbitrum One.",
              "Dikunci di chain sebelum kamu bayar: kalau klaim dikabulkan, refund hanya bisa masuk ke sini, sebagai USDC di Arbitrum One."
            )}
          </span>
        </label>

        {!sameWallet && (
          <label className="flex flex-col gap-1.5 text-xs text-neutral-gray">
            {t(`Your wallet on ${asset?.chainLabel ?? "that chain"}`, `Wallet-mu di ${asset?.chainLabel ?? "chain itu"}`)}
            <input
              data-intents-origin
              value={originRefund}
              onChange={(e) => setOriginRefund(e.target.value)}
              className="w-full rounded-xl border border-neutral-light-gray-1 px-3 py-2 font-mono text-xs text-neutral-black"
            />
            <span>{t("If the swap cannot finish, NEAR Intents returns your deposit here.", "Kalau swap-nya tidak bisa selesai, NEAR Intents mengembalikan depositmu ke sini.")}</span>
          </label>
        )}

        <div className="rounded-2xl bg-secondary-orange-soft p-3 text-xs text-secondary-orange-dark">
          {t(
            "Real USDC on Arbitrum One, in an unaudited contract capped at a small amount. Open to the Lummy team only during NEAR HACKATHON.",
            "USDC sungguhan di Arbitrum One, di kontrak yang belum diaudit dan dibatasi nominal kecil. Khusus tim Lummy selama NEAR HACKATHON."
          )}
        </div>

        {error && <p data-intents-error className="rounded-2xl bg-secondary-pink-soft p-3 text-sm text-secondary-pink-dark">{error}</p>}

        <div className="flex w-full flex-col gap-2">
          <Button.Primary data-intents-start wrapperClass="w-full" className="w-full" disabled={busy || !quote || !refundOk || !originOk} data-intents-direct={direct} onClick={() => void start(direct)}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {direct && asset ? t(`Pay from my wallet: ${asset.symbol} on ${asset.chainLabel}`, `Bayar dari wallet-ku: ${asset.symbol} di ${asset.chainLabel}`) : t("Get the address to pay", "Ambil alamat pembayaran")}
          </Button.Primary>
          {direct && (
            <>
              <p className="text-[11px] text-center text-neutral-gray">{t("You confirm once in your wallet. Nothing is copied by hand.", "Kamu konfirmasi sekali di wallet. Tidak ada yang disalin manual.")}</p>
              <button type="button" data-intents-manual disabled={busy || !quote || !refundOk || !originOk} onClick={() => void start(false)} className="text-sm text-primary-navy font-medium hover:opacity-80 cursor-pointer disabled:opacity-50">
                {t("Pay by address or QR instead", "Bayar lewat alamat atau QR saja")}
              </button>
            </>
          )}
          <button type="button" onClick={onClose} className="text-sm text-neutral-gray hover:text-primary-navy cursor-pointer">
            {t("Close", "Tutup")}
          </button>
        </div>
      </div>
    );
  }

  const stage = stageOf(view);
  const left = Math.max(0, Math.floor((Date.parse(view.payment.expiresAt) - now) / 1000));
  const clock = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
  const closed = view.payment.status !== "pending" && view.payment.status !== "paid";
  const labels: Record<(typeof STAGES)[number], { en: string; id: string }> = {
    deposit: { en: `Waiting for your ${view.deposit.symbol} on ${view.deposit.chainLabel}`, id: `Menunggu ${view.deposit.symbol}-mu di ${view.deposit.chainLabel}` },
    swap: { en: "NEAR Intents is delivering USDC to Arbitrum", id: "NEAR Intents mengantar USDC ke Arbitrum" },
    escrow: { en: "Locking the money in the escrow, gas paid by Lummy", id: "Mengunci uangnya di escrow, gas dibayar Lummy" },
  };

  return (
    <div data-intents-panel data-intents-status={view.swapStatus} className="flex flex-col gap-4 p-6">
      {header}
      <div className="text-center">
        <div className="tabular-nums font-bold text-xl text-neutral-black">{`${view.deposit.amount} ${view.deposit.symbol}`}</div>
        <div className="text-xs text-neutral-gray mt-0.5">
          {closed ? t("This payment is closed.", "Pembayaran ini sudah ditutup.") : t(`on ${view.deposit.chainLabel} · seats held for ${clock}`, `di ${view.deposit.chainLabel} · kursi ditahan ${clock}`)}
        </div>
      </div>

      {!closed && stage === 0 && viaWallet && (
        <div data-intents-via-wallet className="rounded-2xl bg-secondary-blue-extra p-4 flex flex-col items-center gap-2 text-center">
          {sent.hash ? (
            <>
              <span className="w-8 h-8 rounded-full bg-secondary-green-dark text-neutral-white grid place-items-center">
                <Check className="w-4 h-4" />
              </span>
              <p data-intents-sent className="text-sm font-semibold text-secondary-green-dark">{t("Sent from your wallet", "Terkirim dari wallet-mu")}</p>
              <p className="text-xs text-neutral-gray">
                {t(
                  "Do not send it again. NEAR Intents usually sees it within a minute. You can close this page: the order is finished without it, and an email tells you when the money is locked.",
                  "Jangan kirim lagi. NEAR Intents biasanya melihatnya dalam semenit. Halaman ini boleh ditutup: pesanannya tetap diselesaikan, dan email mengabarimu saat uangnya terkunci."
                )}
              </p>
              {asset?.chainId && depositTxUrl(asset.chainId, sent.hash) && (
                <a href={depositTxUrl(asset.chainId, sent.hash) ?? undefined} target="_blank" rel="noreferrer" className="text-xs text-primary-navy font-medium inline-flex items-center gap-1">
                  {t("See the transaction", "Lihat transaksinya")} <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </>
          ) : sent.busy ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin text-lummy-500" />
              <p className="text-sm font-semibold text-neutral-black">{t("Confirm it in your wallet", "Konfirmasi di wallet-mu")}</p>
              <p className="text-xs text-neutral-gray">
                {t(
                  `${view.deposit.amount} ${view.deposit.symbol} on ${view.deposit.chainLabel}, to this order's deposit address. Your wallet may first ask to switch network.`,
                  `${view.deposit.amount} ${view.deposit.symbol} di ${view.deposit.chainLabel}, ke alamat deposit pesanan ini. Wallet-mu mungkin minta ganti jaringan dulu.`
                )}
              </p>
            </>
          ) : (
            <>
              {sent.error && <p data-intents-wallet-error className="text-xs text-secondary-pink-dark">{sent.error}</p>}
              <Button.Primary data-intents-wallet wrapperClass="w-full" className="w-full" onClick={() => void payDeposit(view)}>
                {t(`Send ${view.deposit.amount} ${view.deposit.symbol} from my wallet`, `Kirim ${view.deposit.amount} ${view.deposit.symbol} dari wallet-ku`)}
              </Button.Primary>
              <button type="button" data-intents-manual onClick={() => setViaWallet(false)} className="text-sm text-primary-navy font-medium hover:opacity-80 cursor-pointer">
                {t("Pay by address or QR instead", "Bayar lewat alamat atau QR saja")}
              </button>
            </>
          )}
        </div>
      )}
      {!closed && stage === 0 && !viaWallet && (
        <>
          {resumed && (
            <p data-intents-resumed className="rounded-2xl bg-secondary-orange-soft p-3 text-xs text-secondary-orange-dark">
              {t(
                "You started this payment earlier. If you have already sent it, do not send it again: it shows up here within a minute or two, and the order is finished even if you close this page.",
                "Kamu memulai pembayaran ini tadi. Kalau sudah kamu kirim, jangan kirim lagi: statusnya muncul di sini dalam satu dua menit, dan pesanannya tetap diselesaikan walau halaman ini ditutup."
              )}
            </p>
          )}
          <div className="flex justify-center">
            <QRCodeSVG value={view.deposit.address} size={176} marginSize={1} level="M" aria-label={t("Address to pay", "Alamat pembayaran")} />
          </div>
          <p data-intents-deposit className="rounded-2xl bg-secondary-blue-extra p-3 font-mono text-xs break-all text-neutral-black text-center">{view.deposit.address}</p>
          {view.deposit.memo && (
            <p className="text-xs text-center text-neutral-black">
              {t("Memo", "Memo")}: <span className="font-mono">{view.deposit.memo}</span>
            </p>
          )}
          <p className="text-xs text-center text-neutral-gray">
            {t(
              `Send exactly ${view.deposit.amount} ${view.deposit.symbol} on ${view.deposit.chainLabel} to this address, once, from any wallet or exchange.`,
              `Kirim persis ${view.deposit.amount} ${view.deposit.symbol} di ${view.deposit.chainLabel} ke alamat ini, sekali, dari wallet atau exchange mana pun.`
            )}
          </p>
          {payable && wallet && (
            <button type="button" data-intents-wallet onClick={() => void payDeposit(view)} className="text-sm text-primary-navy font-medium hover:opacity-80 cursor-pointer">
              {t("Or send it from my browser wallet", "Atau kirim dari wallet di browser-ku")}
            </button>
          )}
        </>
      )}

      <ol className="flex flex-col gap-2 text-sm">
        {STAGES.map((s, i) => {
          const isDone = stage > i;
          const isNow = stage === i && !closed;
          return (
            <li key={s} className={`flex items-center gap-2 ${isDone || isNow ? "text-neutral-black" : "text-neutral-gray"}`}>
              <span className={`w-5 h-5 shrink-0 rounded-full grid place-items-center text-[11px] border ${isDone ? "bg-secondary-green-dark border-secondary-green-dark text-neutral-white" : "border-neutral-light-gray-1"}`}>
                {isDone ? <Check className="w-3 h-3" /> : isNow ? <Loader2 className="w-3 h-3 animate-spin text-lummy-500" /> : i + 1}
              </span>
              {t(labels[s].en, labels[s].id)}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-1 text-xs text-neutral-gray">
        <a href={view.swapUrl} target="_blank" rel="noreferrer" className="text-primary-navy font-medium inline-flex items-center gap-1">
          {t("Follow the swap on NEAR Intents", "Pantau swap di NEAR Intents")} <ExternalLink className="w-3 h-3" />
        </a>
        <a href={explorerAddress(ARBITRUM_ONE, view.receiver) ?? undefined} target="_blank" rel="noreferrer" className="text-primary-navy font-medium inline-flex items-center gap-1">
          {t(`This order's receiver: ${shortAddress(view.receiver)}`, `Kontrak penerima pesanan ini: ${shortAddress(view.receiver)}`)} <ExternalLink className="w-3 h-3" />
        </a>
        <span>{t(`Refunds can only go to ${shortAddress(view.refundTo)}.`, `Refund hanya bisa ke ${shortAddress(view.refundTo)}.`)}</span>
        <details data-intents-terms>
          <summary className="cursor-pointer text-primary-navy font-medium">{t("This order's terms, on chain", "Syarat pesanan ini, di chain")}</summary>
          <p className="mt-1">
            {t(
              "Anyone can call deploy with these on the factory, then sweep on the receiver: past the deadline the money goes to the refund address, with no help from Lummy.",
              "Siapa pun bisa memanggil deploy dengan data ini di factory, lalu sweep di kontrak penerima: lewat batas waktu, uangnya masuk ke alamat refund, tanpa bantuan Lummy."
            )}
          </p>
          <pre className="mt-1 overflow-x-auto rounded-xl bg-secondary-blue-extra p-2 font-mono text-[10px] text-neutral-black">{JSON.stringify(view.terms, null, 2)}</pre>
        </details>
      </div>

      {closed && (
        <p className="rounded-2xl bg-secondary-orange-soft p-3 text-xs text-secondary-orange-dark">
          {t(
            "Nothing was bought. A deposit that still arrives goes back: NEAR Intents returns one it could not swap, and money that reached the receiver can only go to your refund address.",
            "Tidak ada yang terbeli. Deposit yang masih masuk tetap kembali: NEAR Intents mengembalikan yang tidak bisa di-swap, dan uang yang sudah sampai di kontrak penerima hanya bisa ke alamat refund-mu."
          )}
        </p>
      )}

      {cancelError && <p data-intents-cancel-error className="rounded-2xl bg-secondary-orange-soft p-3 text-xs text-secondary-orange-dark">{cancelError}</p>}
      <button type="button" data-intents-cancel disabled={!closed && (stage > 0 || sent.busy || !!sent.hash)} onClick={() => void cancel()} className="text-sm text-neutral-gray hover:text-primary-navy disabled:opacity-50 cursor-pointer">
        {closed ? t("Close", "Tutup") : t("Cancel and release the seats", "Batalkan dan lepas kursinya")}
      </button>
    </div>
  );
}
