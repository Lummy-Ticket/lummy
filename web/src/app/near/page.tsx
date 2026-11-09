"use client";

// What Lummy built for NEAR HACKATHON, for anyone to try without paying: a live quote from NEAR Intents,
// and the private ticket check on a made-up ticket, with a receipt that NEAR's own Verification Center
// checks. It says plainly what is not open yet. The real money runs on the team's own account.
import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, ShieldCheck, Shuffle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select-menu";
import { explorerAddress, explorerTx, shortAddress } from "@/lib/chain/format";
import { useT } from "@/lib/i18n";
import { nearQuote, useNearOptions, type NearQuote } from "@/lib/payments/client";

/** A Binance Blockchain Week ticket on Lummy, in micro-USDC: the listing the demo payment bought. */
const DEMO_PRICE = "9500000";
const ARBITRUM_ONE = 42161;
/** Payments made for the demo, as they happen: what each did, and its transaction on Arbitrum One. */
const DEMO_TXS: { label: string; tx: string }[] = [];
/** The made-up tickets in lib/near/samples.ts. */
const TICKETS = [
  { id: "conference", en: "Conference pass, Bangkok", idn: "Tiket konferensi, Bangkok" },
  { id: "concert", en: "Concert ticket, Jakarta", idn: "Tiket konser, Jakarta" },
];

type Receipt = {
  completionId: string;
  model: string;
  signatureKind: string | null;
  signingAlgo: string | null;
  signingAddress: string | null;
  signedText: string | null;
  signature: string | null;
  requestHash: string;
  responseHash: string;
  verified: boolean;
  attested: boolean;
  problem?: string;
  verifiedAt: string;
};
type Check = {
  facts: { eventTitle: string | null; date: string | null; venue: string | null; tierPrinted: string | null; seat: string | null; printedPrice: number | null; quantity: number | null };
  model: string;
  ms: number;
  receipt: Receipt | null;
  verifyUrl: string | null;
};

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const json = (await r.json().catch(() => ({}))) as T & { error?: string; error_en?: string };
  if (!r.ok) throw new Error(json.error_en ?? json.error ?? `HTTP ${r.status}`);
  return json;
}

function Fact({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-neutral-gray">{label}</span>
      <span className="text-neutral-black text-right">{value ?? "-"}</span>
    </div>
  );
}

