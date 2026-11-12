"use client";

// What Lummy built for NEAR HACKATHON, for anyone to try without paying: a live quote from NEAR Intents,
// and the private ticket check on a made-up ticket, with a receipt that NEAR's own Verification Center
// checks. It says plainly what is not open yet. The real money runs on the team's own account.
import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, ShieldCheck, Shuffle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select-menu";
import { INTENTS } from "@/lib/chain/deployments";
import { explorerAddress, shortAddress } from "@/lib/chain/format";
import { useT } from "@/lib/i18n";
import { nearQuote, useNearOptions, type NearQuote } from "@/lib/payments/client";
import { HeldAssets } from "@/components/checkout/HeldAssets";
import { previewAmount } from "@/lib/near/held";

/** The cheapest Binance Blockchain Week listing on Lummy, in micro-USDC: what the live quote is for. */
const DEMO_PRICE = "9500000";
const ARBITRUM_ONE = 42161;
/** The receiver the first real payment went through: CREATE2 of its terms, readable on Arbiscan. */
const FIRST_RECEIVER = "0x903CE1751A2F5e8034b9A14a37b9294b8Ab58f6A";
/** The first real payment, 9 Nov 2026: 1 USDC from Base, locked in the escrow, refunded, each step on its explorer. */
const DEMO_TXS: { en: string; id: string; url: string }[] = [
  { en: "1. Paid 1.0156 USDC on Base", id: "1. Bayar 1,0156 USDC di Base", url: "https://basescan.org/tx/0xbd2abb9fb8c13c081bdff9fb65915ccb89f888b9d40ee95c972cf2bfdf6b4ffb" },
  { en: "2. The swap on NEAR Intents (the unused 0.0078 USDC went back on Base)", id: "2. Swap di NEAR Intents (sisa 0,0078 USDC kembali di Base)", url: "https://explorer.near-intents.org/transactions/0xD646036b628353F66A796808D0f8C68cF6f72cc2" },
  { en: "3. 1 USDC arrives at the order's receiver on Arbitrum One", id: "3. 1 USDC tiba di kontrak penerima pesanan di Arbitrum One", url: "https://arbiscan.io/tx/0x3188de757fdb1d05159ba1736fe856a032eb0f81cfae5b2153859ad8e0858062" },
  { en: "4. Locked in the escrow", id: "4. Dikunci di escrow", url: "https://arbiscan.io/tx/0x026c74573c2cb09eec3b50d28a2bdd0128b2c53fbabd8ad566d2128b48e4684f" },
  { en: "5. Refunded by the escrow", id: "5. Direfund oleh escrow", url: "https://arbiscan.io/tx/0x4543d8cecbd3ee9736add4f66324c412c3d9342c28467423f8ee37fc343966e0" },
  { en: "6. Back at the buyer's refund address", id: "6. Kembali ke alamat refund pembeli", url: "https://arbiscan.io/tx/0xef151467d037b02f731e2edce82cb44ad115ba3bc7df3272aec9cbe336e329d0" },
];
/**
 * The whole flow in the app, 10 Nov 2026 (T4): a team seller listed a sample ticket, read in NEAR AI's TEE;
 * staff cleared it; a team buyer paid from Ethereum at checkout, claimed it was never handed over, and
 * staff refunded it. Order or-d233378bd71c.
 */
