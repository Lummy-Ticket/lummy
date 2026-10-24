"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  CheckCircle2, XCircle, AlertTriangle, Sparkles, Calendar, CalendarClock, CalendarX, MapPin, Scale, Paperclip,
  ExternalLink, Gavel, Clock, Loader2, Ticket, MinusCircle, Banknote, DoorOpen,
} from "lucide-react";
import { PaymentsPanel, usePaymentsOverview } from "@/components/admin/PaymentsPanel";
import { EvidencePhoto } from "@/components/common/EvidencePhoto";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/common/Modal";
import { useAccessGuard, useHydrated } from "@/lib/access";
import { PageGate } from "@/components/layout/PageGate";
import { useT, useFormatters, useCategoryLabel } from "@/lib/i18n";
import { PageContainer } from "@/components/layout/PageContainer";
import {
  useEventRequests, useOrders, useSellerListings, useUser, isEventOver,
  checkEvidence, reasonMeta, suggestedRationale, verdictRationale, disputeDeadlineISO,
  remedyOptions, suggestedRemedy, penaltyFor, SELLER_PENALTY_PCT, penaltyNote, REMEDY_LABEL, partialAmount, REVIEW_TARGET_H,
  type ChainSettlement, type EventRequest, type Order, type Remedy, type SellerListing,
} from "@/lib/mock";
import { chainAction } from "@/lib/chain/client";
import { useCatalogue } from "@/lib/catalogue";
import { orderAction, useAccountOrders } from "@/lib/orders/client";
import { listingAction, useAccountListings } from "@/lib/listings/client";
import { formatName, reasonText, reviewReasons } from "@/lib/tickets/checks";
import { inIndonesia, mapsLink, parseLocation, type LatLng } from "@/lib/events/location";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SampleBadge } from "@/components/common/SampleBadge";

/**
 * What the buyer gets back on chain, in USDC units: the same share of the locked amount as the
 * verdict gives in rupiah. Zero pays the seller in full, which the contract records as Released.
 */
function onchainToBuyer(o: Order, remedy: Remedy): string {
  if (!o.chain || !o.dispute) return "0";
  const rupiah =
    remedy === "REFUND_FULL" || remedy === "REPLACEMENT" ? o.amount
    : remedy === "REFUND_PARTIAL" ? partialAmount(o, o.dispute.reason)
    : 0;
  return ((BigInt(o.chain.price) * BigInt(rupiah)) / BigInt(o.amount)).toString();
}