export default function NearPage() {
  const t = useT();
  const options = useNearOptions();

  const [assetId, setAssetId] = useState("");
  const [quote, setQuote] = useState<NearQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const asset = assetId || options?.assets[0]?.assetId || "";
  useEffect(() => {
    if (!asset) return;
    let live = true;
    void nearQuote(asset, DEMO_PRICE)
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
  }, [asset]);

  const [sample, setSample] = useState(TICKETS[0].id);
  const [check, setCheck] = useState<Check | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [tampered, setTampered] = useState<{ ok: boolean; problem?: string } | null>(null);

  const runCheck = async () => {
    setChecking(true);
    setCheckError(null);
    setCheck(null);
    setTampered(null);
    try {
      setCheck(await postJson<Check>("/api/near/ticket-check", { sample }));
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  /** One character of the response hash changed, and the same check runs again on the server. */
  const tamper = async () => {
    const r = check?.receipt;
    if (!r?.signedText) return;
    const last = r.responseHash.slice(-1) === "0" ? "1" : "0";
    const responseHash = r.responseHash.slice(0, -1) + last;
    setTampered(await postJson<{ ok: boolean; problem?: string }>("/api/near/ticket-check", { receipt: { ...r, responseHash } }).catch((e: Error) => ({ ok: false, problem: e.message })));
  };

  return (
    <div className="max-w-3xl mx-auto px-5 pt-28 pb-16 flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <span className="text-xs font-semibold text-lummy-500">{t("Built for NEAR HACKATHON", "Dibuat untuk NEAR HACKATHON")}</span>
        <h1 className="text-3xl font-semibold text-neutral-black">{t("Buyer protection for payments from any chain", "Perlindungan pembeli untuk pembayaran dari chain mana pun")}</h1>
        <p className="text-neutral-gray">
          {t(
            "Lummy is a resale marketplace for concert tickets with escrow: the money waits until the show is over. A crypto payment cannot be taken back, which is a real risk when the seller is a stranger. So NEAR Intents brings the money from any chain into the escrow, and a model in NEAR AI's Trusted Execution Environment reads the ticket first.",
            "Lummy adalah marketplace resale tiket konser dengan escrow: uangnya menunggu sampai acara selesai. Pembayaran kripto tidak bisa ditarik kembali, dan itu masalah kalau membeli tiket dari orang asing. Karena itu NEAR Intents membawa uang dari chain mana pun ke dalam escrow, dan model di Trusted Execution Environment NEAR AI membaca tiketnya lebih dulu."
          )}
        </p>
      </header>

      <section data-near-quote className="rounded-3xl border border-neutral-light-gray-1 p-5 flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-lg text-neutral-black">
          <Shuffle className="w-5 h-5 text-lummy-500" /> {t("1. Pay from any chain", "1. Bayar dari chain mana pun")}
        </h2>
        <p className="text-sm text-neutral-gray">
          {t(
            "A live quote from NEAR Intents for one ticket at 9.50 USDC. This holds nothing and costs nothing to try.",
            "Quote live dari NEAR Intents untuk satu tiket seharga 9,50 USDC. Ini tidak menahan apa pun, dan gratis dicoba."
          )}
        </p>
        <label className="flex flex-col gap-1.5 text-xs text-neutral-gray">
          {t("Pay with", "Bayar dengan")}
          <NativeSelect data-near-asset value={asset} onChange={(e) => setAssetId(e.target.value)}>
            {(options?.assets ?? []).map((a) => (
              <option key={a.assetId} value={a.assetId}>{`${a.symbol} on ${a.chainLabel}`}</option>
            ))}
          </NativeSelect>
        </label>
        <div className="rounded-2xl bg-secondary-blue-extra p-4 text-sm">
          {quote ? (
            <>
              <Fact label={t("You send", "Kamu kirim")} value={`${quote.amountIn} ${quote.symbol}`} />
              <Fact label={t("Reaches the escrow on Arbitrum One", "Masuk ke escrow di Arbitrum One")} value={`${quote.amountOut} USDC`} />
              {quote.etaSeconds !== null && <Fact label={t("Usually takes", "Biasanya butuh")} value={t(`${quote.etaSeconds} seconds`, `${quote.etaSeconds} detik`)} />}
            </>
          ) : quoteError ? (
            <span className="text-secondary-pink-dark text-xs">{quoteError}</span>
          ) : (
            <span className="flex items-center gap-2 text-neutral-gray text-xs">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("Asking for a live quote...", "Meminta quote live...")}
            </span>
          )}
        </div>
        <ul className="text-sm text-neutral-gray flex flex-col gap-1.5 list-disc pl-5">
          <li>{t("Each order has its own receiver address, derived from its terms: listing, seller, price, show end and refund address. Paying that address is agreeing to those terms.", "Tiap pesanan punya alamat penerima sendiri, diturunkan dari syaratnya: listing, penjual, harga, waktu acara selesai, dan alamat refund. Membayar ke alamat itu berarti setuju dengan syarat itu.")}</li>
          <li>{t("The money can only go into the escrow on those terms, or back to the refund address. No key controls it, Lummy's included, and the buyer can get it back even if Lummy's servers are gone.", "Uangnya hanya bisa masuk ke escrow dengan syarat itu, atau kembali ke alamat refund. Tidak ada kunci yang mengendalikannya, termasuk kunci Lummy, dan pembeli tetap bisa mengambilnya walaupun server Lummy mati.")}</li>
          <li>{t("Real payments here are open to the Lummy team only: the contract is unaudited and capped at a small amount.", "Pembayaran sungguhan di sini khusus tim Lummy: kontraknya belum diaudit dan dibatasi nominal kecil.")}</li>
        </ul>
      </section>

      <section data-near-ticket className="rounded-3xl border border-neutral-light-gray-1 p-5 flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-lg text-neutral-black">
          <ShieldCheck className="w-5 h-5 text-lummy-500" /> {t("2. A ticket check you can verify", "2. Cek tiket yang bisa kamu verifikasi")}
        </h2>
        <p className="text-sm text-neutral-gray">
          {t(
            "Ticket PDFs carry names and booking codes. Lummy takes those out first, then a model running in NEAR AI's hardware-isolated environment reads the rest and pre-fills the listing. It decides nothing: a person rules on claims. Try it on a made-up ticket.",
            "PDF tiket berisi nama dan kode pesanan. Lummy membuangnya dulu, lalu model yang berjalan di lingkungan terisolasi hardware milik NEAR AI membaca sisanya dan mengisi listing. Model tidak memutuskan apa pun: klaim diputus oleh orang. Coba dengan tiket karangan."
          )}
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <NativeSelect data-near-sample value={sample} onChange={(e) => setSample(e.target.value)}>
            {TICKETS.map((s) => (
              <option key={s.id} value={s.id}>{t(s.en, s.idn)}</option>
            ))}
          </NativeSelect>
          <Button.Primary data-near-run wrapperClass="shrink-0" disabled={checking || options?.ticketAi === false} onClick={() => void runCheck()}>
            {checking && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("Check this ticket", "Cek tiket ini")}
          </Button.Primary>
        </div>
        {options?.ticketAi === false && <p className="text-xs text-neutral-gray">{t("NEAR AI is not switched on yet.", "NEAR AI belum dinyalakan.")}</p>}
        {checkError && <p data-near-error className="rounded-2xl bg-secondary-pink-soft p-3 text-sm text-secondary-pink-dark">{checkError}</p>}
        {check && (
          <div data-near-result className="rounded-2xl bg-secondary-blue-extra p-4 flex flex-col gap-3">
            <div>
              <Fact label={t("Show", "Acara")} value={check.facts.eventTitle} />
              <Fact label={t("Date", "Tanggal")} value={check.facts.date} />
              <Fact label={t("Venue", "Tempat")} value={check.facts.venue} />
              <Fact label={t("Category", "Kategori")} value={check.facts.tierPrinted} />
              <Fact label={t("Seat", "Kursi")} value={check.facts.seat} />
              <Fact label={t("Printed price", "Harga tercetak")} value={check.facts.printedPrice} />
            </div>
            {check.receipt ? (
              <div className="flex flex-col gap-2 text-sm">
                <p data-near-verified={check.receipt.verified} className={`flex items-center gap-2 font-medium ${check.receipt.verified ? "text-secondary-green-dark" : "text-secondary-pink-dark"}`}>
                  {check.receipt.verified ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  {check.receipt.verified
                    ? t("Signed by the model's TEE key, over the exact request and reply", "Ditandatangani kunci TEE model, atas permintaan dan jawaban yang persis")
                    : t(`Not verified: ${check.receipt.problem ?? "unknown"}`, `Tidak terverifikasi: ${check.receipt.problem ?? "tidak diketahui"}`)}
                </p>
                <p className="text-xs text-neutral-gray font-mono break-all">{check.receipt.signedText}</p>
                <p className="text-xs text-neutral-gray">
                  {check.model}
                  {check.receipt.signingAddress ? ` · ${t("signer", "penanda tangan")} ${shortAddress(check.receipt.signingAddress)}` : ""}
                  {check.receipt.attested ? ` · ${t("named in the model's attestation report", "tercantum di laporan attestation model")}` : ""}
                </p>
                <div className="flex flex-wrap gap-3 items-center">
                  {check.verifyUrl && (
                    <a data-near-verify href={check.verifyUrl} target="_blank" rel="noreferrer" className="text-primary-navy font-medium inline-flex items-center gap-1 text-sm">
                      {t("Check it on NEAR's Verification Center", "Cek di Verification Center NEAR")} <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button data-near-tamper type="button" onClick={() => void tamper()} className="text-sm text-neutral-gray hover:text-primary-navy underline underline-offset-2 cursor-pointer">
                    {t("Change one character and check again", "Ubah satu karakter lalu cek lagi")}
                  </button>
                </div>
                {tampered && (
                  <p data-near-tampered={tampered.ok} className={`text-sm flex items-center gap-2 ${tampered.ok ? "text-secondary-pink-dark" : "text-secondary-green-dark"}`}>
                    {tampered.ok ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                    {tampered.ok ? t("It passed, which it must not.", "Lolos, padahal seharusnya tidak.") : t(`Refused: ${tampered.problem}`, `Ditolak: ${tampered.problem}`)}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-secondary-pink-dark">{t("No receipt came back for this reply.", "Tidak ada bukti untuk jawaban ini.")}</p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-neutral-light-gray-1 p-5 flex flex-col gap-2">
        <h2 className="font-semibold text-lg text-neutral-black">{t("3. On chain", "3. Di chain")}</h2>
        {options?.escrow && options.factory ? (
          <div className="text-sm flex flex-col gap-1">
            <a href={explorerAddress(ARBITRUM_ONE, options.escrow) ?? undefined} target="_blank" rel="noreferrer" className="text-primary-navy font-medium inline-flex items-center gap-1">
              {t(`Escrow on Arbitrum One: ${shortAddress(options.escrow)}`, `Escrow di Arbitrum One: ${shortAddress(options.escrow)}`)} <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <a href={explorerAddress(ARBITRUM_ONE, options.factory) ?? undefined} target="_blank" rel="noreferrer" className="text-primary-navy font-medium inline-flex items-center gap-1">
              {t(`Receiver factory: ${shortAddress(options.factory)}`, `Factory penerima: ${shortAddress(options.factory)}`)} <ExternalLink className="w-3.5 h-3.5" />
            </a>
            {DEMO_TXS.map((d) => (
              <a key={d.tx} href={explorerTx(ARBITRUM_ONE, d.tx) ?? undefined} target="_blank" rel="noreferrer" className="text-primary-navy font-medium inline-flex items-center gap-1">
                {d.label} <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-gray">{t("The contracts are not deployed yet.", "Kontraknya belum di-deploy.")}</p>
        )}
      </section>

      <section className="text-sm text-neutral-gray flex flex-col gap-1">
        <p>
          {t(
            "Lummy existed before this hackathon: QRIS in Xendit's test mode for shows in Indonesia, and test USDC on Arbitrum Sepolia for shows abroad. It has no users or revenue yet. What is new is what this page shows.",
            "Lummy sudah ada sebelum hackathon ini: QRIS di mode uji Xendit untuk acara di Indonesia, dan USDC uji di Arbitrum Sepolia untuk acara luar negeri. Belum ada pengguna atau pendapatan. Yang baru adalah yang ditampilkan halaman ini."
          )}
        </p>
      </section>
    </div>
  );
}
