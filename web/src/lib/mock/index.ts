export * from "./types";
export { useUser, isDemoMode } from "./useUser";
export {
  CAP_PCT,
  FLOOR_PCT,
  DEMO_USERS,
  SEED_EVENTS,
  SEED_LISTINGS,
  getEvents,
  getFeaturedEvents,
  getEventById,
  getListingsByEvent,
  getTier,
} from "./seed";
export * from "./util";
export { useOrders, type Order } from "./useOrders";
export { useSellerListings, type SellerListing } from "./useSellerListings";
export { useEventRequests, type EventRequest } from "./useEventRequests";

// --- format helpers ---
export const formatIDR = (n: number) => `IDR ${n.toLocaleString("id-ID")}`;

export const formatEventDate = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
