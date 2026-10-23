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

const SEED: AlertSub[] = [
  { id: "al-1", eventId: "ev-boyz-dewa", eventTitle: "Boyz II Men & Dewa 19 Live in Jakarta", createdAtISO: "2026-07-30T09:00:00+07:00" },
  { id: "al-2", eventId: "ev-gnr-jakarta", eventTitle: "Guns N' Roses World Tour 2026, Jakarta", tierId: "t-gnr-fest-a", tierName: "Festival A", createdAtISO: "2026-07-31T11:00:00+07:00" },
];

export const useAlerts = create<AlertState>()(
  persist(
    (set, get) => ({
      channel: "whatsapp",
      subs: SEED,
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
      // v1: real shows replaced the made-up ones on 23 Oct 2026. The sample alerts start over; an
      // alert set in this browser stays while its show is still in the catalogue.
      version: 1,
      migrate: (persisted) => {
        const stored = (persisted ?? {}) as Partial<AlertState>;
        const mine = (stored.subs ?? []).filter((s) => !SEED.some((x) => x.id === s.id) && !!getEventById(s.eventId));
        const same = (a: AlertSub, b: AlertSub) => a.eventId === b.eventId && (a.tierId ?? null) === (b.tierId ?? null);
        return { ...stored, subs: [...mine, ...SEED.filter((s) => !mine.some((m) => same(m, s)))] };
      },
    }
  )
);
