"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useSessionChecked, useUser, type User } from "./mock";

/**
 * Who a page is for.
 *
 * The product model, which mirrors how every real resale marketplace works:
 * one account both buys and sells. There is no buyer or seller mode to switch:
 * the same person sees their tickets and their seller dashboard side by side.
 * Nobody registers as a seller; you become one the moment you list a ticket.
 *
 * Admin is different in kind: it is staff, not a mode a customer can enter, and
 * it is the only surface that is genuinely gated.
 */
export type Access = "public" | "account" | "staff";

/** Staff: the database says so for an account; among sample personas, the admin one. */
export const isStaff = (user: User | null | undefined) => !!user && (user.account ? !!user.staff : user.role === "ADMIN");

const noSubscribe = () => () => {};
/** False on the server and during the hydration render, true afterwards. */
export function useHydrated() {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}

/**
 * Returns true once the page is safe to render for this visitor. Anyone who
 * should not be here is redirected, which is what stops a stale admin console
 * from staying on screen after signing back in as a customer. The redirect waits
 * for the first read of the Supabase session: a sign-in link opened in a fresh
 * browser lands here signed in, before the store knows it.
 */
export function useAccessGuard(access: Access) {
  const hydrated = useHydrated();
  const user = useUser((s) => s.user);
  const sessionChecked = useSessionChecked((s) => s.checked);
  const router = useRouter();

  const allowed = access === "public" || (!!user && (access !== "staff" || isStaff(user)));

  useEffect(() => {
    if (!hydrated || allowed || !sessionChecked) return;
    // Signed out goes to the door. Signed in at the wrong desk goes home.
    router.replace(user ? "/" : `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [hydrated, allowed, sessionChecked, user, router]);

  return hydrated && allowed;
}
