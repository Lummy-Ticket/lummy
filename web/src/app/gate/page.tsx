"use client";

// The door of a show, for staff standing in for the organiser (docs/09 §8). Point the camera at a
// buyer's Lummy pass, or at a ticket's own barcode, or paste the code. A ticket goes in once: the
// first scan is admitted and every later one refused, and when a Lummy buyer's pass is refused
// because the ticket went in before on someone else's copy, the buyer is refunded right there.
import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { Camera, CameraOff, CheckCircle2, CircleHelp, DoorOpen, Loader2, ScanLine, Users, XCircle } from "lucide-react";
import { NativeSelect } from "@/components/ui/select-menu";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageGate } from "@/components/layout/PageGate";
import { useAccessGuard } from "@/lib/access";
import { useCatalogue } from "@/lib/catalogue";
import { useFormatters, useT } from "@/lib/i18n";
import { penaltyNote, useUser } from "@/lib/mock";

// The camera only exists in the browser.
const Scanner = dynamic(() => import("@yudiel/react-qr-scanner").then((m) => m.Scanner), {
  ssr: false,
  loading: () => <div className="aspect-square w-full rounded-3xl bg-neutral-light-gray-1 animate-pulse" />,
});

type Words = { en: string; id: string };

type Outcome = {
  result: "admitted" | "refused" | "unknown";
  reason?: string;
  credential?: string;
  orderId?: string;
  eventTitle?: string;
  tierName?: string;
  quantity?: number;
  firstUse?: { at: string; credential: string; byThisBuyer: boolean };
  refund?: { amount: number; penalty: number; onChain: boolean } | { error: string };
};

type ScanRow = {
  id: number;
  order_id: string | null;
  credential: string;
  result: string;
  reason: string | null;
  gate: string;
  created_at: string;
  orders: { tier_name: string; quantity: number } | null;
};

const CREDENTIAL: Record<string, Words> = {
  pass: { en: "Lummy pass", id: "Pass Lummy" },
  barcode: { en: "ticket barcode", id: "barcode tiket" },
  copy: { en: "a copy", id: "salinan" },
};

const REASON: Record<string, Words> = {
  ALREADY_USED: { en: "already used", id: "sudah dipakai" },
  ALREADY_ADMITTED: { en: "already inside", id: "sudah di dalam" },
  WRONG_SHOW: { en: "another show", id: "acara lain" },
  ORDER_CLOSED: { en: "order closed", id: "pesanan sudah ditutup" },
  BAD_PASS: { en: "not a valid pass", id: "pass tidak sah" },
  NOT_LUMMY: { en: "not sold through Lummy", id: "bukan dari Lummy" },
  LIVE_MONEY: { en: "paid with real money", id: "dibayar uang sungguhan" },
};

/** A pass code, or an order id typed in: the order it names. */
const orderFrom = (text: string) => {
  const v = text.trim();
  const pass = /^LUMMY1\.([\w-]{1,64})\./.exec(v);
  return pass ? pass[1] : /^[\w-]{1,64}$/.test(v) ? v : "";
};

