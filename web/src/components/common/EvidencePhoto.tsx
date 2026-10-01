"use client";

// What the server read off an uploaded claim photo, and the way to open it. The link goes through a
// route that lets in only the two sides of the order and staff.
import { ExternalLink, MapPin } from "lucide-react";
import type { DisputeEvidence } from "@/lib/mock/types";
import { evidenceHref } from "@/lib/orders/client";
import { useFormatters, useT } from "@/lib/i18n";

/** `link`: false while the photo is not filed yet, since the route opens filed photos only. */
export function EvidencePhoto({ orderId, side, evidence, link = true }: { orderId: string; side: "buyer" | "seller"; evidence: DisputeEvidence; link?: boolean }) {
  const t = useT();
  const { formatDateTime } = useFormatters();
  const up = evidence.upload;
  if (!up) return null;
  return (
    <div data-evidence-photo={side} className="mt-1.5 flex flex-col gap-0.5 text-xs text-neutral-gray">
      {link && (
        <a href={evidenceHref(orderId, side)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary-navy font-medium w-fit">
          <ExternalLink className="w-3.5 h-3.5" /> {t("Open the photo", "Buka fotonya")}
        </a>
      )}
      <span>
        {evidence.capturedAtISO
          ? t(`Taken ${formatDateTime(evidence.capturedAtISO)}`, `Diambil ${formatDateTime(evidence.capturedAtISO)}`)
          : t("No capture time on the file", "Tidak ada waktu pengambilan di file")}
        {up.device ? ` · ${up.device}` : ""}
      </span>
      {up.gps && (
        <a
          href={`https://www.google.com/maps?q=${up.gps.lat},${up.gps.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary-navy w-fit"
        >
          <MapPin className="w-3 h-3" /> {t("Where it was taken", "Tempat pengambilan")} ({up.gps.lat.toFixed(4)}, {up.gps.lng.toFixed(4)})
        </a>
      )}
      {up.editedWith && <span className="text-secondary-orange-dark">{t(`Edited with ${up.editedWith}`, `Diedit dengan ${up.editedWith}`)}</span>}
      <span>
        {up.codesRead
          ? t(`${up.codesRead} code${up.codesRead === 1 ? "" : "s"} read in the photo`, `${up.codesRead} kode terbaca di foto`)
          : t("No code read in the photo", "Tidak ada kode yang terbaca di foto")}
      </span>
    </div>
  );
}
