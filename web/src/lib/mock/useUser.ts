import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Role, User } from "./types";
import { DEMO_USERS } from "./seed";

interface UserState {
  user: User | null;
  /** Sample persona in this browser. Ends a real session first, so the two never mix. */
  login: (role?: Role) => void;
  /** Signs out, including the real session when there is one. */
  logout: () => void;
  /**
   * A sample persona swaps person. A real account only changes view: buyer and seller are the
   * same person, and the admin view needs the staff flag from the database.
   */
  switchPersona: (role: Role) => void;
  /** Written by AuthSync from the Supabase session. */
  setAccount: (user: User | null) => void;
}

const endSession = (user: User | null) => {
  if (user?.account) void supabaseBrowser()?.auth.signOut();
};

export const useUser = create<UserState>()(
  persist(
    (set, get) => ({
      // The mock starts signed in as a buyer so the navbar and the persona
      // switcher are both visible immediately.
      user: DEMO_USERS.BUYER,
      login: (role = "BUYER") => {
        endSession(get().user);
        set({ user: DEMO_USERS[role] });
      },
      logout: () => {
        endSession(get().user);
        set({ user: null });
      },
      switchPersona: (role) => {
        const user = get().user;
        if (!user?.account) return set({ user: DEMO_USERS[role] });
        if (role !== "ADMIN" || user.staff) set({ user: { ...user, role } });
      },
      setAccount: (user) => set({ user }),
    }),
    { name: "lummy:user" }
  )
);

// The mock is always in demo mode, so the persona switcher stays available.
export const isDemoMode = () => true;
