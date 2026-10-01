// Puts the demo back where a presentation starts: every seed listing on sale again with the seats
// it started with, the demo accounts holding one order in every phase (the same five the sample
// personas see), and the demo seller owning the seed listing under her name plus one flagged
// listing waiting in the admin queue. Presenter only, behind the same gate as the demo accounts.
// Orders of real accounts are left alone.
//
// Escrows that demo orders still hold on chain are closed first, so no test USDC stays locked:
// a refund while the window is open, a full refund on a claim, a release once the window has
// passed. An escrow the contract will not close keeps its order, so it can still be found.
import type { Hex } from "viem";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { chainError, chainTarget, operatorSetup, readListing, settle } from "@/lib/chain/server";
import { demoKeyAllowed, demoMode } from "@/lib/demo-key";
import { SEED_LISTINGS } from "@/lib/mock/seed";
import { seedOrders } from "@/lib/mock/seed-orders";
import { SAMPLE_SIGNALS, publicSellerName } from "@/lib/listings/rules";
import { HELD, rowsFromOrder } from "@/lib/orders/map";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DEMO_ACCOUNTS } from "@/lib/supabase/demo";
import { ensureDemoAccount } from "@/lib/supabase/demo-accounts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: noStore });

/** Stable ids, so a presenter's links keep working across resets. */
const demoOrderId = (seedId: string) => seedId.replace("or-seed-", "or-demo-");
/** Chain work stops here, leaving time for the database within the function's limit. */
const CHAIN_BUDGET_MS = 35_000;
/** The demo seller's flagged listing, so the review queue has something to clear or reject. */
const HELD_LISTING_ID = "ls-demo-held";

