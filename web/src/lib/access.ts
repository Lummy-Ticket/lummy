"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "./mock";

/**
 * Who a page is for.
 *
 * The product model, which mirrors how every real resale marketplace works:
 * one account both buys and sells. "Buyer" and "Seller" are two views of the
 * same person, not two kinds of account, so they share the same access. Nobody
 * registers as a seller; you become one the moment you list a ticket.
 *
 * Admin is different in kind: it is staff, not a mode a customer can enter, and
 * it is the only surface that is genuinely gated.
 */
export type Access = "public" | "account" | "staff";

const noSubscribe = () => () => {};
/** False on the server and during the hydration render, true afterwards. */
export function useHydrated() {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}

/**
 * Returns true once the page is safe to render for this visitor. Anyone who
 * should not be here is redirected, which is what stops a stale admin console
 * from staying on screen after signing back in as a customer.
 */
export function useAccessGuard(access: Access) {
  const hydrated = useHydrated();
  const user = useUser((s) => s.user);
  const router = useRouter();

  const allowed =
    access === "public" || (!!user && (access !== "staff" || user.role === "ADMIN"));

  useEffect(() => {
    if (!hydrated || allowed) return;
    // Signed out goes to the door. Signed in at the wrong desk goes home.
    router.replace(user ? "/" : "/login");
  }, [hydrated, allowed, user, router]);

  return hydrated && allowed;
}

/** Where each view belongs when a persona switch or a redirect happens. */
export const ROLE_HOME = { BUYER: "/", SELLER: "/seller", ADMIN: "/admin" } as const;
