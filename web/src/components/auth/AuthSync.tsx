"use client";

import { useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { useSessionChecked, useUser } from "@/lib/mock";
import { supabaseBrowser } from "@/lib/supabase/browser";

/**
 * Mirrors the Supabase session into the app's user store. Signed in with a real account, the
 * store holds that account, with the name and staff flag read from the database. Signed out,
 * a stale account is cleared and sample personas are left alone.
 */
export function AuthSync() {
  useEffect(() => {
    const checked = () => useSessionChecked.getState().mark();
    const sb = supabaseBrowser();
    if (!sb) {
      checked();
      return;
    }
    let alive = true;
    // Account pages wait for the first read below; should the client ever hang, they stop waiting.
    const fallback = setTimeout(checked, 5000);

    const apply = async (session: Session | null) => {
      if (!session) {
        if (useUser.getState().user?.account) useUser.getState().setAccount(null);
        return;
      }
      const { data: profile } = await sb.from("profiles").select("full_name, role").eq("id", session.user.id).maybeSingle();
      if (!alive) return;
      const email = session.user.email ?? "";
      const staff = profile?.role === "admin";
      const prev = useUser.getState().user;
      // Keep the view someone picked, unless it is the admin view and they are no longer staff.
      const role =
        prev?.account && prev.id === session.user.id && (prev.role !== "ADMIN" || staff) ? prev.role : staff ? "ADMIN" : "BUYER";
      useUser.getState().setAccount({
        id: session.user.id,
        name: profile?.full_name || email.split("@")[0] || "Lummy",
        email,
        role,
        account: true,
        staff,
      });
    };

    void sb.auth
      .getSession()
      .then(({ data }) => apply(data.session))
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(fallback);
        checked();
      });
    // Calling Supabase inside this callback can deadlock the client, so the work runs next tick.
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => void apply(session), 0);
    });
    return () => {
      alive = false;
      clearTimeout(fallback);
      sub.subscription.unsubscribe();
    };
  }, []);

  return null;
}