export async function POST(req: Request) {
  const admin = supabaseAdmin();
  if (!admin || demoMode() === "off") return fail(503, "akun demo tidak tersedia di server ini");
  if (!demoKeyAllowed(req)) return fail(401, "demo key salah atau belum diisi");

  try {
    const [buyer, seller, staff] = await Promise.all(
      (["BUYER", "SELLER", "ADMIN"] as const).map((persona) => ensureDemoAccount(admin, persona))
    );
    const demoIds = [buyer, seller, staff];

    // Escrows the demo accounts still hold on chain.
    const held = await admin
      .from("orders")
      .select("id, onchain_listing_id")
      .in("buyer_id", demoIds)
      .in("escrow_status", HELD)
      .not("onchain_listing_id", "is", null);
    if (held.error) return fail(500, held.error.message);
    const kept: string[] = [];
    let closed = 0;
    const until = Date.now() + CHAIN_BUDGET_MS;
    const op = held.data.length ? operatorSetup() : null;
    const target = held.data.length ? chainTarget() : null;
    for (const o of held.data) {
      try {
        if (!op || !target) throw new Error("mode chain mati: kunci operator belum diset");
        if (Date.now() > until) throw new Error("waktu habis, coba reset lagi");
        const id = o.onchain_listing_id as Hex;
        const live = await readListing(target, id);
        if (live.status === "Funded" || live.status === "DisputeWindow") {
          if (live.disputed) await settle(op, id, "resolve", BigInt(live.price));
          else if (live.now <= live.deadline) await settle(op, id, "refund");
          else await settle(op, id, "release");
        }
        closed++;
      } catch (e) {
        kept.push(o.id);
        console.error("[demo reset] escrow left open:", o.id, chainError(e));
      }
    }

    // The demo accounts' orders, and whatever an earlier reset seeded. Their claims go with them.
    const keep = kept.length ? `(${kept.join(",")})` : null;
    let bought = admin.from("orders").delete().in("buyer_id", demoIds);
    let seeded = admin.from("orders").delete().like("id", "or-demo-%");
    if (keep) {
      bought = bought.not("id", "in", keep);
      seeded = seeded.not("id", "in", keep);
    }
    const removed = await Promise.all([bought.select("id"), seeded.select("id")]);
    const removeError = removed.find((r) => r.error)?.error;
    if (removeError) return fail(500, removeError.message);

    // Every seed listing on sale again, with the seats it started with.
    const restored = await Promise.all(
      SEED_LISTINGS.map((l) => admin.from("listings").update({ quantity: l.quantity, status: l.status }).eq("id", l.id).select("id"))
    );
    const restoreError = restored.find((r) => r.error)?.error;
    if (restoreError) return fail(500, restoreError.message);

    // What the demo seller posted in earlier runs goes, with its ticket file. One a real buyer's
    // order still points at is withdrawn instead, since the order has to keep its listing and file.
    const seedIds = SEED_LISTINGS.map((l) => l.id);
    const posted = await admin.from("listings").select("id, ticket_path").eq("seller_id", seller).not("id", "in", `(${[...seedIds, HELD_LISTING_ID].join(",")})`);
    if (posted.error) return fail(500, posted.error.message);
    const postedIds = posted.data.map((l) => l.id);
    if (postedIds.length) {
      const referenced = await admin.from("orders").select("listing_id").in("listing_id", postedIds);
      if (referenced.error) return fail(500, referenced.error.message);
      const inUse = new Set(referenced.data.map((o) => o.listing_id));
      const unused = postedIds.filter((id) => !inUse.has(id));
      const files = posted.data.filter((l) => !inUse.has(l.id) && l.ticket_path).map((l) => l.ticket_path!);
      const cleared = await Promise.all([
        unused.length ? admin.from("listings").delete().in("id", unused) : Promise.resolve({ error: null }),
        inUse.size ? admin.from("listings").update({ status: "cancelled" }).in("id", [...inUse] as string[]) : Promise.resolve({ error: null }),
        files.length ? admin.storage.from("tickets").remove(files) : Promise.resolve({ error: null }),
      ]);
      const clearError = cleared.find((r) => r.error)?.error;
      if (clearError) return fail(500, clearError.message);
    }

    // The seed listing under her name is hers, so her dashboard shows a real listing, and one
    // flagged listing of hers waits in the admin queue.
    const sellerName = publicSellerName(DEMO_ACCOUNTS.SELLER.name);
    const linked = await admin.from("listings").update({ seller_id: seller }).in("id", seedIds).eq("seller_name", sellerName);
    if (linked.error) return fail(500, linked.error.message);
    const flagged = SAMPLE_SIGNALS.edited;
    const heldListing = await admin.from("listings").upsert({
      id: HELD_LISTING_ID,
      event_id: "ev-tulus",
      tier_id: "t-tl-vip",
      seller_id: seller,
      seller_name: sellerName,
      ask_price: 1_380_000,
      face_value: 1_200_000,
      quantity: 1,
      splittable: false,
      gate_ktp: false,
      status: "review",
      late_listing: false,
      autofilled: flagged.autofilled,
      forgery_score: flagged.forgeryScore,
      pdf_suspicious: flagged.pdfSuspicious,
      barcode_duplicate: false,
      extraction: { source: "sample", sample: "edited" },
    });
    if (heldListing.error) return fail(500, heldListing.error.message);

    // One order in every phase. The claim in review is against the demo seller, and the staff
    // account decided the one already settled.
    const [events, listings] = await Promise.all([
      admin.from("events").select("id"),
      admin.from("listings").select("id").in("id", SEED_LISTINGS.map((l) => l.id)),
    ]);
    if (events.error || listings.error) return fail(500, (events.error ?? listings.error)!.message);
    const eventIds = new Set(events.data.map((e) => e.id));
    const listingIds = new Set(listings.data.map((l) => l.id));
    const rows = seedOrders().map((o) =>
      rowsFromOrder(
        { ...o, id: demoOrderId(o.id) },
        { buyerId: buyer, sellerId: o.sellerName === DEMO_ACCOUNTS.SELLER.name ? seller : null, decidedBy: staff, eventIds, listingIds }
      )
    );
    const ordersIn = await admin.from("orders").insert(rows.map((r) => r.order));
    if (ordersIn.error) return fail(500, ordersIn.error.message);
    const claims = rows.flatMap((r) => (r.dispute ? [r.dispute] : []));
    const claimsIn = await admin.from("disputes").insert(claims);
    if (claimsIn.error) return fail(500, claimsIn.error.message);

    revalidateTag("catalogue", { expire: 0 });
    return NextResponse.json(
      { ok: true, orders: rows.length, listings: restored.filter((r) => r.data?.length).length, escrowsClosed: closed, escrowsKept: kept.length },
      { headers: noStore }
    );
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : String(e));
  }
}
