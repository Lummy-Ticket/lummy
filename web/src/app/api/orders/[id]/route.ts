// What can happen to an account's order after it is paid: the buyer opening the handover
// documents, filing a claim, either side answering it, staff ruling, the payout once the window
// has passed in silence, and the buyer taking the money back from a postponed show. Every action
// is checked against the same escrow rules the pages use (lib/mock/escrow.ts), on the server's
// clock. On a chain order the contract acts first and the database mirrors what it did.
import type { Hex } from "viem";
import { NextResponse } from "next/server";
import { readHistory } from "@/lib/chain/history";
import { chainError, operatorSetup, payOut, readListing, settle, type Operator } from "@/lib/chain/server";
import { notifyClaimFiled, notifyRuling } from "@/lib/email/notify";
import {
  availableReasons, canFileDispute, canRefundPostponed, checkEvidence, mockEvidenceOptions, mockSellerEvidence, partialAmount,
  penaltyFor, remedyOptions, suggestedRationale,
} from "@/lib/mock/escrow";
import type { DisputeReason, Remedy } from "@/lib/mock/types";
import { HELD, ORDER_SELECT, orderFromRow, type OrderRow } from "@/lib/orders/map";
import { queueLedgerSync } from "@/lib/orders/ledger";
import { settleOrder } from "@/lib/orders/settle";
import { EVIDENCE_TYPES, EvidenceError, MAX_EVIDENCE_BYTES } from "@/lib/evidence/read";
import { EVIDENCE_KINDS, evidenceFromUpload, newEvidencePath, ownsEvidencePath, type Side } from "@/lib/evidence/server";
import type { DisputeEvidence, EvidenceKind } from "@/lib/mock/types";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isDemoEmail } from "@/lib/supabase/demo";
import { currentUser } from "@/lib/supabase/session";
import type { Json } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStore });
const done = (extra: Record<string, unknown> = {}) => NextResponse.json({ ok: true, ...extra }, { headers: noStore });
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const asJson = (v: object | undefined) => (v ? (v as unknown as Json) : null);

type Body = {
  action?: unknown;
  which?: unknown;
  reason?: unknown;
  note?: unknown;
  /** A sample file's name (demo accounts only). */
  evidence?: unknown;
  /** A photo uploaded through evidence-upload. */
  evidencePath?: unknown;
  kind?: unknown;
  type?: unknown;
  size?: unknown;
  remedy?: unknown;
};

/**
 * The contract's own ruling on this escrow, when it gave the buyer `toBuyer`: what a ruling whose
 * reply was lost left behind. Any share still waiting in the escrow is sent on.
 */