function EvidencePanel({ order }: { order: Order }) {
  const t = useT();
  const { formatDateTime } = useFormatters();
  const d = order.dispute!;
  const check = useMemo(() => checkEvidence(order, d.reason, d.evidence, d.openedAtISO), [order, d]);
  const deadline = disputeDeadlineISO(order);

  return (
    <div className="mt-3 rounded-2xl border border-neutral-light-gray-1 overflow-hidden">
      <div className="bg-secondary-orange-soft px-4 py-3">
        <div className="text-sm font-medium text-secondary-orange-dark flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {t(reasonMeta(d.reason).label.en, reasonMeta(d.reason).label.id)}
        </div>
        {d.note && t(d.note.en, d.note.id).trim() && <p className="text-xs text-secondary-orange-dark mt-1 italic">&ldquo;{t(d.note.en, d.note.id)}&rdquo;</p>}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 text-xs text-neutral-black mb-2">
          <Paperclip className="w-3.5 h-3.5 text-neutral-gray shrink-0" />
          <span className="font-mono truncate">
            {d.evidence?.fileName ?? t("Settled from platform records", "Diputus dari catatan platform")}
          </span>
          <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${check.strength === "STRONG" ? "bg-secondary-green-soft text-secondary-green-dark" : "bg-secondary-pink-soft text-secondary-pink-dark"}`}>
            {check.strength === "STRONG" ? t("STRONG", "KUAT") : t("WEAK", "LEMAH")}
          </span>
        </div>
        {d.evidence?.upload && <EvidencePhoto orderId={order.id} side="buyer" evidence={d.evidence} />}
        <div className="grid sm:grid-cols-2 gap-x-4">
          {check.checks.map((c) => (
            <div key={c.label.en} className="flex gap-2 py-1.5">
              {c.ok ? (
                <CheckCircle2 className="w-4 h-4 text-secondary-green-dark shrink-0 mt-0.5" />
              ) : c.unknown ? (
                <MinusCircle className="w-4 h-4 text-neutral-gray shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 text-secondary-pink-dark shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <div className="text-xs font-medium text-neutral-black">{t(c.label.en, c.label.id)}</div>
                <div className="text-xs text-neutral-gray">{t(c.detail.en, c.detail.id)}</div>
              </div>
            </div>
          ))}
        </div>
        {(d.replies ?? []).length > 0 && (
          <div className="mt-3 pt-3 border-t border-dashed border-neutral-light-gray-1 flex flex-col gap-2">
            {(d.replies ?? []).map((r, i) => (
              <div key={i} className="text-xs">
                <span className={`font-medium ${r.fromSeller ? "text-primary-navy" : "text-secondary-orange-dark"}`}>
                  {r.fromSeller ? t("Seller replied", "Penjual menjawab") : t("Buyer replied", "Pembeli menjawab")}
                </span>
                <span className="text-neutral-gray"> · {formatDateTime(r.atISO)}</span>
                <p className="text-neutral-gray italic mt-0.5">&ldquo;{t(r.note.en, r.note.id)}&rdquo;</p>
                {r.evidence && (
                  <span className="flex items-center gap-1.5 mt-1 font-mono text-neutral-black">
                    <Paperclip className="w-3 h-3 shrink-0" /> {r.evidence.fileName}
                  </span>
                )}
                {r.evidence?.upload && <EvidencePhoto orderId={order.id} side={r.fromSeller ? "seller" : "buyer"} evidence={r.evidence} />}
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-dashed border-neutral-light-gray-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-gray">
          {d.evidence?.capturedAtISO && (
            <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {t("Captured", "Diambil")} {formatDateTime(d.evidence.capturedAtISO)}</span>
          )}
          <span className="flex items-center gap-1.5"><Gavel className="w-3.5 h-3.5" /> {t("Filed", "Diajukan")} {formatDateTime(d.openedAtISO)}</span>
          {deadline && <span className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {t("Window closes", "Masa sengketa tutup")} {formatDateTime(deadline)}</span>}
        </div>
      </div>
    </div>
  );
}

function EmptyQueue({ text }: { text: string }) {
  return (
    <div className="bg-neutral-white rounded-3xl border border-dashed border-neutral-light-gray-1 p-10 text-center">
      <p className="text-neutral-gray text-sm">{text}</p>
    </div>
  );
}

/** A date as a datetime-local input shows it, in this device's time zone. */
function localInput(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Where a show's venue is, for the location check on claim photos (docs/config/05). Staff paste
 * what Google Maps copies, or the Maps link; the point is shown back with a map link before saving.
 */
function VenueLocation({
  point, busy, onSave,
}: {
  point: LatLng | undefined;
  busy: boolean;
  onSave: (text: string | null) => Promise<boolean>;
}) {
  const t = useT();
  // null: the form is closed.
  const [text, setText] = useState<string | null>(null);
  const parsed = text ? parseLocation(text) : null;
  const outside = !!parsed && !inIndonesia(parsed);
  const save = async (value: string | null) => {
    if (await onSave(value)) setText(null);
  };

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-gray">
        <MapPin className="w-3.5 h-3.5 shrink-0" />
        {point ? (
          <>
            <span>
              {t("Venue on the map", "Venue di peta")}: <span className="font-mono text-neutral-black">{point.lat}, {point.lng}</span>
            </span>
            <a href={mapsLink(point)} target="_blank" rel="noreferrer" className="text-primary-navy hover:opacity-80">
              {t("Check it", "Cek di peta")}
            </a>
          </>
        ) : (
          <span>{t("No venue location yet: claim photos are not checked against it.", "Lokasi venue belum ada: foto klaim belum dicek terhadapnya.")}</span>
        )}
        <button onClick={() => setText(text === null ? "" : null)} className="text-primary-navy font-medium hover:opacity-80 cursor-pointer">
          {text !== null ? t("Close", "Tutup") : point ? t("Change", "Ubah") : t("Set it", "Isi")}
        </button>
      </div>
      {text !== null && (
        <form
          data-venue-form
          className="mt-2 flex flex-col gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (parsed && !outside) void save(text);
          }}
        >
          <input
            value={text}
            onChange={(ev) => setText(ev.target.value)}
            aria-label={t("Venue location", "Lokasi venue")}
            placeholder={t("Paste from Google Maps: -6.21858, 106.80251, or the Maps link", "Tempel dari Google Maps: -6.21858, 106.80251, atau tautan Maps-nya")}
            className="rounded-xl border border-lummy-500 px-4 py-2.5 text-sm text-neutral-black outline-none"
          />
          <div className="text-xs" aria-live="polite">
            {!text.trim() ? (
              <span className="text-neutral-gray">{t("In Google Maps, right-click the venue's main entrance and click the numbers at the top to copy them.", "Di Google Maps, klik kanan pintu masuk utama venue, lalu klik angka paling atas untuk menyalinnya.")}</span>
            ) : !parsed ? (
              <span className="text-secondary-orange-dark">{t("No point found in that text.", "Tidak ada titik di teks itu.")}</span>
            ) : outside ? (
              <span className="text-secondary-orange-dark">{t("That point is outside Indonesia: lat and lng are probably swapped.", "Titik itu di luar Indonesia: lat dan lng mungkin tertukar.")}</span>
            ) : (
              <span className="text-neutral-gray">
                {parsed.lat}, {parsed.lng} ·{" "}
                <a href={mapsLink(parsed)} target="_blank" rel="noreferrer" className="text-primary-navy">
                  {t("check it on the map first", "cek dulu di peta")}
                </a>
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button.Ghost type="submit" className="text-sm" disabled={busy || !parsed || outside}>
              {t("Save location", "Simpan lokasi")}
            </Button.Ghost>
            {point && (
              <Button.Ghost tone="danger" className="text-sm" disabled={busy} onClick={() => void save(null)}>
                {t("Clear it", "Hapus")}
              </Button.Ghost>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

/**
 * Shows still to come, where staff record what an organiser did to one. Cancelled: the server
 * closes its listings and refunds every order still in escrow, fee included; asking twice guards
 * the button. Postponed: the show moves to a later date, never an earlier one, and every order
 * still in escrow moves with it.
 */
function ShowsPanel() {
  const t = useT();
  const { formatEventDate } = useFormatters();
  const catalogue = useCatalogue();
  const router = useRouter();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ id: string; at: string } | null>(null);
  // Venue points, for the location check on claim photos. The public catalogue does not carry them.
  const [locations, setLocations] = useState<Record<string, LatLng> | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/events/locations", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ locations: Record<string, LatLng> }>) : null))
      .then((j) => {
        if (alive) setLocations(j?.locations ?? {});
      })
      .catch(() => {
        if (alive) setLocations({});
      });
    return () => {
      alive = false;
    };
  }, []);

  const place = async (id: string, location: string | null): Promise<boolean> => {
    setBusy(id);
    try {
      const r = await fetch(`/api/events/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "location", location }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string; location?: LatLng | null };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setLocations((all) => {
        const next = { ...(all ?? {}) };
        if (j.location) next[id] = j.location;
        else delete next[id];
        return next;
      });
      toast.success(j.location ? t("Venue location saved", "Lokasi venue disimpan") : t("Venue location cleared", "Lokasi venue dihapus"));
      return true;
    } catch (e) {
      toast.error(`${t("Not saved", "Gagal disimpan")}: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    } finally {
      setBusy(null);
    }
  };
  const upcoming = catalogue.events.filter((e) => !isEventOver(e)).sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  const postpone = async (id: string, at: string) => {
    setBusy(id);
    try {
      const r = await fetch(`/api/events/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "postpone", startsAt: new Date(at).toISOString() }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string; startsAt?: string; moved?: number; failed?: number; remaining?: number };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      const when = formatEventDate(j.startsAt ?? at);
      toast.success(t(`Show moved to ${when}: ${j.moved ?? 0} order(s) moved with it`, `Acara diundur ke ${when}: ${j.moved ?? 0} pesanan ikut diundur`));
      const left = (j.failed ?? 0) + (j.remaining ?? 0);
      if (left) toast.error(t(`${left} order(s) did not move. Submit the same date again, or check the server log.`, `${left} pesanan belum ikut. Kirim tanggal yang sama lagi, atau cek log server.`));
      setMoving(null);
      router.refresh();
    } catch (e) {
      toast.error(`${t("Not postponed", "Gagal diundur")}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (id: string) => {
    if (confirm !== id) {
      setConfirm(id);
      setTimeout(() => setConfirm((c) => (c === id ? null : c)), 4000);
      return;
    }
    setConfirm(null);
    setBusy(id);
    try {
      const r = await fetch(`/api/events/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        error?: string; refunded?: number; listingsClosed?: number; holdsClosed?: number; holdsLeft?: number; failed?: number; remaining?: number;
      };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      const stopped = j.holdsClosed ? t(`, ${j.holdsClosed} open payment(s) stopped`, `, ${j.holdsClosed} pembayaran yang sedang berjalan dihentikan`) : "";
      toast.success(
        t(`Show cancelled: ${j.refunded ?? 0} order(s) refunded, ${j.listingsClosed ?? 0} listing(s) closed`, `Acara dibatalkan: ${j.refunded ?? 0} pesanan direfund, ${j.listingsClosed ?? 0} listing ditutup`) + stopped
      );
      if (j.holdsLeft) toast.error(t(`${j.holdsLeft} QRIS could not be stopped yet; it runs out within 15 minutes.`, `${j.holdsLeft} QRIS belum bisa dihentikan; kedaluwarsa paling lama 15 menit lagi.`));
      const left = (j.failed ?? 0) + (j.remaining ?? 0);
      if (left) toast.error(t(`${left} order(s) are still held. Press again, or check the server log.`, `${left} pesanan masih tertahan. Tekan lagi, atau cek log server.`));
      // The catalogue sits in the root layout, and the show has just left it.
      router.refresh();
    } catch (e) {
      toast.error(`${t("Not cancelled", "Gagal dibatalkan")}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-gray">
        {t(
          "When an organiser cancels or moves a show, record it here. Cancelled: its listings close and every order still in escrow is refunded in full, fee included. Postponed: its listings keep selling for the new date, and every order still in escrow moves with it; each buyer may keep the ticket or take the money back. Sellers are not penalised either way.",
          "Kalau penyelenggara membatalkan atau mengundur acara, catat di sini. Batal: listing-nya ditutup dan semua pesanan yang masih di escrow direfund penuh, termasuk biaya layanan. Diundur: listing-nya tetap dijual untuk tanggal baru, dan semua pesanan yang masih di escrow ikut diundur; tiap pembeli boleh tetap memakai tiketnya atau mengambil dananya kembali. Penjual tidak dikenai penalti di kedua kasus."
        )}
      </p>
      {upcoming.length === 0 && <EmptyQueue text={t("No shows coming up.", "Tidak ada acara mendatang.")} />}
      {upcoming.map((e) => (
        <div key={e.id} data-show={e.id} className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold text-neutral-black truncate">{e.title}</h3>
              <div className="text-xs text-neutral-gray mt-1">
                {formatEventDate(e.dateISO)} · {e.venue}, {e.city} · {t(`${e.listingCount} on sale`, `${e.listingCount} dijual`)}
                {e.postponed && <span className="text-secondary-brown-dark font-medium"> · {t("postponed", "diundur")}</span>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Link
                href={`/gate?event=${encodeURIComponent(e.id)}`}
                className="inline-flex items-center justify-center gap-1.5 rounded-2xl border-2 bg-neutral-white px-5 py-3.5 font-semibold text-sm transition -translate-y-0.5 border-neutral-light-gray-1 text-neutral-gray hover:border-primary-navy hover:text-primary-navy"
              >
                <DoorOpen className="w-4 h-4" /> {t("Open the gate", "Buka gate")}
              </Link>
              <Button.Ghost
                className="text-sm flex items-center gap-1.5"
                disabled={busy === e.id}
                onClick={() => setMoving(moving?.id === e.id ? null : { id: e.id, at: localInput(e.dateISO) })}
              >
                <CalendarClock className="w-4 h-4" /> {t("Organiser postponed", "Diundur penyelenggara")}
              </Button.Ghost>
              <Button.Ghost tone="danger" className="text-sm flex items-center gap-1.5" disabled={busy === e.id} onClick={() => void cancel(e.id)}>
                {busy === e.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarX className="w-4 h-4" />}
                {confirm === e.id ? t("Press again to cancel the show", "Tekan lagi untuk membatalkan") : t("Organiser cancelled", "Dibatalkan penyelenggara")}
              </Button.Ghost>
            </div>
          </div>
          {locations && <VenueLocation point={locations[e.id]} busy={busy === e.id} onSave={(text) => place(e.id, text)} />}
          {moving?.id === e.id && (
            <form
              data-postpone-form
              className="mt-4 pt-4 border-t border-dashed border-neutral-light-gray-1 flex flex-col sm:flex-row sm:items-end gap-3"
              onSubmit={(ev) => {
                ev.preventDefault();
                void postpone(e.id, moving.at);
              }}
            >
              <label className="flex flex-col gap-1.5 text-xs text-neutral-gray">
                {t("New start, in this device's time", "Jadwal mulai baru, waktu perangkat ini")}
                <input
                  type="datetime-local"
                  required
                  value={moving.at}
                  min={localInput(e.dateISO)}
                  onChange={(ev) => setMoving({ id: e.id, at: ev.target.value })}
                  className="rounded-xl border border-lummy-500 px-4 py-2.5 text-sm text-neutral-black outline-none"
                />
              </label>
              <Button.Ghost type="submit" className="text-sm flex items-center gap-1.5" disabled={busy === e.id || !moving.at || new Date(moving.at).getTime() <= new Date(e.dateISO).getTime()}>
                {busy === e.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
                {t("Move the show", "Undur acaranya")}
              </Button.Ghost>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Listings the sell flow held back, either because the AI flagged the document
 * or because they were posted close to doors. The sell flow tells the seller
 * this queue exists, so it has to actually exist.
 */
function ListingQueue({
  held, onApprove, onReject, sampleFiles,
}: {
  held: SellerListing[];
  onApprove: (id: string) => void | Promise<void>;
  onReject: (id: string) => void | Promise<void>;
  /** Listings from accounts: a real PDF (with what its check found) or a sample ticket. */
  sampleFiles?: boolean;
}) {
  const t = useT();
  const { formatIDR, formatEventDate } = useFormatters();
  const catalogue = useCatalogue();
  const [now] = useState(() => Date.now());
  const decide = async (fn: (id: string) => void | Promise<void>, id: string, done: () => void) => {
    try {
      await fn(id);
      done();
    } catch (e) {
      toast.error(`${t("Not saved", "Gagal disimpan")}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  if (held.length === 0) {
    return <EmptyQueue text={t("Nothing held. Every listing cleared on its own.", "Tidak ada yang ditahan. Semua listing lolos sendiri.")} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-gray">
        {t(
          "These never went live. Clear one only after checking the document by hand: approving puts it in front of buyers.",
          "Semua ini belum pernah tayang. Loloskan hanya setelah dokumennya dicek manual: menyetujui berarti listing-nya tampil ke pembeli."
        )}
        {sampleFiles &&
          t(
            " A listing from a real PDF shows what its check found and opens the file; the rest are sample tickets.",
            " Listing dari PDF asli menampilkan hasil ceknya dan bisa dibuka file-nya; sisanya tiket contoh."
          )}
      </p>
      {held.map((l) => {
        const ev = catalogue.eventById(l.eventId);
        const risky = l.ai.pdfSuspicious || l.ai.forgeryScore >= 60;
        const why = l.checks ? reviewReasons(l.checks) : [];
        // The seller is told staff aim for REVIEW_TARGET_H; the queue says who has waited past it.
        // Only for accounts' listings: a sample's date is made up.
        const waited = sampleFiles ? Math.floor((now - Date.parse(l.createdAtISO)) / 3_600_000) : null;
        return (
          <div key={l.id} data-listing={l.id} className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-neutral-black truncate">{l.eventTitle}</h3>
                <div className="text-xs text-neutral-gray mt-1">
                  {ev ? formatEventDate(ev.dateISO) : ""} · {l.tierName} · {l.quantity}x
                </div>
              </div>
              <span className="tabular-nums font-bold text-lummy-500 text-nowrap">{formatIDR(l.askPrice)}</span>
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              {waited !== null && (
                <Badge.Base data-review-wait className={`text-xs flex items-center gap-1 ${waited >= REVIEW_TARGET_H ? "bg-secondary-pink-soft text-secondary-pink-dark" : "bg-secondary-gray-soft text-neutral-gray"}`}>
                  <Clock className="w-3 h-3" />
                  {waited < 1 ? t("Waiting under an hour", "Menunggu kurang dari 1 jam") : t(`Waiting ${waited} h`, `Menunggu ${waited} jam`)}
                  {waited >= REVIEW_TARGET_H && t(`, past the ${REVIEW_TARGET_H} h target`, `, lewat target ${REVIEW_TARGET_H} jam`)}
                </Badge.Base>
              )}
              {l.lateListing && (
                <Badge.Base className="bg-secondary-gold-soft text-secondary-brown-dark text-xs flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {t("Listed close to doors", "Dipasang mepet acara")}
                </Badge.Base>
              )}
              <Badge.Base className={`text-xs flex items-center gap-1 ${risky ? "bg-secondary-orange-soft text-secondary-orange-dark" : "bg-secondary-green-soft text-secondary-green-dark"}`}>
                {risky ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                {t("Forgery score", "Skor pemalsuan")} {l.ai.forgeryScore}/100
              </Badge.Base>
              {l.ai.pdfSuspicious && (
                <Badge.Base className="bg-secondary-orange-soft text-secondary-orange-dark text-xs">
                  {t("PDF structure suspicious", "Struktur PDF mencurigakan")}
                </Badge.Base>
              )}
            </div>

            {l.checks && (
              <div data-listing-checks className="mt-3 rounded-2xl bg-secondary-gray-soft p-3 text-xs text-neutral-black flex flex-col gap-1">
                <span>
                  {l.checks.barcodes > 0
                    ? t(
                        `${l.checks.barcodes} barcode${l.checks.barcodes === 1 ? "" : "s"} read (${l.checks.formats.map(formatName).join(", ")}), each now held by this listing`,
                        `${l.checks.barcodes} barcode terbaca (${l.checks.formats.map(formatName).join(", ")}), semuanya kini dipegang listing ini`
                      )
                    : t("No barcode could be read", "Tidak ada barcode yang terbaca")}
                  {l.checks.scannedPages < l.checks.pages &&
                    t(` · read ${l.checks.scannedPages} of ${l.checks.pages} pages`, ` · terbaca ${l.checks.scannedPages} dari ${l.checks.pages} halaman`)}
                </span>
                {l.checks.producer && (
                  <span className="text-neutral-gray">
                    {t("Made by", "Dibuat dengan")}: {l.checks.producer}
                  </span>
                )}
                {l.checks.ai && (
                  <span data-listing-ai className={l.checks.ai.differs.length ? "text-secondary-orange-dark" : "text-neutral-gray"}>
                    {t("Read by", "Dibaca")} {l.checks.ai.model}:{" "}
                    {[
                      l.checks.ai.facts.tierPrinted,
                      l.checks.ai.facts.date,
                      l.checks.ai.facts.seat,
                      l.checks.ai.facts.printedPrice ? formatIDR(l.checks.ai.facts.printedPrice) : null,
                    ].filter(Boolean).join(" · ") || t("nothing printed", "tidak ada yang tercetak")}
                  </span>
                )}
                {l.checks.reasons.map((r) => (
                  <span key={r.code} className="flex items-start gap-1.5 text-secondary-orange-dark">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {reasonText(r, t)}
                  </span>
                ))}
                <a
                  href={`/api/listings/${encodeURIComponent(l.id)}/ticket`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-primary-navy font-medium w-fit"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> {t("Open the ticket PDF", "Buka PDF tiketnya")}
                </a>
              </div>
            )}

            <p className="text-xs text-neutral-gray mt-3">
              {why.includes("details_differ")
                ? (() => {
                    const d = l.checks?.ai?.differs ?? [];
                    const what = d.length > 1 ? ["another category and day", "kategori dan tanggal lain"] : d.includes("tier") ? ["another category", "kategori lain"] : ["another day", "tanggal lain"];
                    return t(
                      `Held because the ticket prints ${what[0]} than the seller picked. Check the PDF against the listing before clearing it: a cheaper ticket listed under a dearer category gets a higher price cap.`,
                      `Ditahan karena tiketnya mencetak ${what[1]} dari pilihan penjual. Cocokkan PDF-nya dengan listing sebelum diloloskan: tiket murah yang dipasang di kategori mahal dapat batas harga lebih tinggi.`
                    );
                  })()
                : why.includes("no_barcode")
                ? t(
                    "Held because no barcode could be read, so nothing stops the same ticket being listed twice. Read the code off the PDF and check it with the organiser before clearing it.",
                    "Ditahan karena tidak ada barcode yang terbaca, jadi tidak ada yang mencegah tiket yang sama dijual dua kali. Baca kodenya dari PDF dan cek ke organizer sebelum diloloskan."
                  )
                : why.includes("name_not_found")
                ? t(
                    "Held because the buyer's name the seller typed is not printed on the ticket, so its category and day were not read. Check them on the PDF against the listing before clearing it.",
                    "Ditahan karena nama pemesan yang diketik penjual tidak tercetak di tiket, jadi kategori dan tanggalnya tidak terbaca. Cocokkan di PDF-nya dengan listing sebelum diloloskan."
                  )
                : why.includes("unread_pages") && !why.includes("flagged")
                ? t(
                    "Held because not every page could be read in time. Look through the rest of the PDF for more tickets before clearing it.",
                    "Ditahan karena tidak semua halaman sempat dibaca. Periksa sisa PDF-nya, siapa tahu ada tiket lain, sebelum diloloskan."
                  )
                : l.lateListing && !risky
                ? t(
                    "Held on timing alone: the document reads clean, but last-minute listings are where duplicate-pass fraud concentrates.",
                    "Ditahan murni karena waktunya: dokumennya bersih, tapi listing menit terakhir adalah tempat penipuan tiket ganda menumpuk."
                  )
                : t(
                    "Held because the document itself looks off. Compare it against the organiser's original before clearing it.",
                    "Ditahan karena dokumennya sendiri mencurigakan. Bandingkan dengan versi asli organizer sebelum diloloskan."
                  )}
            </p>

            <div className="flex gap-3 mt-4">
              <Button.Primary
                className="flex items-center gap-2 text-sm"
                onClick={() => void decide(onApprove, l.id, () => toast.success(t("Listing cleared, now live", "Listing lolos, sekarang tayang")))}
              >
                <CheckCircle2 className="w-4 h-4" /> {t("Clear listing", "Loloskan listing")}
              </Button.Primary>
              <Button.Ghost tone="danger" className="text-sm" onClick={() => void decide(onReject, l.id, () => toast(t("Listing rejected", "Listing ditolak")))}>
                <XCircle className="w-4 h-4" /> {t("Reject", "Tolak")}
              </Button.Ghost>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminPage() {
  const t = useT();
  const ready = useAccessGuard("staff");
  const { formatIDR, formatMoney, formatEventDate } = useFormatters();
  const categoryLabel = useCategoryLabel();
  const mounted = useHydrated();
  const [confirmReq, setConfirmReq] = useState<EventRequest | null>(null);
  const requests = useEventRequests((s) => s.requests);
  const approve = useEventRequests((s) => s.approve);
  const reject = useEventRequests((s) => s.reject);
  const orders = useOrders((s) => s.orders);
  const resolveDispute = useOrders((s) => s.resolveDispute);
  const listings = useSellerListings((s) => s.listings);
  const approveListing = useSellerListings((s) => s.approve);
  const rejectListing = useSellerListings((s) => s.reject);
  const [tab, setTab] = useState<"claims" | "listings" | "events" | "shows" | "payments">("claims");
  // The order whose verdict is on its way, so the wait says what is actually happening.
  const [sending, setSending] = useState<Order | null>(null);

  // Staff signed in with an account rule on the claims in the database; a sample admin on the
  // sample orders in this browser.
  const account = useUser((s) => !!s.user?.account);
  const { orders: openClaims, error: claimsError, refresh: refreshClaims } = useAccountOrders(account ? { openClaims: true } : null);
  const disputes = account ? (openClaims ?? []).filter((o) => o.escrowStatus === "DISPUTED") : orders.filter((o) => o.escrowStatus === "DISPUTED");
  // Staff with an account review the listings accounts posted; a sample admin the ones in this browser.
  const router = useRouter();
  const { listings: heldListings, refresh: refreshHeld } = useAccountListings(account ? { review: true } : null);
  const held = account ? heldListings ?? [] : listings.filter((l) => l.status === "review");
  const decideListing = async (id: string, action: "approve" | "reject") => {
    if (!account) return action === "approve" ? approveListing(id) : rejectListing(id);
    await listingAction(id, action);
    refreshHeld();
    // A cleared listing goes on sale, and the catalogue sits in the root layout.
    if (action === "approve") router.refresh();
  };
  const pendingEvents = requests.filter((r) => r.status === "pending");
  // QRIS money that needs a person: read on arrival for the count, and again whenever the tab opens.
  const payments = usePaymentsOverview(account);
  const refreshPayments = payments.refresh;
  useEffect(() => {
    if (tab === "payments") refreshPayments();
  }, [tab, refreshPayments]);

  // Three queues, each with its own rhythm. Kept apart so a busy day in one
  // does not bury the others, and so a count is visible before opening any.
  const TABS = [
    { id: "claims" as const, en: "Claims", id_: "Klaim", Icon: Scale, count: disputes.length },
    { id: "listings" as const, en: "Listings held", id_: "Listing ditahan", Icon: Ticket, count: held.length },
    { id: "events" as const, en: "New events", id_: "Event baru", Icon: Calendar, count: pendingEvents.length },
    // Cancelling acts on real orders, so it is there for staff signed in with an account.
    ...(account
      ? [
          { id: "shows" as const, en: "Shows", id_: "Acara", Icon: CalendarX, count: 0 },
          {
            id: "payments" as const,
            en: "Payments",
            id_: "Pembayaran",
            Icon: Banknote,
            count: (payments.data?.needsRefund.length ?? 0) + (payments.data?.stuck.length ?? 0),
          },
        ]
      : []),
  ];
  const doApprove = (r: EventRequest) => { approve(r.id); toast.success(t("Event approved, tickets can be listed", "Event disetujui, tiketnya boleh dijual")); };

  const toastVerdict = (remedy: Remedy) =>
    toast.success(
      remedy === "RELEASE_SELLER"
        ? t("Closed, funds released to the seller", "Ditutup, dana cair ke penjual")
        : t(`Upheld: ${REMEDY_LABEL[remedy].en.toLowerCase()}`, `Dikabulkan: ${REMEDY_LABEL[remedy].id.toLowerCase()}`)
    );

  const doResolve = async (o: Order, remedy: Remedy) => {
    // The server rules on an account's claim: it writes the rationale from the same evidence
    // checks and, on a chain order, has the contract split the money first.
    if (account) {
      setSending(o);
      try {
        await orderAction(o.id, { action: "verdict", remedy });
        toastVerdict(remedy);
      } catch (e) {
        toast.error(`${t("The verdict was not recorded", "Putusan gagal dicatat")}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setSending(null);
        refreshClaims();
      }
      return;
    }
    const check = checkEvidence(o, o.dispute!.reason, o.dispute!.evidence, o.dispute!.openedAtISO);
    const rationale = verdictRationale(o, o.dispute!, check, remedy);
    // An on-chain order is only settled once the contract has carried the verdict out.
    let onchain: ChainSettlement | undefined;
    if (o.chain) {
      setSending(o);
      try {
        const toBuyer = onchainToBuyer(o, remedy);
        const r = await chainAction(o.chain.listingId, "resolve", toBuyer);
        onchain = { escrowStatus: toBuyer === "0" ? "RELEASED" : "REFUNDED", tx: r.tx, withdrawals: r.withdrawals };
      } catch (e) {
        toast.error(`${t("The contract refused the verdict", "Kontrak menolak putusan")}: ${e instanceof Error ? e.message : String(e)}`);
        return;
      } finally {
        setSending(null);
      }
    }
    resolveDispute(o.id, remedy, rationale, onchain);
    toastVerdict(remedy);
  };

  if (!ready) return <PageGate />;

  return (
    <PageContainer width="app">
      <h1 className="text-2xl md:text-3xl font-bold text-neutral-black">{t("Admin console", "Konsol admin")}</h1>
      <p className="text-neutral-gray text-sm mt-1">
        {account
          ? t("What needs a person: money in dispute, listings held back, events waiting to open, shows that changed, and payments owed back.",
              "Yang butuh tangan orang: dana yang disengketakan, listing yang ditahan, event yang menunggu dibuka, acara yang berubah, dan pembayaran yang harus dikembalikan.")
          : t("Three queues: money in dispute, listings held back, and events waiting to open.",
              "Tiga antrian: dana yang disengketakan, listing yang ditahan, dan event yang menunggu dibuka.")}
      </p>

      <div className="flex flex-wrap gap-2 mt-5 mb-6">
        {TABS.map((x) => (
          <button
            key={x.id}
            onClick={() => setTab(x.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm border transition cursor-pointer active:scale-95 ${
              tab === x.id
                ? "bg-primary-navy text-white border-primary-navy"
                : "bg-neutral-white text-neutral-gray border-neutral-light-gray-1 hover:border-primary-navy"
            }`}
          >
            <x.Icon className="w-4 h-4" /> {t(x.en, x.id_)}
            {x.count > 0 && (
              <span className={`text-xs rounded-full px-1.5 ${tab === x.id ? "bg-white/20" : "bg-secondary-blue-soft text-lummy-500"}`}>
                {x.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Arbitration queue: refunds are decided here, never automatically */}
      {mounted && tab === "claims" && account && !openClaims && (
        claimsError ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-neutral-gray text-sm">{t("Claims could not be loaded. Check your connection.", "Klaim gagal dimuat. Cek koneksimu.")}</p>
            <Button.Ghost className="text-sm" onClick={refreshClaims}>{t("Try again", "Coba lagi")}</Button.Ghost>
          </div>
        ) : (
          <p className="text-neutral-gray text-sm">{t("Loading...", "Memuat...")}</p>
        )
      )}
      {mounted && tab === "claims" && (!account || openClaims) && disputes.length === 0 && (
        <EmptyQueue text={t("No claims open. Escrow is settling on its own.", "Tidak ada klaim terbuka. Escrow berjalan sendiri.")} />
      )}
      {mounted && tab === "claims" && disputes.length > 0 && (
        <div>
          <p className="text-sm text-neutral-gray mb-4">
            {t(
              "Refunds are not automatic. The seller wins by default unless gate-time evidence holds up. The checks below are signals, the call is yours.",
              "Refund tidak otomatis. Default-nya penjual menang, kecuali bukti dari gate kredibel. Pemeriksaan di bawah cuma sinyal, keputusan tetap di kamu."
            )}
          </p>
          <div data-reveal="stagger" className="flex flex-col gap-4">
            {disputes.map((o) => {
              const check = checkEvidence(o, o.dispute!.reason, o.dispute!.evidence, o.dispute!.openedAtISO);
              const suggested = suggestedRemedy(o, o.dispute!.reason, check);
              const penalty = penaltyFor(o.dispute!.reason, false, o.amount);
              return (
                <div key={o.id} data-claim={o.id} className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-neutral-black truncate">{o.eventTitle}</h3>
                      <div className="text-xs text-neutral-gray mt-1">
                        {formatEventDate(o.eventDateISO)} · {o.tierName} · {t("Seller", "Penjual")} {o.sellerName}
                      </div>
                    </div>
                    <span className="tabular-nums font-bold text-lummy-500 text-nowrap">{formatMoney(o.amount, o.currency)}</span>
                  </div>

                  <EvidencePanel order={o} />

                  {!(o.dispute!.replies ?? []).some((r) => r.fromSeller) && (
                    <p className="text-xs text-secondary-brown-dark bg-secondary-gold-soft rounded-xl px-3 py-2 mt-3">
                      {t(
                        "The seller has not answered yet. You can still rule, but a decision reads better once both sides are on file.",
                        "Penjual belum menjawab. Kamu tetap boleh memutus, tapi putusannya lebih kuat kalau kedua sisi sudah masuk."
                      )}
                    </p>
                  )}
                  <p className="text-xs text-neutral-gray mt-3 flex gap-2">
                    <Gavel className="w-4 h-4 shrink-0 text-neutral-gray mt-0.5" />
                    <span>
                      {t("Suggested", "Saran")}: <b className="text-neutral-black">{t(REMEDY_LABEL[suggested].en.toLowerCase(), REMEDY_LABEL[suggested].id.toLowerCase())}</b>.{" "}
                      {t(suggestedRationale(o.dispute!, check).en, suggestedRationale(o.dispute!, check).id)}
                    </span>
                  </p>

                  {/* Remedy ladder: seat them, correct the price, refund, or pay the seller. */}
                  <div className="grid sm:grid-cols-2 gap-2 mt-4">
                    {remedyOptions(o, o.dispute!.reason).map((opt) => {
                      const isSuggested = opt.remedy === suggested;
                      const pays = opt.remedy !== "RELEASE_SELLER";
                      return (
                        <button
                          key={opt.remedy}
                          onClick={() => doResolve(o, opt.remedy)}
                          className={`text-left p-3 rounded-2xl border-2 transition cursor-pointer ${isSuggested ? "border-primary-navy bg-secondary-blue-light" : "border-neutral-light-gray-1 hover:border-primary-navy"}`}
                        >
                          <div className="flex items-center gap-2 text-sm font-medium text-neutral-black">
                            {pays ? <CheckCircle2 className="w-4 h-4 text-secondary-green-dark shrink-0" /> : <XCircle className="w-4 h-4 text-neutral-gray shrink-0" />}
                            {t(opt.label.en, opt.label.id)}
                            {opt.amount > 0 && <span className="ml-auto text-xs tabular-nums font-bold text-lummy-500">{formatMoney(opt.amount, o.currency)}</span>}
                          </div>
                          <p className="text-xs text-neutral-gray mt-1">{t(opt.note.en, opt.note.id)}</p>
                        </button>
                      );
                    })}
                  </div>

                  <p className="text-xs text-neutral-gray mt-3">
                    {penalty > 0
                      ? t(
                          `Anything other than paying the seller also costs them a penalty of ${SELLER_PENALTY_PCT}% of the sale, ${formatMoney(penalty, o.currency)}${penaltyNote(!!o.chain || o.currency === "USDC").en}, on top of losing it. That is what makes a bad listing cost more than it earns.`,
                          `Selain mencairkan ke penjual, semua opsi juga membebani penjual penalti ${SELLER_PENALTY_PCT}% dari nilai transaksi, ${formatMoney(penalty, o.currency)}${penaltyNote(!!o.chain || o.currency === "USDC").id}, di luar kehilangan penjualannya. Itu yang bikin listing bermasalah lebih mahal daripada hasilnya.`
                        )
                      : t(
                          "The ticket was genuine and was refused over the name, with the seller's ID card staged. A refund here charges the seller nothing beyond losing the sale.",
                          "Tiketnya asli dan ditolak karena nama, dengan KTP penjual sudah disiapkan. Refund di sini tidak membebani penjual apa pun selain kehilangan penjualannya."
                        )}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* These two queues still run on sample data; say so to staff signed in with an account. */}
      {account && tab === "events" && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-neutral-gray mb-4">
          <SampleBadge />
          {t("This queue is not in the database yet. Claims and listings are.", "Antrean ini belum di database. Klaim dan listing sudah.")}
        </p>
      )}

      {mounted && tab === "listings" && account && !heldListings && (
        <p className="text-neutral-gray text-sm">{t("Loading...", "Memuat...")}</p>
      )}
      {mounted && tab === "listings" && (!account || heldListings) && (
        <ListingQueue
          held={held}
          onApprove={(id) => decideListing(id, "approve")}
          onReject={(id) => decideListing(id, "reject")}
          sampleFiles={account}
        />
      )}

      {mounted && account && tab === "shows" && <ShowsPanel />}
      {mounted && account && tab === "payments" && <PaymentsPanel data={payments.data} error={payments.error} refresh={payments.refresh} />}

      {tab === "events" && (
      <>
      <div className="flex items-start gap-2 text-sm text-neutral-gray bg-secondary-blue-extra rounded-2xl p-4 mb-6">
        <Sparkles className="w-4 h-4 text-lummy-500 shrink-0 mt-0.5" />
        <span>{t(
          "New events are verified before their tickets can be sold. The details start from the first seller's listing. Face value is a pre-fill: check it against the official source before approving.",
          "Event baru diverifikasi sebelum tiketnya boleh dijual. Data awalnya dari listing penjual pertama. Harga asli itu isian awal: cek ke sumber resmi sebelum menyetujui."
        )}</span>
      </div>

      {!mounted ? (
        <p className="text-neutral-gray text-sm">{t("Loading...", "Memuat...")}</p>
      ) : (
        <div data-reveal="stagger" className="flex flex-col gap-4">
          {requests.map((r) => (
            <div key={r.id} className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-lg text-neutral-black">{r.title}</h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-gray mt-1">
                    <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-primary-navy" /> {formatEventDate(r.dateISO)}</span>
                    <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-primary-navy" /> {r.venue}, {r.city}</span>
                    <Badge.Base className="bg-secondary-blue-soft text-lummy-500 text-xs">{categoryLabel(r.category)}</Badge.Base>
                  </div>
                  <div className="text-xs text-neutral-gray mt-1">{t("Submitted by", "Diajukan oleh")} {r.submittedBy}</div>
                </div>
                {r.status !== "pending" && (
                  <Badge.Base className={r.status === "approved" ? "bg-secondary-green-soft text-secondary-green-dark text-xs" : "bg-secondary-pink-soft text-secondary-pink-dark text-xs"}>
                    {r.status === "approved" ? t("Approved", "Disetujui") : t("Rejected", "Ditolak")}
                  </Badge.Base>
                )}
              </div>

              <div className="mt-4 bg-secondary-gray-soft rounded-2xl p-4">
                <div className="text-xs text-neutral-gray mb-2">{t("Face value per tier", "Harga asli per tier")} <span className="text-neutral-black">{t("(verify against the organiser, not just the PDF)", "(cek ke organizer, jangan cuma dari PDF)")}</span></div>
                <div className="flex flex-wrap gap-2">
                  {r.faceValues.map((f) => {
                    const fromPdf = f.tier === r.pdfTier;
                    return (
                      <span key={f.tier} className={`text-sm rounded-lg px-3 py-1.5 flex items-center gap-1.5 ${fromPdf ? "bg-secondary-blue-soft border border-lummy-500 text-neutral-black" : "bg-neutral-white border border-neutral-light-gray-1 text-neutral-black"}`}>
                        {f.tier} <b className="text-lummy-500">{formatIDR(f.value)}</b>
                        {fromPdf && <span className="text-[10px] text-lummy-500 font-medium">{t("from PDF", "dari PDF")}</span>}
                      </span>
                    );
                  })}
                </div>
                <div className="text-xs text-neutral-gray mt-3 flex flex-wrap items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-lummy-500 shrink-0" />
                  {t("The seller's PDF shows only", "PDF penjual cuma memuat")} <b className="text-neutral-black">{t("one tier", "satu tier")}</b> ({r.pdfTier}). {t("An admin fills in the rest from", "Sisanya dilengkapi admin dari")}
                  <a href={`https://${r.organizerRef}`} target="_blank" rel="noreferrer" className="text-primary-navy font-medium hover:opacity-80 inline-flex items-center gap-0.5">{r.organizerRef} <ExternalLink className="w-3 h-3" /></a>
                </div>
              </div>

              <div className={`mt-3 flex items-center gap-2 text-sm rounded-xl p-3 ${r.pdfSuspicious || r.forgeryScore >= 60 ? "bg-secondary-orange-soft text-secondary-orange-dark" : "bg-secondary-green-soft text-secondary-green-dark"}`}>
                {r.pdfSuspicious || r.forgeryScore >= 60 ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                {t("Forgery score", "Skor pemalsuan")} {r.forgeryScore}/100 {r.pdfSuspicious ? t("· PDF structure looks tampered with", "· struktur PDF mencurigakan") : t("· PDF is clean", "· PDF bersih")}
              </div>

              {r.status === "pending" && (
                // The recommended call is the raised button; the other one is still there, just quieter.
                <div className="flex flex-wrap gap-3 mt-4">
                  {r.pdfSuspicious || r.forgeryScore >= 60 ? (
                    <>
                      <Button.Primary className="flex items-center gap-2 text-sm" onClick={() => { reject(r.id); toast(t("Event rejected", "Event ditolak")); }}>
                        <XCircle className="w-4 h-4" /> {t("Reject", "Tolak")}
                      </Button.Primary>
                      <Button.Ghost tone="warning" className="text-sm" onClick={() => setConfirmReq(r)}>
                        <AlertTriangle className="w-4 h-4" /> {t("Approve anyway", "Tetap setujui")}
                      </Button.Ghost>
                    </>
                  ) : (
                    <>
                      <Button.Primary className="flex items-center gap-2 text-sm" onClick={() => doApprove(r)}>
                        <CheckCircle2 className="w-4 h-4" /> {t("Approve", "Setujui")}
                      </Button.Primary>
                      <Button.Ghost tone="danger" className="text-sm" onClick={() => { reject(r.id); toast(t("Event rejected", "Event ditolak")); }}>
                        <XCircle className="w-4 h-4" /> {t("Reject", "Tolak")}
                      </Button.Ghost>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      </>
      )}

      <Modal open={!!confirmReq} onClose={() => setConfirmReq(null)} title={t("Approve a flagged ticket?", "Setujui tiket ter-flag?")}>
        {confirmReq && (
          <>
            <p className="text-sm text-neutral-gray">
              <b className="text-neutral-black">{confirmReq.title}</b> {t("was flagged by the checks", "kena flag pengecekan")} ({t("score", "skor")} {confirmReq.forgeryScore}/100{confirmReq.pdfSuspicious ? t(", PDF structure looks tampered with", ", struktur PDF mencurigakan") : ""}).
              {t(" Approving lets this ticket be sold. Make sure you checked the document by hand.", " Menyetujui berarti tiket ini boleh dijual. Pastikan kamu sudah cek dokumennya manual.")}
            </p>
            <div className="flex gap-3 mt-5">
              <Button.Ghost className="flex-1 text-sm" onClick={() => setConfirmReq(null)}>{t("Cancel", "Batal")}</Button.Ghost>
              <Button.Primary wrapperClass="flex-1" className="w-full text-sm" onClick={() => { doApprove(confirmReq); setConfirmReq(null); }}>{t("Yes, approve", "Ya, setujui")}</Button.Primary>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!sending} onClose={() => {}}>
        <div className="flex flex-col items-center gap-3 py-4">
          <Loader2 className="w-8 h-8 text-lummy-500 animate-spin" />
          <p className="font-semibold text-neutral-black">
            {sending?.chain ? t("Sending the verdict to the contract...", "Mengirim putusan ke kontrak...") : t("Recording the verdict...", "Mencatat putusan...")}
          </p>
          <p className="text-sm text-neutral-gray text-center">
            {sending?.chain ? t("The contract splits the money, then pays each side.", "Kontrak membagi dananya, lalu mengirim ke tiap pihak.") : t("One moment.", "Sebentar.")}
          </p>
        </div>
      </Modal>
    </PageContainer>
  );
}