function ResultCard({ o }: { o: Outcome }) {
  const t = useT();
  const { formatIDR, formatDateTime } = useFormatters();
  const what = o.credential ? CREDENTIAL[o.credential] : null;
  const ticket = [o.eventTitle, o.tierName, o.quantity ? t(`${o.quantity} ticket(s)`, `${o.quantity} tiket`) : ""].filter(Boolean).join(" · ");

  if (o.result === "unknown") {
    return (
      <div data-gate-result="unknown" className="rounded-3xl bg-neutral-light-gray-1 p-6 text-center">
        <CircleHelp className="w-10 h-10 mx-auto text-neutral-gray" />
        <div className="font-bold text-2xl text-neutral-black mt-2">{t("Not a Lummy ticket", "Bukan tiket Lummy")}</div>
        <p className="text-sm text-neutral-gray mt-2">
          {t("This code was never sold through Lummy. The organiser's own system decides on it.", "Kode ini tidak pernah dijual lewat Lummy. Sistem penyelenggara sendiri yang memutuskan.")}
        </p>
      </div>
    );
  }

  if (o.result === "admitted") {
    return (
      <div data-gate-result="admitted" className="rounded-3xl bg-secondary-blue-extra border-2 border-secondary-green-dark p-6 text-center">
        <CheckCircle2 className="w-12 h-12 mx-auto text-secondary-green-dark" />
        <div className="font-bold text-3xl text-secondary-green-dark mt-2">{t("Admitted", "Silakan masuk")}</div>
        {ticket && <div className="text-sm text-neutral-black mt-2">{ticket}</div>}
        {what && <div className="text-xs text-neutral-gray mt-1">{t(`On ${what.en}`, `Lewat ${what.id}`)}</div>}
        {o.credential === "copy" && (
          <p className="text-xs text-neutral-gray mt-3">
            {t("A copy of this order's ticket went in first. Now scan the buyer's pass.", "Salinan tiket pesanan ini masuk lebih dulu. Sekarang pindai pass pembelinya.")}
          </p>
        )}
      </div>
    );
  }

  const reason = o.reason ? REASON[o.reason] : null;
  const refund = o.refund && "amount" in o.refund ? o.refund : null;
  const refundError = o.refund && "error" in o.refund ? o.refund.error : null;
  return (
    <div data-gate-result="refused" data-gate-reason={o.reason} className="rounded-3xl bg-secondary-pink-soft border-2 border-secondary-orange-dark p-6 text-center">
      <XCircle className="w-12 h-12 mx-auto text-secondary-orange-dark" />
      <div className="font-bold text-3xl text-secondary-orange-dark mt-2">{t("Refused", "Ditolak")}</div>
      {reason && <div className="text-sm font-medium text-neutral-black mt-1">{t(reason.en, reason.id)}</div>}
      {ticket && <div className="text-sm text-neutral-black mt-2">{ticket}</div>}
      {o.firstUse && (
        <p className="text-sm text-neutral-gray mt-3">
          {o.firstUse.byThisBuyer
            ? t(`This pass already went in at ${formatDateTime(o.firstUse.at)}. The holder is inside.`, `Pass ini sudah masuk ${formatDateTime(o.firstUse.at)}. Pemiliknya sudah di dalam.`)
            : o.credential === "pass"
              ? t(
                  `The ticket already went in at ${formatDateTime(o.firstUse.at)} on ${CREDENTIAL[o.firstUse.credential]?.en ?? "something else"}, not on this pass.`,
                  `Tiketnya sudah masuk ${formatDateTime(o.firstUse.at)} lewat ${CREDENTIAL[o.firstUse.credential]?.id ?? "yang lain"}, bukan lewat pass ini.`
                )
              : t(`This ticket already went in at ${formatDateTime(o.firstUse.at)}.`, `Tiket ini sudah masuk ${formatDateTime(o.firstUse.at)}.`)}
        </p>
      )}
      {refund && (
        <div data-gate-refund className="mt-4 rounded-2xl bg-neutral-white p-4 text-left">
          <div className="text-sm font-semibold text-neutral-black">{t("The buyer is refunded, right now", "Pembeli direfund, saat ini juga")}</div>
          <p className="text-xs text-neutral-gray mt-1">
            {t(
              `${formatIDR(refund.amount)} back to the buyer${refund.onChain ? ", through the escrow contract" : ""}. The seller owes a penalty of ${formatIDR(refund.penalty)}${penaltyNote(refund.onChain).en} for selling a ticket that was used. No claim to file, nobody to judge it: the gate's record is the proof.`,
              `${formatIDR(refund.amount)} kembali ke pembeli${refund.onChain ? ", lewat kontrak escrow" : ""}. Penjual kena penalti ${formatIDR(refund.penalty)}${penaltyNote(refund.onChain).id} karena menjual tiket yang sudah dipakai. Tanpa klaim, tanpa perlu diputus: catatan gate inilah buktinya.`
            )}
          </p>
        </div>
      )}
      {refundError && (
        <p className="mt-4 text-xs text-secondary-orange-dark">
          {t("The refund did not go through here; staff should settle it from the admin console", "Refund belum berhasil di sini; staf perlu menyelesaikannya dari konsol admin")}: {refundError}
        </p>
      )}
    </div>
  );
}

