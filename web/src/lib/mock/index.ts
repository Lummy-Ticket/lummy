export * from "./types";
export { useUser } from "./useUser";
export {
  CAP_PCT,
  FLOOR_PCT,
  DEMO_USERS,
  SEED_LISTINGS,
  getEvents,
  getFeaturedEvents,
  getEventById,
  getListingsByEvent,
  getTier,
  isBuyable,
  isEventOver,
} from "./seed";
export * from "./util";
export * from "./escrow";
export { useOrders, withChainSnapshot, type ChainSnapshot, type ChainSettlement } from "./useOrders";
export { useSellerListings, type SellerListing } from "./useSellerListings";
export { useEventRequests, type EventRequest } from "./useEventRequests";
export { useAlerts, type AlertChannel, type AlertSub } from "./useAlerts";
export { useProfile, type PayoutBank } from "./useProfile";

// --- format helpers ---
export const formatIDR = (n: number) => `IDR ${n.toLocaleString("en-US")}`;

export const formatEventDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
