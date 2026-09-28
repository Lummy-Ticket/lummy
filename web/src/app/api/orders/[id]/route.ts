// What can happen to an account's order after it is paid: the buyer opening the handover
// documents, filing a claim, either side answering it, staff ruling, and the payout once the
// window has passed in silence. Every action is checked against the same escrow rules the pages
// use (lib/mock/escrow.ts), on the server's clock. On a chain order the contract acts first and
// the database mirrors what it did.
import type { Hex } from "viem";
import { NextResponse } from "next/server";
import { chainError, chainTarget, operatorSetup, readListing, settle } from "@/lib/chain/server";
import {
  availableReasons, canFileDispute, checkEvidence, mockEvidenceOptions, mockSellerEvidence, partialAmount, phaseOf,
  remedyOptions, sellerPenalty, suggestedRationale,
} from "@/lib/mock/escrow";
import type { DisputeReason, Remedy } from "@/lib/mock/types";
import { HELD, ORDER_SELECT, orderFromRow, type OrderRow } from "@/lib/orders/map";
import { supabaseAdmin } from "@/lib/supabase/admin";
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

type Body = { action?: unknown; which?: unknown; reason?: unknown; note?: unknown; evidence?: unknown; remedy?: unknown };

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
  const at = new Date(now).toISOString();
  const body = ((await req.json().catch(() => null)) ?? {}) as Body;

  switch (body.action) {
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
      // The file's details come from the server's own list, never from the browser, so a claim
      // cannot invent a venue geotag. In production they are read from the uploaded file.
      const needsFile = meta.proof !== "DOCS" && meta.proof !== "NONE";
      const evidence = needsFile ? mockEvidenceOptions(order, reason).find((e) => e.fileName === body.evidence) : undefined;
      if (needsFile && !evidence) return fail(400, "klaim ini butuh bukti");
      const note = text(body.note, 1000);

      const filed = await admin.from("disputes").insert({ order_id: id, reason, note_en: note, note_id: note, evidence: asJson(evidence), opened_at: at });
      if (filed.error) return fail(filed.error.code === "23505" ? 409 : 500, filed.error.message);
      const flagged = await admin.from("orders").update({ disputed: true }).eq("id", id);
      // On chain the claim is a real flag that freezes the payout, sent by the operator for the buyer.
      // If the contract refuses, the claim is taken back so the two never disagree.
      let failure = flagged.error?.message ?? null;
      if (!failure && order.chain) {
        const op = operatorSetup();
        try {
          if (!op) throw new Error("mode chain mati: kunci operator belum diset");
          await settle(op, order.chain.listingId as Hex, "dispute");
        } catch (e) {
          failure = chainError(e);
        }
      }
      if (failure) {
        await admin.from("disputes").delete().eq("order_id", id);
        await admin.from("orders").update({ disputed: false }).eq("id", id);
        return fail(order.chain ? 502 : 500, failure);
      }
      return done();
    }

    case "reply": {
      // Deciding on the filer's word alone is how a marketplace refunds people who walked in.
      if (!buyer && !seller) return fail(403, "cuma pembeli dan penjual yang bisa menjawab klaim");
      if (order.escrowStatus !== "DISPUTED" || !order.dispute || order.dispute.verdict) return fail(409, "klaim ini sudah tidak terbuka");
      if ((order.dispute.replies ?? []).some((r) => r.fromSeller === seller)) return fail(409, "jawabanmu sudah masuk");
      const note = text(body.note, 1000);
      if (!note) return fail(400, "tulis jawabannya dulu");
      const evidence = seller && body.evidence ? mockSellerEvidence(order).find((e) => e.fileName === body.evidence) : undefined;
      if (body.evidence && !evidence) return fail(400, "lampiran tidak dikenal");
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
        try {
          const toBuyer = (BigInt(order.chain.price) * BigInt(refund)) / BigInt(order.amount);
          tx = await settle(op, order.chain.listingId as Hex, "resolve", toBuyer);
        } catch (e) {
          return fail(502, chainError(e));
        }
      }
      const ruled = await admin
        .from("disputes")
        .update({
          verdict_remedy: remedy,
          verdict_to_seller: toSeller,
          refund_amount: refund,
          seller_penalty: toSeller ? 0 : sellerPenalty(order.amount),
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
      return done(tx ?? {});
    }

    case "settle": {
      // Silence settles it: once the window has passed with no claim, the seller is paid. Anyone
      // on the order may ask; the rule, not the caller, decides.
      if (order.escrowStatus !== "LOCKED") return fail(409, "pesanan ini sudah selesai atau sedang disengketakan");
      if (!order.chain) {
        if (phaseOf(order, now) !== "WINDOW_CLOSED") return fail(409, "masa sengketa belum lewat");
        const r = await admin
          .from("orders")
          .update({ escrow_status: "Released", auto_released: true })
          .eq("id", id)
          .in("escrow_status", HELD)
          .eq("disputed", false);
        if (r.error) return fail(500, r.error.message);
        return done();
      }
      // On chain the contract's clock decides, and it may already have been settled by anyone.
      const target = chainTarget();
      if (!target) return fail(503, "belum ada kontrak untuk chain ini");
      try {
        const live = await readListing(target, order.chain.listingId as Hex);
        if (live.status === "Released" || live.status === "Refunded") {
          const r = await admin
            .from("orders")
            .update({ escrow_status: live.status, auto_released: live.status === "Released" && !live.disputed })
            .eq("id", id);
          if (r.error) return fail(500, r.error.message);
          return done();
        }
        if (live.status !== "DisputeWindow" || live.disputed || live.now <= live.deadline) return fail(409, "masa sengketa di kontrak belum lewat");
        const op = operatorSetup();
        if (!op) return fail(503, "mode chain mati: kunci operator belum diset");
        const tx = await settle(op, order.chain.listingId as Hex, "release");
        const r = await admin
          .from("orders")
          .update({ escrow_status: "Released", auto_released: true, tx_settle: tx.tx, tx_withdrawals: tx.withdrawals })
          .eq("id", id);
        if (r.error) return fail(500, r.error.message);
        return done(tx);
      } catch (e) {
        return fail(502, chainError(e));
      }
    }

    default:
      return fail(400, "aksi tidak dikenal");
  }
}
