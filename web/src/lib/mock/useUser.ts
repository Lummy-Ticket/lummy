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
      // Mock mulai logged-in sebagai buyer biar navbar + role switcher langsung kelihatan.
      user: DEMO_USERS.BUYER,
      login: (role = "BUYER") => set({ user: DEMO_USERS[role] }),
      logout: () => set({ user: null }),
      switchPersona: (role) => set({ user: DEMO_USERS[role] }),
    }),
    { name: "opertix:user" }
  )
);

// Mock selalu demo mode (persona switcher aktif).
export const isDemoMode = () => true;
