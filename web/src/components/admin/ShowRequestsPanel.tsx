"use client";

// The staff queue of show requests (lib/events/requests.ts). Approving puts the show in the
// catalogue with the categories and official prices staff typed from the organiser's page, and the
// name rule they found there; rejecting tells the seller why. A demo admin decides the demo requests
// in this browser, and nothing reaches the catalogue.
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Calendar, CheckCircle2, ExternalLink, Info, Loader2, MapPin, Plus, Search, Trash2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select-menu";
import { Modal } from "@/components/common/Modal";
import { REQUEST_COUNTRIES, type ApprovalTier } from "@/lib/events/requests";
import { decideEventRequest, researchEventRequest, useAccountRequests } from "@/lib/events/requests-client";
import type { Research } from "@/lib/events/research";
import { useCategoryLabel, useFormatters, useT } from "@/lib/i18n";
import { sourceUrl, useEventRequests, type EventRequest } from "@/lib/mock/useEventRequests";
import type { TransferPolicy } from "@/lib/mock/types";
import { useUser } from "@/lib/mock";

/** The queue, from the database for staff with an account, from this browser for a demo admin. */
export function useShowRequestQueue() {
  const account = useUser((s) => !!s.user?.account);
  const sample = useEventRequests((s) => s.requests);
  const { requests, error, refresh } = useAccountRequests(account ? "queue" : null);
  return { account, requests: account ? requests ?? [] : sample, loading: account && !requests && !error, error, refresh };
}

const POLICIES: { value: TransferPolicy | ""; en: string; id: string }[] = [
  { value: "", en: "Not confirmed: the terms say nothing about names", id: "Belum dikonfirmasi: S&K tidak menyebut soal nama" },
  { value: "open", en: "Open: the terms allow passing the ticket on", id: "Bebas: S&K membolehkan tiket dipindahtangankan" },
  { value: "letter", en: "Letter: a representative with a signed letter is accepted", id: "Surat kuasa: perwakilan dengan surat kuasa diterima" },
  { value: "id_match", en: "ID match: the name must match the ID at the gate", id: "Sesuai KTP: nama harus sama dengan identitas di gate" },
];

/** How the research read the terms on resale, and what staff do with it. */
const RESALE: Record<Research["resale"], { en: string; id: string; tone: string }> = {
  forbidden: { en: "The terms forbid resale: reject the request.", id: "S&K melarang resale: tolak pengajuannya.", tone: "text-secondary-pink-dark" },
  capped_at_face: { en: "Resale only up to the official price: approve with a 100% ceiling.", id: "Resale hanya sampai harga resmi: setujui dengan batas 100%.", tone: "text-secondary-orange-dark" },
  allowed: { en: "The terms allow passing tickets on.", id: "S&K membolehkan tiket dipindahtangankan.", tone: "text-secondary-green-dark" },
  unclear: { en: "No terms on resale found: read them on the official page.", id: "S&K soal resale tidak ditemukan: baca di halaman resminya.", tone: "text-neutral-gray" },
};

/** The show's price ceiling (events.cap_pct): 150% unless its terms cap resale lower. */
const CAP_CHOICES: { value: number; en: string; id: string }[] = [
  { value: 150, en: "150%: Lummy's ceiling", id: "150%: batas Lummy" },
  { value: 120, en: "120%", id: "120%" },
  { value: 100, en: "100%: the terms allow resale at face value only", id: "100%: S&K hanya membolehkan harga asli" },
];

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

function SourceLink({ href }: { href: string }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="text-primary-navy text-xs font-medium inline-flex items-center gap-0.5 break-all">
      {hostOf(href)} <ExternalLink className="w-3 h-3 shrink-0" />
    </a>
  );
}