const FLOW_TXS: { en: string; id: string; url: string }[] = [
  {
    en: "1. The ticket read in NEAR AI's TEE: its receipt on NEAR's Verification Center",
    id: "1. Tiket dibaca di TEE NEAR AI: buktinya di Verification Center NEAR",
    url: "https://cloud.near.ai/verify?model=Qwen%2FQwen3.8-27B#receipt=eyJjb21wbGV0aW9uSWQiOiJmOTc0MzU3ZDE2Nzg0N2NhOTIzN2RjNDU4NjE1NzE0YiIsIm1vZGVsIjoiUXdlbi9Rd2VuMy44LTI3QiIsInNpZ25hdHVyZUtpbmQiOiJwcm92aWRlcl90ZWUiLCJzaWduaW5nQWxnbyI6ImVjZHNhIiwic2lnbmluZ0FkZHJlc3MiOiIweDgzNWFiNTNkMjAyOTRlZjc5NTkwNmRmZjIxYWU0YzA0NTMzNmFhMjYiLCJzaWduZWRUZXh0IjoiUXdlbi9Rd2VuMy44LTI3QjplNWU2NmY5NTg1OTlmM2VjOTU2ZmYwNmE0M2YxMzZiYjVmYzAxOTlmZjUwZTAzZmY1MmRlZWIyNDE2MzA5NDc3OmU1ZjYyOGIwNjI3ZGNmZjA5MDViYjc2NzEyZmVhYjU3NjUwZGVjM2M2NzEzY2U3MjQwMjA1NTRmZGI4MjJhMWIiLCJzaWduYXR1cmUiOiIweDY2ZjJlNGNkYWU2MGY0NDgyMDQ0NGQwODA1MmI3ZmJmYThlYTJmMGE2ZTAxZGNiYjFjZDUwYzgyOTdhNDY4NDMyOTgxNGNhZTY5ZTNjYTFlYWFmZDFhNzJmMTc2ZTQ0YTQ0NmJjODE4ODBkMjhkOGY1ZGY2YWZiYjFmY2FiYzQxMWIiLCJ2ZXJpZmllZEF0IjoiMjAyNi0xMS0xMFQwMzoyMjowOC42OTNaIn0",
  },
  { en: "2. Paid 9.603158 USDC on Ethereum", id: "2. Bayar 9,603158 USDC di Ethereum", url: "https://etherscan.io/tx/0x23ff90e7b19eeb8efdde3d6987f7b639ccf4ce8e5bb7a858da302828a4addb6d" },
  { en: "3. The swap on NEAR Intents", id: "3. Swap di NEAR Intents", url: "https://explorer.near-intents.org/transactions/0x9eE94a51DA7f576f109fc0E82925D362fde51fe9" },
  { en: "4. 9.5 USDC at the order's receiver on Arbitrum One", id: "4. 9,5 USDC tiba di kontrak penerima pesanan di Arbitrum One", url: "https://arbiscan.io/tx/0xf30be3e23ba1bbb055d72393c1dfbf8a7b668b10bf96b0e5622e70975e734d76" },
  { en: "5. Locked in the escrow", id: "5. Dikunci di escrow", url: "https://arbiscan.io/tx/0x475c0b74f7959eb043262518b0bed47a125867437099eb826f9d4874ab9a3c71" },
  { en: "6. Refunded on staff's ruling, after the buyer's claim", id: "6. Direfund atas putusan staf, setelah klaim pembeli", url: "https://arbiscan.io/tx/0x8aed0dc1631781c0ca6bba23b4ce9a3f539d173a9ddd49b01901a760b4a295d8" },
  { en: "7. Back at the refund address locked before paying", id: "7. Kembali ke alamat refund yang dikunci sebelum bayar", url: "https://arbiscan.io/tx/0x41c604a38bfcac55d8c73557897d4b9dc1708d1c4e8e6b509d149f8cef585dd5" },
  { en: "8. The whole order on Lummy's public proof page, read from the contract", id: "8. Seluruh pesanan di halaman bukti publik Lummy, dibaca dari kontrak", url: "https://lummy.id/proof/0x435ad32a3c0844c5562365f0a12ddcf4126d7eaecc0b67290d49120b9883b181" },
];
/** The team's order of 12 Nov 2026, paid from a connected wallet in one confirmation. Block times: sent 03:00:52 UTC, locked 03:01:29. */
const WALLET_TXS: { en: string; id: string; url: string }[] = [
  { en: "1. One transfer of 9.603158 USDC on Base, confirmed once in the wallet", id: "1. Satu transfer 9,603158 USDC di Base, dikonfirmasi sekali di wallet", url: "https://basescan.org/tx/0x0c06d913f2b62a211527c2b913d6a11f3d304008c5c66a434a693320f0c47344" },
  { en: "2. The swap on NEAR Intents: 9.507126 used, 0.093632 sent back to the wallet", id: "2. Swap di NEAR Intents: 9,507126 terpakai, 0,093632 dikembalikan ke wallet", url: "https://explorer.near-intents.org/transactions/0x63c43C8fBe26c9612BE6Aa648B5eE0531713E50e" },
  { en: "3. 9.5 USDC at the order's receiver on Arbitrum One, 27 seconds after the transfer", id: "3. 9,5 USDC tiba di kontrak penerima pesanan di Arbitrum One, 27 detik setelah transfer", url: "https://arbiscan.io/tx/0x1cc6a97b1a6f5c90165281c55a151e6c24962955fd8e79aa7e0bc6f3dd7a2933" },
  { en: "4. Locked in the escrow, 37 seconds after the transfer", id: "4. Dikunci di escrow, 37 detik setelah transfer", url: "https://arbiscan.io/tx/0x0e683dbaac9bc4ba29e6775d7f3495fc1a991d719050546cb142091a581d8e76" },
  { en: "5. Its public proof page: the escrow holds this money until 48 hours after the show", id: "5. Halaman bukti publiknya: escrow menahan uang ini sampai 48 jam setelah acara", url: "https://lummy.id/proof/0xcae8b654980f9b56ae6c63713f58cf0494bcbeb9ae71cd52b7a93bd63fa5c536" },
];
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
  gpu?: { ok: boolean; fresh: boolean; signed: boolean; gpus: number; at: string } | null;
  problem?: string;
  verifiedAt: string;
};
type Check = {
  facts: { eventTitle: string | null; date: string | null; venue: string | null; tierPrinted: string | null; seat: string | null; printedPrice: number | null; quantity: number | null };
  model: string;
  ms: number;
  receipt: Receipt | null;
  verifyUrl: string | null;
  /** Set when NEAR AI did not answer and this is the same check recorded from it earlier (lib/near/recorded.ts). */
  recordedAt?: string;
  liveError?: string;
  /** The recording is shown because this server has no NEAR AI key, not because NEAR AI failed. */
  noKey?: boolean;
};

