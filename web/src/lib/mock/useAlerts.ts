import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getEventById } from "./seed";

export type AlertChannel = "email" | "whatsapp" | "telegram";

export interface AlertSub {
  id: string;
  eventId: string;
  eventTitle: string;
  tierId?: string; // set = waitlist for that tier; empty = alerts for any new ticket
  tierName?: string;
  createdAtISO: string;
}

interface AlertState {
  channel: AlertChannel;
  subs: AlertSub[];
  setChannel: (c: AlertChannel) => void;
  subscribe: (s: Omit<AlertSub, "id" | "createdAtISO">) => void;
  unsubscribe: (id: string) => void;
}

// The sample alerts every browser used to start with (until 25 Oct 2026). A first visit read as
// somebody else's choices ("On the list" for a tier nobody picked), so the list starts empty, and
// these are taken out of browsers that stored them.
const OLD_SEED_IDS = ["al-1", "al-2"];

export const useAlerts = create<AlertState>()(
  persist(
    (set, get) => ({
      channel: "whatsapp",
      subs: [],
      setChannel: (channel) => set({ channel }),
      subscribe: (s) => {
        const exists = get().subs.some((x) => x.eventId === s.eventId && (x.tierId ?? null) === (s.tierId ?? null));
        if (exists) return;
        set((st) => ({ subs: [{ ...s, id: "al-" + Date.now(), createdAtISO: new Date().toISOString() }, ...st.subs] }));
      },
      unsubscribe: (id) => set((st) => ({ subs: st.subs.filter((x) => x.id !== id) })),
    }),
    {
      name: "lummy:alerts",
      // v1: real shows replaced the made-up ones on 23 Oct 2026. v2: no sample alerts any more. An
      // alert set in this browser stays while its show is still in the catalogue.
      version: 2,
      migrate: (persisted) => {
        const stored = (persisted ?? {}) as Partial<AlertState>;
        const mine = (stored.subs ?? []).filter((s) => !OLD_SEED_IDS.includes(s.id) && !!getEventById(s.eventId));
        return { ...stored, subs: mine };
      },
    }
  )
);
