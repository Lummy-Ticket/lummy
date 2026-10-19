"use client";

// The buyer's way in (docs/09 §8): a code only the server can make for this order, scanned at the
// door. If the ticket went in before on someone else's copy, the gate refuses the pass and that
// refusal refunds the order on the spot; the page then shows the refund. Once the pass goes in, the
// card says so instead of showing the code again.
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import toast from "react-hot-toast";
import { Copy, DoorOpen, QrCode } from "lucide-react";
import { useFormatters, useT } from "@/lib/i18n";
import { pollWhileVisible } from "@/lib/poll";

type PassState = { pass: string | null; admitted: { at: string; gate: string } | null; unavailable?: string };

export function EntryPass({ orderId, onChange }: { orderId: string; onChange?: () => void }) {
  const t = useT();
  const { formatDateTime } = useFormatters();
  const [state, setState] = useState<PassState | null>(null);
  const [hidden, setHidden] = useState(false);
  // Kept in a ref so a new callback each render does not restart the polling.
  const changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  });

  useEffect(() => {
    let alive = true;
    let done = false;
    let last = "";
    const load = async () => {
      const r = await fetch(`/api/orders/${encodeURIComponent(orderId)}/pass`, { cache: "no-store" }).catch(() => null);
      if (!alive || !r) return;
      if (!r.ok) {
        setHidden(true);
        done = true;
        return;
      }
      const j = (await r.json()) as PassState;
      // In, or no pass any more (refunded at the gate): the order itself changed, so the page reloads it.
      const key = `${!!j.pass}:${j.admitted?.at ?? ""}`;
      if (last && key !== last) changed.current?.();
      last = key;
      setState(j);
      if (j.admitted || !j.pass) done = true;
    };
    void load();
    // While the pass waits at the door, the card follows what the gate does with it.
    const stop = pollWhileVisible(() => {
      if (done) stop();
      else void load();
    }, 5000);
    return () => {
      alive = false;
      stop();
    };
  }, [orderId]);

  if (hidden || !state || state.unavailable || (!state.pass && !state.admitted)) return null;

  if (state.admitted) {
    return (
      <div data-entry-pass="in" role="status" className="bg-secondary-blue-extra rounded-3xl p-5 flex items-start gap-3">
        <DoorOpen className="w-6 h-6 text-secondary-green-dark shrink-0" />
        <div>
          <h2 className="font-semibold text-lg text-neutral-black">{t("You are in", "Kamu sudah masuk")}</h2>
          <p className="text-sm text-neutral-gray mt-1">
            {t(`Your pass went in at ${formatDateTime(state.admitted.at)}, ${state.admitted.gate}.`, `Pass-mu masuk ${formatDateTime(state.admitted.at)}, ${state.admitted.gate}.`)}
          </p>
        </div>
      </div>
    );
  }

  const copy = () => {
    navigator.clipboard?.writeText(state.pass ?? "");
    toast.success(t("Pass code copied", "Kode pass disalin"));
  };
  return (
    <div data-entry-pass="ready" className="bg-neutral-white rounded-3xl border-2 border-primary-navy p-5">
      <h2 className="font-semibold text-lg text-neutral-black flex items-center gap-2">
        <QrCode className="w-5 h-5 text-primary-navy" /> {t("Your entry pass", "Pass masukmu")}
      </h2>
      <div className="mt-4 flex justify-center">
        <div className="bg-white p-3 rounded-2xl border border-neutral-light-gray-1">
          <QRCodeSVG value={state.pass!} size={196} marginSize={1} level="M" aria-label={t("Entry pass code", "Kode pass masuk")} />
        </div>
      </div>
      <p className="text-sm text-neutral-gray mt-4 leading-relaxed">
        {t(
          "Show this at the door. It is yours alone: the seller cannot make it. If the ticket went in before you on a copy, the gate refuses it and you are refunded in full on the spot, no claim needed.",
          "Tunjukkan ini di pintu masuk. Cuma milikmu: penjual tidak bisa membuatnya. Kalau tiketnya sudah lebih dulu masuk lewat salinan, gate menolaknya dan uangmu langsung kembali penuh, tanpa perlu klaim."
        )}
      </p>
      <button onClick={copy} className="mt-3 inline-flex items-center gap-1.5 text-xs text-neutral-gray hover:text-primary-navy cursor-pointer">
        <Copy className="w-3.5 h-3.5" /> {t("Copy the code (for a gate without a camera)", "Salin kodenya (untuk gate tanpa kamera)")}
      </button>
    </div>
  );
}