/** A recording's time, the same for every visitor: UTC, as the explorers show it. */
const recordedWhen = (iso: string) =>
  `${new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;

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
  const escrow = INTENTS[ARBITRUM_ONE]?.escrow ?? options?.escrow ?? null;
  const factory = INTENTS[ARBITRUM_ONE]?.factory ?? options?.factory ?? null;

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
        {options && <HeldAssets assets={options.assets} amount={DEMO_PRICE} selected={asset} onPick={setAssetId} />}
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
              <Fact label={t("You send", "Kamu kirim")} value={`${previewAmount(quote.amountIn)} ${quote.symbol}`} />
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
          <Button.Primary data-near-run wrapperClass="shrink-0" disabled={checking} onClick={() => void runCheck()}>
            {checking && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("Check this ticket", "Cek tiket ini")}
          </Button.Primary>
        </div>
        {checkError && <p data-near-error className="rounded-2xl bg-secondary-pink-soft p-3 text-sm text-secondary-pink-dark">{checkError}</p>}
        {check?.recordedAt && check.noKey && (
          <p data-near-recorded data-near-nokey className="rounded-2xl bg-secondary-orange-soft p-3 text-sm text-secondary-orange-dark">
            {t(
              `This server has no NEAR AI key, so it cannot ask NEAR AI itself. Below is the same check, recorded from NEAR AI on ${recordedWhen(check.recordedAt)}. Its hashes and its signature were just checked again here, from the exact bytes recorded, and the one-character test works the same. With a key in NEAR_AI_API_KEY the check runs live.`,
              `Server ini tidak punya kunci NEAR AI, jadi tidak bisa bertanya ke NEAR AI sendiri. Di bawah ini cek yang sama, direkam dari NEAR AI pada ${recordedWhen(check.recordedAt)}. Hash dan signature-nya baru saja dicek ulang di sini dari byte yang direkam persis, dan tes ubah satu karakter tetap berjalan sama. Dengan kunci di NEAR_AI_API_KEY, ceknya berjalan live.`
            )}
          </p>
        )}
        {check?.recordedAt && !check.noKey && (
          <p data-near-recorded className="rounded-2xl bg-secondary-orange-soft p-3 text-sm text-secondary-orange-dark">
            {t(
              `NEAR AI Cloud did not answer just now (${check.liveError ?? "no answer"}). That is on NEAR's side: see `,
              `NEAR AI Cloud barusan tidak menjawab (${check.liveError ?? "tidak ada jawaban"}). Itu masalah di sisi NEAR: lihat `
            )}
            <a href="https://status.near.ai" target="_blank" rel="noreferrer" className="underline underline-offset-2">status.near.ai</a>
            {t(
              `. Below is the same check, recorded from NEAR AI on ${recordedWhen(check.recordedAt)}. Its hashes and its signature were just checked again here, from the exact bytes recorded, and the one-character test works the same. NEAR's Verification Center needs NEAR AI too, so it may fail until NEAR AI is back. Try the live check again in a few minutes.`,
              `. Di bawah ini cek yang sama, direkam dari NEAR AI pada ${recordedWhen(check.recordedAt)}. Hash dan signature-nya baru saja dicek ulang di sini dari byte yang direkam persis, dan tes ubah satu karakter tetap berjalan sama. Verification Center NEAR juga butuh NEAR AI, jadi mungkin ikut gagal sampai NEAR AI pulih. Coba cek live lagi beberapa menit lagi.`
            )}
          </p>
        )}
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
                  {check.receipt.attested
                    ? ` · ${check.recordedAt ? t("named in the model's attestation report when recorded", "tercantum di laporan attestation model saat direkam") : t("named in the model's attestation report", "tercantum di laporan attestation model")}`
                    : ""}
                </p>
                {/* The third check, by this server: NVIDIA's own service on the GPU evidence (lib/near/gpu.ts). */}
                {check.receipt.gpu && (
                  <p data-near-gpu={check.receipt.gpu.ok && check.receipt.gpu.fresh && check.receipt.gpu.signed} className="flex items-start gap-2 text-xs text-neutral-gray">
                    {check.receipt.gpu.ok && check.receipt.gpu.fresh && check.receipt.gpu.signed ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-secondary-green-dark" />
                        {t(
                          `NVIDIA's attestation service confirms the GPU evidence in that report (${check.receipt.gpu.gpus} ${check.receipt.gpu.gpus === 1 ? "GPU" : "GPUs"}), made for a nonce this server chose, in a token signed by NVIDIA.`,
                          `Layanan attestation NVIDIA mengonfirmasi bukti GPU di laporan itu (${check.receipt.gpu.gpus} GPU), dibuat untuk nonce pilihan server ini, dalam token bertanda tangan NVIDIA.`
                        )}
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-secondary-pink-dark" />
                        {t("NVIDIA's attestation service did not confirm the GPU evidence in that report just now.", "Layanan attestation NVIDIA tidak mengonfirmasi bukti GPU di laporan itu saat ini.")}
                      </>
                    )}
                  </p>
                )}
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
                {/* Found 9 Nov 2026: NEAR's page refuses NVIDIA's fresh GPU token when the viewer's clock is
                    behind NVIDIA's, with no tolerance; a laptop 2 s slow saw "Failed", the same receipt
                    passed in full once the clock was right. */}
                {check.verifyUrl && (
                  <p data-near-clock className="text-xs text-neutral-gray">
                    {t(
                      "NEAR's page checks the hardware evidence again in your browser. If it says the GPU check failed, check that your computer's clock is set automatically: a clock a few seconds slow makes NVIDIA's fresh token look like it is from the future.",
                      "Halaman NEAR mengecek ulang bukti hardware-nya di browser-mu. Kalau di sana cek GPU-nya gagal, pastikan jam komputermu diatur otomatis: jam yang lambat beberapa detik membuat token NVIDIA yang baru terbit terlihat seperti dari masa depan."
                    )}
                  </p>
                )}
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
        {/* The addresses are fixed at build (deployments.ts), so the page names them before any request:
            a reader of the bare HTML once got "not deployed yet" until the options call came back. */}
        {escrow && factory ? (
          <div className="text-sm flex flex-col gap-1">
            <a data-near-escrow href={explorerAddress(ARBITRUM_ONE, escrow) ?? undefined} target="_blank" rel="noreferrer" className="text-primary-navy font-medium inline-flex items-center gap-1">
              {t(`Escrow on Arbitrum One: ${shortAddress(escrow)}`, `Escrow di Arbitrum One: ${shortAddress(escrow)}`)} <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <a href={explorerAddress(ARBITRUM_ONE, factory) ?? undefined} target="_blank" rel="noreferrer" className="text-primary-navy font-medium inline-flex items-center gap-1">
              {t(`Receiver factory: ${shortAddress(factory)}`, `Factory penerima: ${shortAddress(factory)}`)} <ExternalLink className="w-3.5 h-3.5" />
            </a>
            {DEMO_TXS.length > 0 && <p className="mt-2 text-neutral-black font-medium">{t("The first real payment, 9 Nov 2026, with the team's own money", "Pembayaran sungguhan pertama, 9 Nov 2026, dengan uang tim sendiri")}</p>}
            {DEMO_TXS.map((d) => (
              <a key={d.url} href={d.url} target="_blank" rel="noreferrer" className="text-primary-navy font-medium inline-flex items-center gap-1">
                {t(d.en, d.id)} <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ))}
            <p data-near-flow className="mt-2 text-neutral-black font-medium">
              {t(
                "Then the whole flow on lummy.id, 10 Nov 2026: a team account sold a sample ticket, another bought it from Ethereum, claimed it was never handed over, and got the money back",
                "Lalu seluruh alurnya di lummy.id, 10 Nov 2026: akun tim menjual tiket contoh, akun tim lain membelinya dari Ethereum, mengklaim tiketnya tidak diserahkan, dan uangnya kembali"
              )}
            </p>
            {FLOW_TXS.map((d) => (
              <a key={d.url} href={d.url} target="_blank" rel="noreferrer" className="text-primary-navy font-medium inline-flex items-center gap-1">
                {t(d.en, d.id)} <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ))}
            <p data-near-wallet-run className="mt-2 text-neutral-black font-medium">
              {t(
                "And from a connected wallet, 12 Nov 2026: Lummy read the wallet, picked USDC on Base, and the buyer confirmed one transfer. Still locked in the escrow today",
                "Lalu dari wallet yang terhubung, 12 Nov 2026: Lummy membaca isi wallet, memilih USDC di Base, dan pembeli mengonfirmasi satu transfer. Sampai hari ini masih terkunci di escrow"
              )}
            </p>
            {WALLET_TXS.map((d) => (
              <a key={d.url} href={d.url} target="_blank" rel="noreferrer" className="text-primary-navy font-medium inline-flex items-center gap-1">
                {t(d.en, d.id)} <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ))}
            {/* The guarantee itself, checked without trusting us: the receiver's terms are public, and the
                factory turns them back into its address. Its source was verified on Arbiscan on 9 Nov 2026. */}
            <p data-near-terms className="mt-2 text-neutral-gray">
              {t("Check the terms yourself: the receiver of the first payment, ", "Cek sendiri syaratnya: kontrak penerima pembayaran pertama, ")}
              <a href={`${explorerAddress(ARBITRUM_ONE, FIRST_RECEIVER)}#readContract`} target="_blank" rel="noreferrer" className="text-primary-navy font-medium">
                {shortAddress(FIRST_RECEIVER)}
              </a>
              {t(
                ", shows its listing, seller, price, show end, refund address and deadline under Read Contract. Give them to the factory's ",
                ", menampilkan listing, penjual, harga, akhir acara, alamat refund, dan batas waktunya di Read Contract. Masukkan semuanya ke "
              )}
              <a href={`${explorerAddress(ARBITRUM_ONE, factory)}#readContract`} target="_blank" rel="noreferrer" className="text-primary-navy font-medium font-mono">
                receiverOf
              </a>
              {t(
                " and it returns that same address. Change any one of them, the refund address included, and the address changes: the money could only go where those terms say.",
                " milik factory, hasilnya alamat yang sama. Ubah salah satunya, termasuk alamat refund, dan alamatnya berubah: uangnya hanya bisa pergi ke tempat yang disebut syarat itu."
              )}
            </p>
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