/** What the AI found, each claim with its source, for staff to open and check. */
function ResearchFindings({ research: f, usdc }: { research: Research; usdc: boolean }) {
  const t = useT();
  const { formatDateTime, formatMoney } = useFormatters();
  const resale = RESALE[f.resale];
  const nameRule = POLICIES.find((p) => p.value === f.name_rule);
  return (
    <div data-research className="mt-3 rounded-2xl border border-secondary-blue-soft p-4 flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-gray">
        <Search className="w-3.5 h-3.5 text-lummy-500" />
        <span className="font-semibold text-neutral-black">{t("AI research", "Riset AI")}</span>
        <span>
          {formatDateTime(f.at)} · {t("a draft: open the sources before deciding", "draf: buka sumbernya sebelum memutus")}
        </span>
      </div>
      {!f.matches_request && (
        <p className="text-secondary-orange-dark">{t("What it found may not be this show: compare the date and city.", "Yang ditemukan mungkin bukan acara ini: cocokkan tanggal dan kotanya.")}</p>
      )}
      {f.official_url && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-neutral-gray">{t("Official page found:", "Halaman resmi yang ditemukan:")}</span>
          <SourceLink href={f.official_url} />
        </div>
      )}
      {(f.show.date || f.show.venue) && (
        <p className="text-neutral-black">
          {[f.show.title, [f.show.date, f.show.start_time].filter(Boolean).join(" "), [f.show.venue, f.show.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
        </p>
      )}
      {f.tiers.length > 0 && (
        <ul className="flex flex-col gap-1">
          {f.tiers.map((x, i) => (
            <li key={i} className="flex flex-wrap items-center gap-x-2">
              <span className="text-neutral-black">
                {x.name}: {x.price > 0 ? formatMoney(usdc ? Math.round(x.price * 1_000_000) : x.price, usdc ? "USDC" : "IDR") : t("price not found", "harga tidak ditemukan")}
              </span>
              <SourceLink href={x.source} />
            </li>
          ))}
        </ul>
      )}
      {f.price_note && <p className="text-xs text-neutral-gray">{f.price_note}</p>}
      <div className="flex flex-col gap-1">
        <span className={`font-medium ${resale.tone}`}>{t(resale.en, resale.id)}</span>
        {f.resale_quote && <q className="text-xs text-neutral-black">{f.resale_quote}</q>}
        <SourceLink href={f.resale_source} />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-neutral-black">
          {t("Name rule:", "Aturan nama:")} {nameRule ? t(nameRule.en, nameRule.id) : t("not found in the terms", "tidak ditemukan di S&K")}
        </span>
        {f.name_rule_quote && <q className="text-xs text-neutral-black">{f.name_rule_quote}</q>}
        <SourceLink href={f.name_rule_source} />
        {f.letter_template_url && (
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-gray">
            {t("The organiser's own letter template:", "Template surat kuasa resmi:")} <SourceLink href={f.letter_template_url} />
          </span>
        )}
      </div>
      {f.sold_out === "yes" && <p className="text-xs text-neutral-gray">{t("Sold out on the official channel.", "Sudah habis di kanal resmi.")}</p>}
      {f.summary && <p className="text-neutral-black">{f.summary}</p>}
      {f.sources.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-neutral-gray">{t(`All sources (${f.sources.length})`, `Semua sumber (${f.sources.length})`)}</summary>
          <ul className="mt-1 flex flex-col gap-1">
            {f.sources.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-2">
                <span className="text-neutral-black">{s.title || hostOf(s.url)}</span>
                <SourceLink href={s.url} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

const REJECT_REASONS: { en: string; id: string }[] = [
  { en: "The organiser's terms forbid resale.", id: "S&K penyelenggara melarang tiket dijual lagi." },
  { en: "The link is not the organiser's official page, or it does not show this show.", id: "Link-nya bukan halaman resmi penyelenggara, atau tidak memuat acara ini." },
  { en: "This show is in the catalogue already.", id: "Acara ini sudah ada di katalog." },
];

export function ShowRequestsPanel({ queue }: { queue: ReturnType<typeof useShowRequestQueue> }) {
  const t = useT();
  const router = useRouter();
  const { formatEventDate, formatIDR, formatMoney } = useFormatters();
  const categoryLabel = useCategoryLabel();
  const approveSample = useEventRequests((s) => s.approve);
  const rejectSample = useEventRequests((s) => s.reject);
  const [approving, setApproving] = useState<EventRequest | null>(null);
  const [rejecting, setRejecting] = useState<EventRequest | null>(null);
  const [tiers, setTiers] = useState<ApprovalTier[]>([]);
  const [policy, setPolicy] = useState<TransferPolicy | "">("");
  const [capPct, setCapPct] = useState(150);
  const [letterTemplate, setLetterTemplate] = useState("");
  const [checked, setChecked] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [researching, setResearching] = useState<string | null>(null);
  const { account, requests, loading, error, refresh } = queue;
  const countryName = (c?: string) => REQUEST_COUNTRIES.find((x) => x.code === (c ?? "ID"));

  // The AI looks the show up (lib/events/research.ts): a few minutes at most, staff decide.
  const research = async (r: EventRequest) => {
    setResearching(r.id);
    try {
      await researchEventRequest(r.id);
      toast.success(t("Research done: open its sources before deciding.", "Riset selesai: buka sumbernya sebelum memutus."));
      refresh();
    } catch (e) {
      toast.error(`${t("Research not done", "Riset belum selesai")}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setResearching(null);
    }
  };

  const openApprove = (r: EventRequest) => {
    const usdc = r.currency === "USDC";
    // What the research found fills the form in; staff still check it against the sources.
    const found = r.research?.tiers.filter((x) => x.price > 0) ?? [];
    setTiers(
      found.length
        ? found.map((x) => ({ name: x.name, faceValue: x.price }))
        : r.faceValues.length
          ? r.faceValues.map((f) => ({ name: f.tier, faceValue: usdc ? f.value / 1_000_000 : f.value }))
          : [{ name: r.pdfTier, faceValue: 0 }]
    );
    const rule = r.research?.name_rule;
    setPolicy(rule === "id_match" || rule === "letter" || rule === "open" ? rule : "");
    setCapPct(r.research?.resale === "capped_at_face" ? 100 : 150);
    setLetterTemplate(r.research?.letter_template_url ?? "");
    setChecked(false);
    setApproving(r);
  };

  const approve = async () => {
    const r = approving!;
    const clean = tiers.map((x) => ({ name: x.name.trim(), faceValue: Number(x.faceValue) })).filter((x) => x.name || x.faceValue);
    if (!clean.length || clean.some((x) => !x.name || !(x.faceValue > 0))) return toast.error(t("Each category needs a name and its official price.", "Tiap kategori butuh nama dan harga resminya."));
    setBusy(true);
    try {
      if (!account) {
        approveSample(r.id);
        toast.success(t("Approved here only: this is a demo request, so no show was added to the catalogue.", "Disetujui di sini saja: ini pengajuan demo, jadi tidak ada acara yang masuk katalog."));
      } else {
        await decideEventRequest(r.id, { action: "approve", tiers: clean, transferPolicy: policy || null, capPct, letterTemplateUrl: policy === "letter" ? letterTemplate.trim() : "" });
        toast.success(t("Approved: the show is in the catalogue, and its seller can list the ticket.", "Disetujui: acaranya sudah di katalog, dan penjualnya bisa memasang tiketnya."));
        refresh();
        router.refresh();
      }
      setApproving(null);
    } catch (e) {
      toast.error(`${t("Not approved", "Belum disetujui")}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    const r = rejecting!;
    if (reason.trim().length < 5) return toast.error(t("Write the reason for the seller.", "Tulis alasannya untuk penjual."));
    setBusy(true);
    try {
      if (!account) rejectSample(r.id, reason.trim());
      else {
        await decideEventRequest(r.id, { action: "reject", note: reason.trim() });
        refresh();
      }
      toast(t("Rejected; the seller sees the reason.", "Ditolak; penjual melihat alasannya."));
      setRejecting(null);
    } catch (e) {
      toast.error(`${t("Not rejected", "Belum ditolak")}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex items-start gap-2 text-sm text-neutral-gray bg-secondary-blue-extra rounded-2xl p-4 mb-6">
        <Info className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
        <span>
          {t(
            "A seller asks for a show that is not on sale yet. Before approving, open the official page: copy every category and its price from there, and read the terms on resale. If they forbid it, reject. The seller's ticket is checked when they list it.",
            "Penjual mengajukan acara yang belum dijual. Sebelum menyetujui, buka halaman resminya: salin semua kategori dan harganya dari sana, lalu baca S&K soal resale. Kalau dilarang, tolak. Tiket penjual dicek saat dia memasang listing."
          )}
        </span>
      </div>

      {loading ? (
        <p className="text-neutral-gray text-sm">{t("Loading...", "Memuat...")}</p>
      ) : error ? (
        <p className="text-sm text-secondary-pink-dark">{error}</p>
      ) : requests.length === 0 ? (
        <p data-requests-empty className="text-neutral-gray text-sm">{t("No show requests yet.", "Belum ada pengajuan acara.")}</p>
      ) : (
        <div data-reveal="stagger" className="flex flex-col gap-4">
          {requests.map((r) => {
            const usdc = r.currency === "USDC";
            const where = countryName(r.country);
            let host = r.organizerRef;
            try {
              host = new URL(sourceUrl(r.organizerRef)).hostname.replace(/^www\./, "");
            } catch {
              // shown as typed
            }
            return (
              <div key={r.id} data-request={r.id} data-request-status={r.status} className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-lg text-neutral-black">{r.title}</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-gray mt-1">
                      <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-primary-navy" /> {formatEventDate(r.dateISO)}</span>
                      <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-primary-navy" /> {r.venue}, {r.city}{where && where.code !== "ID" ? `, ${t(where.en, where.id)}` : ""}</span>
                      <Badge.Base className="bg-secondary-blue-soft text-lummy-500 text-xs">{categoryLabel(r.category)}</Badge.Base>
                    </div>
                    <div className="text-xs text-neutral-gray mt-1">{t("Requested by", "Diajukan oleh")} {r.submittedBy}</div>
                  </div>
                  {r.status !== "pending" && (
                    <Badge.Base className={r.status === "approved" ? "bg-secondary-green-soft text-secondary-green-dark text-xs" : "bg-secondary-pink-soft text-secondary-pink-dark text-xs"}>
                      {r.status === "approved" ? t("Approved", "Disetujui") : t("Rejected", "Ditolak")}
                    </Badge.Base>
                  )}
                </div>

                <div className="mt-4 bg-secondary-gray-soft rounded-2xl p-4 flex flex-col gap-2 text-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-neutral-gray">{t("Official page:", "Halaman resmi:")}</span>
                    <a href={sourceUrl(r.organizerRef)} target="_blank" rel="noreferrer noopener" className="text-primary-navy font-medium inline-flex items-center gap-0.5 break-all">
                      {host} <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                  <div className="text-neutral-black">
                    {r.faceValues.length
                      ? r.faceValues.map((f) => `${f.tier}: ${formatMoney(f.value, usdc ? "USDC" : "IDR")}`).join(" · ")
                      : r.pdfTier
                        ? t(`The seller's category: ${r.pdfTier}, no price given.`, `Kategori penjual: ${r.pdfTier}, tanpa harga.`)
                        : t("The seller gave no category or price.", "Penjual tidak mengisi kategori atau harga.")}
                    <span className="text-xs text-neutral-gray"> {t("(from the seller, to check against the official page)", "(dari penjual, dicek ke halaman resmi)")}</span>
                  </div>
                  {r.note && <p className="text-neutral-black">“{r.note}”</p>}
                  {!r.ticketChecked && (
                    <p className="text-xs text-neutral-gray">
                      {t("No ticket was checked with this request: the seller's ticket is checked when they list it.", "Belum ada tiket yang dicek bersama pengajuan ini: tiket penjual dicek saat dia memasang listing.")}
                    </p>
                  )}
                  {r.reviewNote && <p className="text-xs text-neutral-black">{t("Staff:", "Staf:")} {r.reviewNote}</p>}
                  {r.status === "approved" && r.eventId && (
                    <a href={`/events/${r.eventId}`} className="text-sm text-primary-navy font-medium w-fit">{t("Open the show", "Buka acaranya")}</a>
                  )}
                </div>

                {r.research && <ResearchFindings research={r.research} usdc={usdc} />}

                {r.status === "pending" && (
                  <div className="flex flex-wrap gap-3 mt-4">
                    <Button.Primary data-request-approve className="flex items-center gap-2 text-sm" onClick={() => openApprove(r)}>
                      <CheckCircle2 className="w-4 h-4" /> {t("Approve...", "Setujui...")}
                    </Button.Primary>
                    <Button.Ghost
                      data-request-reject
                      tone="danger"
                      className="text-sm"
                      onClick={() => {
                        setReason(r.research?.resale === "forbidden" ? t(REJECT_REASONS[0].en, REJECT_REASONS[0].id) : "");
                        setRejecting(r);
                      }}
                    >
                      <XCircle className="w-4 h-4" /> {t("Reject...", "Tolak...")}
                    </Button.Ghost>
                    {account && (
                      <Button.Ghost data-request-research className="text-sm" disabled={!!researching} onClick={() => void research(r)}>
                        {researching === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        {researching === r.id
                          ? t("Researching, this can take a few minutes...", "Sedang riset, bisa sampai beberapa menit...")
                          : r.research
                            ? t("Research again", "Riset ulang")
                            : t("Research with AI", "Riset dengan AI")}
                      </Button.Ghost>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!approving} onClose={() => !busy && setApproving(null)} title={t("Approve the show", "Setujui acara")} className="max-w-lg">
        {approving && (
          <div className="flex flex-col gap-4 p-6">
            <p className="text-sm text-neutral-gray">
              {approving.research?.tiers.some((x) => x.price > 0)
                ? t("Filled in from the AI research: check each category and price against its source.", "Diisi dari riset AI: cocokkan tiap kategori dan harga ke sumbernya.")
                : t("Copy every category and its official price from the organiser's page.", "Salin semua kategori dan harga resminya dari halaman penyelenggara.")}{" "}
              <a href={sourceUrl(approving.organizerRef)} target="_blank" rel="noreferrer noopener" className="text-primary-navy font-medium">{t("Open it", "Buka")}</a>
            </p>
            {approving.research?.resale === "forbidden" && (
              <p data-approve-forbidden className="text-sm text-secondary-pink-dark bg-secondary-pink-soft rounded-xl px-3 py-2">
                {t("The research found terms that forbid resale. Unless the official page says otherwise, reject instead.", "Riset menemukan S&K yang melarang resale. Kecuali halaman resminya berkata lain, tolak saja.")}
              </p>
            )}
            <div className="flex flex-col gap-2">
              {tiers.map((x, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input aria-label={t("Category", "Kategori")} value={x.name} onChange={(e) => setTiers((all) => all.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} placeholder="CAT 1" className="flex-1 min-w-0 rounded-xl border border-neutral-light-gray-1 px-3 py-2 text-sm outline-none focus:border-lummy-500" />
                  <input aria-label={t("Official price", "Harga resmi")} value={x.faceValue || ""} onChange={(e) => setTiers((all) => all.map((y, j) => (j === i ? { ...y, faceValue: Number(e.target.value.replace(/[^\d.]/g, "")) } : y)))} inputMode="decimal" placeholder={approving.currency === "USDC" ? "US$" : "Rp"} className="w-32 rounded-xl border border-neutral-light-gray-1 px-3 py-2 text-sm outline-none focus:border-lummy-500" />
                  <button type="button" aria-label={t("Remove", "Hapus")} onClick={() => setTiers((all) => all.filter((_, j) => j !== i))} className="p-2 text-neutral-gray hover:text-secondary-pink-dark cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              {tiers.length < 12 && (
                <button type="button" onClick={() => setTiers((all) => [...all, { name: "", faceValue: 0 }])} className="text-sm text-primary-navy font-medium flex items-center gap-1 w-fit cursor-pointer">
                  <Plus className="w-4 h-4" /> {t("Add a category", "Tambah kategori")}
                </button>
              )}
              {approving.currency !== "USDC" && tiers.some((x) => x.faceValue > 0) && (
                <p className="text-xs text-neutral-gray">{tiers.filter((x) => x.faceValue > 0).map((x) => `${x.name || "?"} ${formatIDR(x.faceValue)}`).join(" · ")}</p>
              )}
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-neutral-gray">{t("Name rule, from the terms the tickets are sold under", "Aturan nama, dari S&K penjualan tiketnya")}</span>
              <NativeSelect value={policy} onChange={(e) => setPolicy(e.target.value as TransferPolicy | "")}>
                {POLICIES.map((p) => <option key={p.value} value={p.value}>{t(p.en, p.id)}</option>)}
              </NativeSelect>
            </label>
            {policy === "letter" && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-neutral-gray">{t("The organiser's own letter template, if they publish one (optional)", "Template surat kuasa resmi penyelenggara, kalau ada (opsional)")}</span>
                <input
                  data-request-letter-template
                  value={letterTemplate}
                  onChange={(e) => setLetterTemplate(e.target.value)}
                  inputMode="url"
                  placeholder="https://..."
                  className="rounded-xl border border-neutral-light-gray-1 px-3 py-2 text-sm outline-none focus:border-lummy-500"
                />
              </label>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-neutral-gray">{t("Highest resale price, as a share of the official price", "Harga jual lagi tertinggi, dari harga resmi")}</span>
              <NativeSelect data-request-cap value={String(capPct)} onChange={(e) => setCapPct(Number(e.target.value))}>
                {CAP_CHOICES.map((c) => <option key={c.value} value={c.value}>{t(c.en, c.id)}</option>)}
              </NativeSelect>
            </label>
            <label className="flex items-start gap-2 text-sm text-neutral-black cursor-pointer">
              <input data-request-checked type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 accent-primary-navy" />
              {t("I checked the date, venue, categories, prices and resale terms on the official page.", "Saya sudah mencocokkan tanggal, tempat, kategori, harga, dan S&K resale di halaman resmi.")}
            </label>
            <Button.Primary data-request-confirm wrapperClass="w-full" className="w-full" disabled={!checked || busy} onClick={() => void approve()}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("Approve and add to the catalogue", "Setujui dan masukkan ke katalog")}
            </Button.Primary>
          </div>
        )}
      </Modal>

      <Modal open={!!rejecting} onClose={() => !busy && setRejecting(null)} title={t("Reject the request", "Tolak pengajuan")} className="max-w-lg">
        {rejecting && (
          <div className="flex flex-col gap-3 p-6">
            <span className="text-xs text-neutral-gray">{t("The seller sees this reason.", "Penjual melihat alasan ini.")}</span>
            {REJECT_REASONS.map((x) => (
              <button key={x.id} type="button" onClick={() => setReason(t(x.en, x.id))} className="text-left text-sm rounded-xl border border-neutral-light-gray-1 px-3 py-2 hover:border-lummy-500 cursor-pointer">
                {t(x.en, x.id)}
              </button>
            ))}
            <textarea data-request-reason value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} className="rounded-xl border border-neutral-light-gray-1 px-3 py-2 text-sm outline-none focus:border-lummy-500" />
            <Button.Primary data-request-reject-confirm wrapperClass="w-full" className="w-full" disabled={busy || reason.trim().length < 5} onClick={() => void reject()}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("Reject", "Tolak")}
            </Button.Primary>
          </div>
        )}
      </Modal>
    </>
  );
}
