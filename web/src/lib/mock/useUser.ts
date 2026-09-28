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
  /** Written by AuthSync from the Supabase session. */
  setAccount: (user: User | null) => void;
}

const endSession = (user: User | null) => {
  if (user?.account) void supabaseBrowser()?.auth.signOut();
};

export const useUser = create<UserState>()(
  persist(
    (set, get) => ({
      // The mock starts signed in as a sample buyer so a first visit already shows the
      // signed-in navbar.
      user: DEMO_USERS.BUYER,
      login: (role = "BUYER") => {
        endSession(get().user);
        set({ user: DEMO_USERS[role] });
      },
      logout: () => {
        endSession(get().user);
        set({ user: null });
      },
      setAccount: (user) => set({ user }),
    }),
    { name: "lummy:user" }
  )
);
