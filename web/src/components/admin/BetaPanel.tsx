"use client";

// The beta at a glance for staff (tasks 11.7): what accounts did in each of the last four weeks,
// from /api/admin/metrics. Read at the weekly meeting; nothing here tracks a visitor.
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BetaMetrics, MetricRow } from "@/lib/admin/metrics";
import { FEATURES } from "@/lib/features";
import { useT } from "@/lib/i18n";
import { useUser } from "@/lib/mock";

/**
 * One test email to the staff member's own address over the server's mail settings
 * (api/admin/email-test), so the SMTP credentials in Vercel are proven before the emails flag goes on
 * (tasks 11.3), and again whenever the mailbox password changes.
 */
function EmailTest() {
  const t = useT();
  const email = useUser((s) => s.user?.email ?? "");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/email-test", { method: "POST" });
      const body = (await r.json().catch(() => ({}))) as { error?: string; to?: string };
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      toast.success(
        t(
          `Sent to ${body.to}. Check it is in the inbox, not spam, and in Gmail open "Show original": SPF, DKIM and DMARC should say PASS.`,
          `Terkirim ke ${body.to}. Cek masuk ke kotak masuk, bukan spam, lalu di Gmail buka "Show original": SPF, DKIM, dan DMARC harus PASS.`
        ),
        { duration: 10_000 }
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e), { duration: 10_000 });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div data-email-test className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5 mt-4 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex-1 min-w-0 text-sm">
        <div className="font-semibold text-neutral-black flex items-center gap-2">
          <Mail className="w-4 h-4 text-primary-navy" />
          {FEATURES.emails ? t("Notification emails: on", "Email notifikasi: menyala") : t("Notification emails: off", "Email notifikasi: belum menyala")}
        </div>
        <p className="text-neutral-gray mt-1">
          {t(
            `Send one test email to ${email || "your address"} through the server's mail settings, to check the password in Vercel before turning emails on, or after it changes.`,
            `Kirim satu email uji ke ${email || "alamatmu"} lewat setelan email di server, untuk memastikan password di Vercel benar sebelum email dinyalakan, atau setelah password-nya diganti.`
          )}
        </p>
      </div>
      <Button.Ghost data-email-test-send className="text-sm shrink-0" disabled={busy} onClick={() => void send()}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
        {t("Send me a test email", "Kirim email uji ke saya")}
      </Button.Ghost>
    </div>
  );
}

const LABEL: Record<MetricRow["key"], { en: string; id: string }> = {
  accounts: { en: "New accounts", id: "Akun baru" },
  listings: { en: "Listings posted", id: "Listing dipasang" },
  held: { en: "  of which held for review", id: "  di antaranya ditahan untuk review" },
  requests: { en: "Show requests", id: "Pengajuan acara" },
  orders: { en: "Orders", id: "Pesanan" },
  claims: { en: "Claims", id: "Klaim" },
};

export function BetaPanel() {
  const t = useT();
  const [data, setData] = useState<BetaMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // Cancelled with the effect (lib/fetch-json); the body is read either way, for its error.
    const ctrl = new AbortController();
    fetch("/api/admin/metrics", { signal: ctrl.signal })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        return body as BetaMetrics;
      })
      .then(
        (d) => !ctrl.signal.aborted && setData(d),
        (e) => !ctrl.signal.aborted && setError(e instanceof Error ? e.message : String(e))
      );
    return () => ctrl.abort();
  }, []);

  if (error) return (<><p className="text-sm text-secondary-pink-dark">{error}</p><EmailTest /></>);
  if (!data) return (<><p className="text-sm text-neutral-gray flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t("Counting...", "Menghitung...")}</p><EmailTest /></>);

  const heads = [t("This week", "Minggu ini"), t("Last week", "Minggu lalu"), t("2 weeks ago", "2 minggu lalu"), t("3 weeks ago", "3 minggu lalu"), t("All time", "Total")];
  return (
    <>
    <div data-beta-metrics className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5 overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-xs text-neutral-gray text-right">
            <th className="text-left font-normal pb-2">{t("Rolling weeks, newest first", "Per 7 hari, terbaru di kiri")}</th>
            {heads.map((h) => <th key={h} className="font-normal pb-2 pl-4 whitespace-nowrap">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.key} data-metric={r.key} className="border-t border-neutral-light-gray-1">
              <td className={`py-2 whitespace-pre ${r.key === "held" ? "text-neutral-gray" : "text-neutral-black"}`}>{t(LABEL[r.key].en, LABEL[r.key].id)}</td>
              {r.weeks.map((n, i) => <td key={i} className="py-2 pl-4 text-right">{n}</td>)}
              <td className="py-2 pl-4 text-right font-semibold">{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-neutral-gray mt-3">
        {data.reviewHours === null
          ? t("No held listing has been cleared yet.", "Belum ada listing ditahan yang selesai dicek.")
          : t(`A held listing waits ${data.reviewHours} hours for a person, on average (target: 24).`, `Listing yang ditahan rata-rata menunggu ${data.reviewHours} jam untuk dicek orang (target: 24).`)}{" "}
        {t("Demo accounts are left out; the team's own accounts count.", "Akun demo tidak dihitung; akun tim ikut terhitung.")}
      </p>
    </div>
    <EmailTest />
    </>
  );
}