function GateDoor() {
  const t = useT();
  const ready = useAccessGuard("staff");
  const { formatDateTime, formatEventDate } = useFormatters();
  const account = useUser((s) => !!s.user?.account);
  const catalogue = useCatalogue();
  const params = useSearchParams();
  const shows = useMemo(() => [...catalogue.events].sort((a, b) => a.dateISO.localeCompare(b.dateISO)), [catalogue.events]);
  const [eventId, setEventId] = useState(params.get("event") ?? "");
  const [gate, setGate] = useState("Gate 1");
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [copyOf, setCopyOf] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [log, setLog] = useState<{ scans: ScanRow[]; admitted: number; refused: number } | null>(null);
  // The camera sees the same code many times a second: one read per code until the next one shows up.
  const lastRead = useRef({ code: "", at: 0 });

  useEffect(() => {
    if (!eventId && shows.length) setEventId(shows[0].id);
  }, [eventId, shows]);

  const loadLog = useCallback(async () => {
    if (!eventId) return;
    const r = await fetch(`/api/gate?event=${encodeURIComponent(eventId)}`, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setLog(await r.json());
  }, [eventId]);
  useEffect(() => {
    void loadLog();
  }, [loadLog]);

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await fetch("/api/gate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventId, gate, ...body }) });
      const j = (await r.json().catch(() => ({}))) as Outcome & { error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setOutcome(j);
      // Whoever stands at the door feels the answer before reading it: one short buzz in, three out.
      navigator.vibrate?.(j.result === "admitted" ? 80 : j.result === "refused" ? [90, 60, 90, 60, 90] : 0);
      // The field is ready for the next person; the answer stays on screen.
      if (typeof body.code === "string") setCode("");
      void loadLog();
    } catch (e) {
      toast.error(`${t("Not checked", "Gagal dicek")}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const read = (text: string) => {
    const now = Date.now();
    if (busy || (text === lastRead.current.code && now - lastRead.current.at < 4000)) return;
    lastRead.current = { code: text, at: now };
    void send({ code: text });
  };

  if (!ready) return <PageGate />;

  if (!account) {
    return (
      <PageContainer width="form">
        <h1 className="text-2xl font-bold text-neutral-black">{t("Gate scanner", "Pemindai gate")}</h1>
        <p className="text-sm text-neutral-gray mt-2">
          {t("The gate works on real orders, so it needs a staff account. Sign in with one, or use the demo admin account from the Dev Panel.", "Gate bekerja pada pesanan sungguhan, jadi butuh akun staf. Masuk dengan akun itu, atau pakai akun admin demo dari Dev Panel.")}
        </p>
      </PageContainer>
    );
  }

  const field = "rounded-xl border border-lummy-500 px-4 py-2.5 text-sm text-neutral-black outline-none bg-neutral-white";
  return (
    <PageContainer width="form">
      <div className="text-xs font-semibold text-lummy-500 flex items-center gap-1.5">
        <DoorOpen className="w-4 h-4" /> {t("At the door", "Di pintu masuk")}
      </div>
      <h1 className="text-2xl md:text-3xl font-bold text-neutral-black mt-2">{t("Gate scanner", "Pemindai gate")}</h1>
      <p className="text-sm text-neutral-gray mt-2">
        {t(
          "Standing in for the organiser's door. A ticket goes in once: the first scan is admitted, any later scan of it is refused. When a Lummy buyer's pass is refused because the ticket went in before, the buyer is refunded right here.",
          "Menggantikan pintu masuk penyelenggara. Satu tiket cuma bisa masuk sekali: scan pertama masuk, scan berikutnya ditolak. Kalau pass pembeli Lummy ditolak karena tiketnya sudah lebih dulu masuk, pembeli langsung direfund di sini."
        )}
      </p>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-[1fr_9rem] gap-3">
        <label className="flex flex-col gap-1.5 text-xs text-neutral-gray">
          {t("Show", "Acara")}
          <NativeSelect data-gate-show value={eventId} onChange={(e) => { setEventId(e.target.value); setOutcome(null); }}>
            {shows.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title} · {formatEventDate(e.dateISO)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-neutral-gray">
          {t("Gate", "Gate")}
          <input value={gate} onChange={(e) => setGate(e.target.value)} maxLength={40} className={`${field} h-12`} />
        </label>
      </div>

      <div className="mt-5">
        {camera ? (
          <div className="rounded-3xl overflow-hidden border border-neutral-light-gray-1">
            <Scanner onScan={(codes) => codes[0]?.rawValue && read(codes[0].rawValue)} paused={busy} scanDelay={600} sound={false} onError={() => toast.error(t("The camera could not start", "Kamera tidak bisa dibuka"))} />
          </div>
        ) : (
          <button onClick={() => setCamera(true)} className="w-full aspect-[4/3] rounded-3xl border-2 border-dashed border-lummy-500 flex flex-col items-center justify-center gap-2 text-primary-navy hover:bg-secondary-blue-extra transition cursor-pointer">
            <Camera className="w-8 h-8" />
            <span className="text-sm font-medium">{t("Start the camera", "Nyalakan kamera")}</span>
          </button>
        )}
        <div className="mt-2 flex justify-between items-center">
          {camera && (
            <button onClick={() => setCamera(false)} className="text-xs text-neutral-gray inline-flex items-center gap-1 hover:text-primary-navy cursor-pointer">
              <CameraOff className="w-3.5 h-3.5" /> {t("Stop the camera", "Matikan kamera")}
            </button>
          )}
        </div>
      </div>

      <form
        className="mt-4 flex flex-col sm:flex-row gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) void send({ code });
        }}
      >
        <input
          data-gate-code
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t("Or paste the code from a pass or a ticket", "Atau tempel kode dari pass atau tiket")}
          className={`${field} flex-1 min-w-0 font-mono`}
        />
        <Button.Ghost type="submit" disabled={busy || !code.trim() || !eventId} className="text-sm flex items-center gap-1.5">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />} {t("Check", "Cek")}
        </Button.Ghost>
      </form>

      <div className="mt-5" role="status" aria-live="polite">
        {outcome && <ResultCard o={outcome} />}
      </div>

      {log && (
        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-lg text-neutral-black">{t("At this door", "Di pintu ini")}</h2>
            <span className="text-xs text-neutral-gray inline-flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> {t(`${log.admitted} in · ${log.refused} refused`, `${log.admitted} masuk · ${log.refused} ditolak`)}
            </span>
          </div>
          {log.scans.length === 0 ? (
            <p className="text-sm text-neutral-gray mt-2">{t("Nobody scanned yet.", "Belum ada yang dipindai.")}</p>
          ) : (
            <ul className="mt-2 bg-neutral-white rounded-3xl border border-neutral-light-gray-1 px-5">
              {log.scans.map((s) => (
                <li key={s.id} className="py-2.5 border-b border-dashed border-neutral-light-gray-1 last:border-0 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="text-neutral-black truncate">
                      {t(CREDENTIAL[s.credential]?.en ?? s.credential, CREDENTIAL[s.credential]?.id ?? s.credential)}
                      {s.orders && <span className="text-neutral-gray"> · {s.orders.tier_name}</span>}
                    </div>
                    <div className="text-xs text-neutral-gray">
                      {formatDateTime(s.created_at)} · {s.gate}
                      {s.order_id && <span className="font-mono"> · {s.order_id}</span>}
                    </div>
                  </div>
                  <span className={`text-xs font-medium shrink-0 ${s.result === "admitted" ? "text-secondary-green-dark" : "text-secondary-orange-dark"}`}>
                    {s.result === "admitted" ? t("in", "masuk") : t(`refused (${REASON[s.reason ?? ""]?.en ?? s.reason})`, `ditolak (${REASON[s.reason ?? ""]?.id ?? s.reason})`)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Presenter demo: show what happens when a seller kept a copy and someone else used it first. */}
      <section className="mt-8 rounded-3xl bg-secondary-gold-soft/60 p-5">
        <h2 className="font-semibold text-sm text-neutral-black">{t("Demo: the seller kept a copy", "Demo: penjual menyimpan salinan")}</h2>
        <p className="text-xs text-neutral-gray mt-1">
          {t(
            "Paste a buyer's pass code (or its order number) and let a copy of that ticket go in first. Then scan the buyer's real pass: it is refused, and the refund happens on the spot. Off for orders paid with real money.",
            "Tempel kode pass pembeli (atau nomor pesanannya) lalu biarkan salinan tiketnya masuk lebih dulu. Lalu pindai pass asli pembeli: ditolak, dan refund terjadi saat itu juga. Mati untuk pesanan yang dibayar uang sungguhan."
          )}
        </p>
        <form
          className="mt-3 flex flex-col sm:flex-row gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const orderId = orderFrom(copyOf);
            if (orderId) void send({ action: "copy", orderId });
          }}
        >
          <input value={copyOf} onChange={(e) => setCopyOf(e.target.value)} placeholder={t("Pass code or order number", "Kode pass atau nomor pesanan")} className={`${field} flex-1 min-w-0 font-mono`} />
          <Button.Ghost type="submit" disabled={busy || !orderFrom(copyOf) || !eventId} className="text-sm">
            {t("A copy goes in first", "Salinan masuk duluan")}
          </Button.Ghost>
        </form>
      </section>
    </PageContainer>
  );
}

export default function GatePage() {
  const t = useT();
  return (
    <Suspense fallback={<div className="pt-28 pb-16 text-center text-neutral-gray">{t("Loading...", "Memuat...")}</div>}>
      <GateDoor />
    </Suspense>
  );
}
