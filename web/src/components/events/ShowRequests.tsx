"use client";

// A seller's own show requests on their dashboard: waiting, approved with a link to list the ticket,
// or rejected with the staff's reason. Nothing shows until there is a request.
import Link from "next/link";
import { CalendarPlus, CheckCircle2, Clock, XCircle } from "lucide-react";
import { useAccountRequests } from "@/lib/events/requests-client";
import { useFormatters, useT } from "@/lib/i18n";
import { publicSellerName } from "@/lib/listings/rules";
import { useEventRequests, useUser } from "@/lib/mock";

export function ShowRequests() {
  const t = useT();
  const { formatEventDate } = useFormatters();
  const user = useUser((s) => s.user);
  const account = !!user?.account;
  const sample = useEventRequests((s) => s.requests);
  const { requests: mine } = useAccountRequests(account ? "mine" : null);
  const requests = account ? mine ?? [] : sample.filter((r) => !!user && r.submittedBy === publicSellerName(user.name));
  if (!requests.length) return null;

  return (
    <div data-show-requests className="bg-neutral-white rounded-3xl border border-neutral-light-gray-1 p-5 mb-8">
      <h3 className="font-semibold text-neutral-black flex items-center gap-2">
        <CalendarPlus className="w-4 h-4 text-lummy-500" /> {t("Your show requests", "Pengajuan acaramu")}
      </h3>
      <ul className="mt-3 flex flex-col divide-y divide-neutral-light-gray-1">
        {requests.map((r) => (
          <li key={r.id} data-show-request={r.status} className="py-3 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="font-medium text-neutral-black">{r.title}</span>
              {r.status === "pending" ? (
                <span className="text-xs text-neutral-gray flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {t("Waiting for staff", "Menunggu staf")}</span>
              ) : r.status === "approved" ? (
                <span className="text-xs text-secondary-green-dark flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {t("Approved", "Disetujui")}</span>
              ) : (
                <span className="text-xs text-secondary-pink-dark flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> {t("Not approved", "Tidak disetujui")}</span>
              )}
            </div>
            <span className="text-xs text-neutral-gray">{formatEventDate(r.dateISO)} · {r.venue}, {r.city}</span>
            {r.reviewNote && <span className="text-xs text-neutral-black">{t("Staff:", "Staf:")} {r.reviewNote}</span>}
            {r.status === "approved" && r.eventId && (
              <Link href={`/sell?event=${encodeURIComponent(r.eventId)}`} className="text-sm text-primary-navy font-medium w-fit">
                {t("List your ticket now", "Jual tiketmu sekarang")}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
