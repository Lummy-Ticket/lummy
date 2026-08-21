import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role, User } from "./types";
import { DEMO_USERS } from "./seed";

interface UserState {
  user: User | null;
  login: (role?: Role) => void;
  logout: () => void;
  switchPersona: (role: Role) => void;
}

export const useUser = create<UserState>()(
  persist(
    (set) => ({
      // The mock starts signed in as a buyer so the navbar and the persona
      // switcher are both visible immediately.
      user: DEMO_USERS.BUYER,
      login: (role = "BUYER") => set({ user: DEMO_USERS[role] }),
      logout: () => set({ user: null }),
      switchPersona: (role) => set({ user: DEMO_USERS[role] }),
    }),
    { name: "lummy:user" }
  )
);

// The mock is always in demo mode, so the persona switcher stays available.
export const isDemoMode = () => true;
