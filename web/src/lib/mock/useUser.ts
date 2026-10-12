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
      // A first visit starts signed out, like any real site. Starting as a sample buyer read
      // as somebody else's session left open; the sample accounts stay one click away on the
      // login page, which every account page sends a signed-out visitor to.
      user: null,
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

/**
 * Whether AuthSync has read this browser's Supabase session once. A sign-in link opened in a fresh
 * browser arrives with a session but no stored user yet, so account pages wait for this rather than
 * send a signed-in visitor back to the login page. A store of its own, never persisted: in the user
 * store, every change would write the user back to storage, over a change made by another tab.
 */
export const useSessionChecked = create<{ checked: boolean; mark: () => void }>()((set) => ({
  checked: false,
  mark: () => set({ checked: true }),
}));