async function ruledOnChain(op: Operator, listingId: Hex, toBuyer: bigint) {
  const history = await readHistory(op, listingId);
  const ruled = [...history.events].reverse().find((e) => e.kind === "Resolved");
  if (!ruled || ruled.toBuyer !== toBuyer.toString()) return null;
  return { tx: ruled.tx, withdrawals: await payOut(op, listingId) };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = supabaseAdmin();
  if (!admin) return fail(503, "database belum tersambung di server ini");
  const user = await currentUser();
  if (!user) return fail(401, "masuk dulu");
  if (!/^[\w-]{1,64}$/.test(id)) return fail(404, "pesanan tidak ditemukan");

  const { data, error } = await admin.from("orders").select(ORDER_SELECT).eq("id", id).maybeSingle();
  if (error) return fail(500, error.message);
  const row = data as unknown as OrderRow | null;
  const buyer = row?.buyer_id === user.id;
  const seller = !!row?.seller_id && row.seller_id === user.id;
  // Someone else's order does not exist, as far as they can tell.
  if (!row || (!buyer && !seller && !user.staff)) return fail(404, "pesanan tidak ditemukan");

  const order = orderFromRow(row);
  const now = Date.now();
  // A QRIS order's public record (docs/09 §7) follows each change once the answer is sent.
  const ledgerFollows = () => {
    if (row.payment_id) queueLedgerSync(admin, id);
  };
  const at = new Date(now).toISOString();
  const body = ((await req.json().catch(() => null)) ?? {}) as Body;

  const side: Side | null = buyer ? "buyer" : seller ? "seller" : null;
  // The sample files are for the demo accounts that rehearse with them. Everyone else attaches a
  // photo of their own, which the server reads itself.
  const sampleFiles = isDemoEmail(user.email);
  const kindOf = (fallback: EvidenceKind) => ((EVIDENCE_KINDS as unknown[]).includes(body.kind) ? (body.kind as EvidenceKind) : fallback);
  /** The photo this side uploaded for this order, as read by the server; nothing else is accepted. */
  const uploaded = (kind: EvidenceKind) => {
    const path = typeof body.evidencePath === "string" ? body.evidencePath : "";
    if (!side || !ownsEvidencePath(path, id, side)) throw new EvidenceError("foto bukti tidak dikenal, upload ulang");
    return evidenceFromUpload(admin, row, path, kind);
  };
  const evidenceFailed = (e: unknown) =>
    e instanceof EvidenceError ? fail(422, e.message) : fail(500, `foto bukti gagal dibaca: ${e instanceof Error ? e.message : String(e)}`);

  switch (body.action) {
    case "evidence-upload": {
      // A one-off token to put a photo straight into the private bucket, for whoever may attach one now.
      if (!side) return fail(403, "cuma pembeli dan penjual yang bisa melampirkan bukti");
      const open = order.escrowStatus === "DISPUTED" && !!order.dispute && !order.dispute.verdict;
      if (!(buyer ? (!order.dispute && canFileDispute(order, now)) || open : open)) {
        return fail(409, "bukti tidak bisa dilampirkan ke pesanan ini sekarang");
      }
      const type = String(body.type);
      const size = Number(body.size);
      if (!EVIDENCE_TYPES[type]) return fail(400, "kirim foto JPEG, PNG, atau WebP");
      if (!Number.isFinite(size) || size <= 0 || size > MAX_EVIDENCE_BYTES) return fail(413, "foto lebih dari 10 MB");
      const path = newEvidencePath(id, side, type);
      const signed = await admin.storage.from("evidence").createSignedUploadUrl(path);
      if (signed.error || !signed.data) return fail(500, signed.error?.message ?? "link upload gagal dibuat");
      return done({ path, token: signed.data.token });
    }

    case "evidence-read": {
      // What the server reads off the photo, shown in the form before anything is filed.
      try {
        return done({ evidence: await uploaded(kindOf(buyer ? "SCANNER_PHOTO" : "CHAT_LOG")) });
      } catch (e) {
        return evidenceFailed(e);
      }
    }

    case "docs": {
      // The platform's own record of the handover, which settles a "never handed over" claim.
      if (!buyer) return fail(403, "cuma pembeli yang membuka dokumen serah-terima");
      if (body.which === "letter") {
        const r = await admin.from("orders").update({ docs_letter_at: at }).eq("id", id).is("docs_letter_at", null);
        if (r.error) return fail(500, r.error.message);
      } else if (body.which === "sellerId" && row.gate_ktp) {
        const r = await admin.from("orders").update({ docs_seller_id_at: at }).eq("id", id).is("docs_seller_id_at", null);
        if (r.error) return fail(500, r.error.message);
      } else return fail(400, "dokumen tidak dikenal");
      return done(); // the first open is the one that counts, so a later one changes nothing
    }

    case "dispute": {
      if (!buyer) return fail(403, "cuma pembeli yang bisa mengajukan klaim");
      if (order.dispute || !canFileDispute(order, now)) return fail(409, "klaim sudah tidak bisa diajukan untuk pesanan ini");
      const reason = String(body.reason) as DisputeReason;
      const meta = availableReasons(order, now).find((r) => r.id === reason);
      if (!meta?.eligible) return fail(400, "alasan ini tidak bisa dipakai sekarang");
      // The file's details are read by the server, never taken from the browser, so a claim cannot
      // invent a venue geotag: off the uploaded photo, or off its own list for a sample file.
      const needsFile = meta.proof !== "DOCS" && meta.proof !== "NONE";
      let evidence: DisputeEvidence | undefined;
      if (needsFile && typeof body.evidencePath === "string") {
        try {
          evidence = await uploaded(reason === "NOT_AS_LISTED" ? "TICKET_PHOTO" : kindOf("SCANNER_PHOTO"));
        } catch (e) {
          return evidenceFailed(e);
        }
      } else if (needsFile && sampleFiles) {
        evidence = mockEvidenceOptions(order, reason).find((e) => e.fileName === body.evidence);
      }
      if (needsFile && !evidence) return fail(400, sampleFiles ? "klaim ini butuh bukti" : "klaim ini butuh foto bukti");
      const note = text(body.note, 1000);

      const filed = await admin.from("disputes").insert({ order_id: id, reason, note_en: note, note_id: note, evidence: asJson(evidence), opened_at: at });
      if (filed.error) return fail(filed.error.code === "23505" ? 409 : 500, filed.error.message);
      const flagged = await admin.from("orders").update({ disputed: true }).eq("id", id);
      // On chain the claim is a real flag that freezes the payout, sent by the operator for the buyer.
      // If the contract refuses, the claim is taken back so the two never disagree.
      let failure = flagged.error?.message ?? null;
      if (!failure && order.chain) {
        const op = operatorSetup();
        const listingId = order.chain.listingId as Hex;
        try {
          if (!op) throw new Error("mode chain mati: kunci operator belum diset");
          await settle(op, listingId, "dispute");
        } catch (e) {
          // A reply lost after the flag went up still reads as an error, and raising it again is
          // refused: the chain decides, and a flag already up on a held escrow is this claim.
          const live = op ? await readListing(op, listingId).catch(() => null) : null;
          if (live?.disputed && (live.status === "Funded" || live.status === "DisputeWindow")) {
            console.error("[orders] claim raised on chain, its reply was lost:", id, chainError(e));
          } else failure = chainError(e);
        }
      }
      if (failure) {
        await admin.from("disputes").delete().eq("order_id", id);
        await admin.from("orders").update({ disputed: false }).eq("id", id);
        return fail(order.chain ? 502 : 500, failure);
      }
      ledgerFollows();
      notifyClaimFiled(admin, id);
      return done();
    }

    case "reply": {
      // Deciding on the filer's word alone is how a marketplace refunds people who walked in.
      if (!buyer && !seller) return fail(403, "cuma pembeli dan penjual yang bisa menjawab klaim");
      if (order.escrowStatus !== "DISPUTED" || !order.dispute || order.dispute.verdict) return fail(409, "klaim ini sudah tidak terbuka");
      if ((order.dispute.replies ?? []).some((r) => r.fromSeller === seller)) return fail(409, "jawabanmu sudah masuk");
      const note = text(body.note, 1000);
      if (!note) return fail(400, "tulis jawabannya dulu");
      let evidence: DisputeEvidence | undefined;
      if (typeof body.evidencePath === "string" && body.evidencePath) {
        try {
          evidence = await uploaded(kindOf(seller ? "CHAT_LOG" : "SCANNER_PHOTO"));
        } catch (e) {
          return evidenceFailed(e);
        }
      } else if (body.evidence) {
        evidence = seller && sampleFiles ? mockSellerEvidence(order).find((e) => e.fileName === body.evidence) : undefined;
        if (!evidence) return fail(400, "lampiran tidak dikenal");
      }
      const r = await admin.from("dispute_replies").insert({
        order_id: id, author_id: user.id, from_seller: seller, note_en: note, note_id: note, evidence: asJson(evidence),
      });
      if (r.error) return fail(500, r.error.message);
      return done();
    }

    case "verdict": {
      if (!user.staff) return fail(403, "cuma staf yang bisa memutus");
      const d = order.dispute;
      if (order.escrowStatus !== "DISPUTED" || !d || d.verdict) return fail(409, "tidak ada klaim terbuka di pesanan ini");
      const remedy = String(body.remedy) as Remedy;
      if (!remedyOptions(order, d.reason, now).some((o) => o.remedy === remedy)) return fail(400, "putusan ini tidak tersedia untuk klaim ini");
      const check = checkEvidence(order, d.reason, d.evidence, d.openedAtISO);
      const rationale =
        remedy === "RELEASE_SELLER" && check.strength === "STRONG"
          ? { en: "Arbiter overrode the automated read and released to the seller.", id: "Arbiter mengesampingkan pembacaan otomatis dan mencairkan ke penjual." }
          : suggestedRationale(d, check);
      const toSeller = remedy === "RELEASE_SELLER";
      // A replacement is settled as a full refund, so the money is never left in limbo.
      const refund = remedy === "REFUND_FULL" || remedy === "REPLACEMENT" ? order.amount : remedy === "REFUND_PARTIAL" ? partialAmount(order, d.reason) : 0;

      // The contract splits the money first; the database records what it did.
      let tx: { tx: string; withdrawals: string[] } | null = null;
      if (order.chain) {
        const op = operatorSetup();
        if (!op) return fail(503, "mode chain mati: kunci operator belum diset");
        const listingId = order.chain.listingId as Hex;
        const toBuyer = (BigInt(order.chain.price) * BigInt(refund)) / BigInt(order.amount);
        try {
          tx = await settle(op, listingId, "resolve", toBuyer);
        } catch (e) {
          // A reply lost after the contract ruled, or a payout that failed right after it, still
          // reads as an error, and ruling again is refused: the chain decides. A ruling it already
          // carried out with this split is recorded, and its shares are sent on.
          tx = await ruledOnChain(op, listingId, toBuyer).catch(() => null);
          if (!tx) return fail(502, chainError(e));
          console.error("[orders] ruled on chain, its reply was lost:", id, chainError(e));
        }
      }
      const ruled = await admin
        .from("disputes")
        .update({
          verdict_remedy: remedy,
          verdict_to_seller: toSeller,
          refund_amount: refund,
          seller_penalty: penaltyFor(d.reason, toSeller, order.amount),
          rationale_en: rationale.en,
          rationale_id: rationale.id,
          decided_at: at,
          decided_by: user.id,
        })
        .eq("order_id", id)
        .is("decided_at", null)
        .select("order_id");
      if (ruled.error) return fail(500, ruled.error.message);
      if (!ruled.data.length) return fail(409, "klaim ini baru saja diputus");
      const settled = await admin
        .from("orders")
        .update({ escrow_status: toSeller ? "Released" : "Refunded", ...(tx ? { tx_settle: tx.tx, tx_withdrawals: tx.withdrawals } : {}) })
        .eq("id", id);
      if (settled.error) return fail(500, settled.error.message);
      ledgerFollows();
      notifyRuling(admin, id);
      return done(tx ?? {});
    }

    case "settle": {
      // Silence settles it: once the window has passed with no claim, the seller is paid. Anyone
      // on the order may ask; the rule, not the caller, decides. The daily sweep asks the same.
      const r = await settleOrder(admin, row, now);
      if (r.ok && r.released) ledgerFollows();
      return r.ok ? done(r.tx ?? {}) : fail(r.status, r.error);
    }

    case "postponed-refund": {
      // The show moved after this was bought: the buyer keeps the ticket for the new date, or takes
      // the money back, fee included, with no arbiter (docs/01, decision E). The seller is not
      // penalised; the ticket stays theirs, though Lummy cannot sell it a second time (docs/09).
      if (!buyer) return fail(403, "cuma pembeli yang bisa memilih refund");
      if (!canRefundPostponed(order, now)) return fail(409, "refund karena acara diundur tidak tersedia untuk pesanan ini");
      let tx: { tx: string; withdrawals: string[] } | null = null;
      if (order.chain) {
        const op = operatorSetup();
        if (!op) return fail(503, "mode chain mati: kunci operator belum diset");
        try {
          tx = await settle(op, order.chain.listingId as Hex, "refund");
        } catch (e) {
          return fail(502, chainError(e));
        }
      }
      const r = await admin
        .from("orders")
        .update({ escrow_status: "Refunded", auto_refund_reason: "EVENT_POSTPONED", ...(tx ? { tx_settle: tx.tx, tx_withdrawals: tx.withdrawals } : {}) })
        .eq("id", id)
        .in("escrow_status", HELD)
        .eq("disputed", false)
        .select("id");
      if (r.error) return fail(500, r.error.message);
      if (!r.data.length) {
        if (tx) console.error("[orders] refunded on chain but the order had already changed:", id);
        return fail(409, "pesanan ini baru saja berubah");
      }
      ledgerFollows();
      return done(tx ?? {});
    }

    default:
      return fail(400, "aksi tidak dikenal");
  }
}
