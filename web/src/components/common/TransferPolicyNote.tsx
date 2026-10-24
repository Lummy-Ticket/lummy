"use client";

// The show's name rule, said to whoever is about to act on it: the buyer before paying, the seller
// before listing. The words live in lib/mock/transfer.ts, so every page tells the same story.
import { AlertTriangle, Ban, BadgeCheck, IdCard } from "lucide-react";
import { useT } from "@/lib/i18n";
import { transferPolicyMeta, type TransferPolicy } from "@/lib/mock";

const TONE = {
  ok: { box: "bg-secondary-green-soft", head: "text-secondary-green-dark", Icon: BadgeCheck },
  info: { box: "bg-secondary-blue-extra", head: "text-primary-navy", Icon: IdCard },
  warn: { box: "bg-secondary-orange-soft", head: "text-secondary-orange-dark", Icon: AlertTriangle },
  block: { box: "bg-secondary-pink-soft", head: "text-secondary-pink-dark", Icon: Ban },
} as const;

export function TransferPolicyNote({ policy, audience }: { policy: TransferPolicy | null | undefined; audience: "buyer" | "seller" }) {
  const t = useT();
  const meta = transferPolicyMeta(policy);
  const { box, head, Icon } = TONE[meta.tone];
  const body = audience === "buyer" ? meta.buyer : meta.seller;
  return (
    <div data-transfer-policy={policy ?? "unconfirmed"} className={`flex items-start gap-3 rounded-2xl p-4 text-sm ${box}`}>
      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${head}`} />
      <div className="min-w-0">
        <div className={`font-semibold ${head}`}>{t(meta.label.en, meta.label.id)}</div>
        {/* text-sm here too: the global p style is larger, which set the body above its heading. */}
        <p className="mt-0.5 text-sm text-neutral-gray">{t(body.en, body.id)}</p>
      </div>
    </div>
  );
}
