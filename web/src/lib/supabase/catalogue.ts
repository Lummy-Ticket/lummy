// The catalogue from Supabase, read on the server with the publishable key: public rows
// under RLS, nothing private. Without the env, or when the read fails, it returns null and
// the app keeps running on the sample seed.
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import type { Category, EventItem, Listing } from "@/lib/mock/types";
import { eventPoster } from "@/lib/poster";
import { supabasePublicEnv } from "./env";
import type { Database } from "./types";

if (typeof window !== "undefined") throw new Error("lib/supabase/catalogue hanya boleh dipakai di server");

export type CatalogueData = { events: EventItem[]; listings: Listing[] };

async function fetchCatalogue(url: string, key: string): Promise<CatalogueData> {
  const db = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [ev, ti, ls] = await Promise.all([
    db.from("catalogue_events").select("*").order("starts_at"),
    db.from("tiers").select("id, event_id, name, face_value").order("sort"),
    db
      .from("listings")
      .select("id, event_id, tier_id, seller_name, ask_price, face_value, quantity, splittable, gate_ktp, autofilled, forgery_score, pdf_suspicious, barcode_duplicate")
      .eq("status", "active")
      .order("created_at"),
  ]);
  const error = ev.error ?? ti.error ?? ls.error;
  if (error) throw new Error(error.message);

  const events: EventItem[] = (ev.data ?? []).flatMap((e) =>
    e.id && e.title && e.starts_at && e.category && e.venue && e.city
      ? [{
          id: e.id,
          title: e.title,
          category: e.category as Category,
          dateISO: e.starts_at,
          venue: e.venue,
          city: e.city,
          image: e.image_url ?? eventPoster(e.id),
          tiers: (ti.data ?? []).filter((t) => t.event_id === e.id).map((t) => ({ id: t.id, name: t.name, faceValue: t.face_value })),
          fromPrice: e.from_price ?? 0,
          listingCount: e.listing_count ?? 0,
          featured: !!e.featured,
          transferPolicy: e.transfer_policy,
        }]
      : []
  );
  const listings: Listing[] = (ls.data ?? []).map((l) => ({
    id: l.id,
    eventId: l.event_id,
    tierId: l.tier_id,
    sellerName: l.seller_name,
    askPrice: l.ask_price,
    faceValue: l.face_value,
    quantity: l.quantity,
    splittable: l.splittable,
    status: "active",
    gateKtp: l.gate_ktp,
    ai: {
      autofilled: l.autofilled,
      forgeryScore: l.forgery_score,
      barcodeDuplicate: l.barcode_duplicate,
      pdfSuspicious: l.pdf_suspicious,
    },
  }));
  return { events, listings };
}

// Shared across requests for 30 seconds: every page needs the catalogue, and the database
// sits in Singapore. Anything that changes a listing should call revalidateTag("catalogue").
const cachedCatalogue = unstable_cache(fetchCatalogue, ["catalogue"], { revalidate: 30, tags: ["catalogue"] });

export async function loadCatalogue(): Promise<CatalogueData | null> {
  const env = supabasePublicEnv();
  if (!env) return null;
  try {
    return await cachedCatalogue(env.url, env.key);
  } catch (e) {
    console.error("[catalogue] Supabase read failed, using the sample seed:", e instanceof Error ? e.message : e);
    return null;
  }
}
