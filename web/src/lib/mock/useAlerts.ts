import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AlertChannel = "email" | "whatsapp" | "telegram";

export interface AlertSub {
  id: string;
  eventId: string;
  eventTitle: string;
  tierId?: string; // ada = waitlist tier tertentu; kosong = notif tiket baru event
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
  { id: "al-1", eventId: "ev-sos", eventTitle: "Sheila on 7: Tunggu Aku di Jakarta", createdAtISO: "2026-07-30T09:00:00+07:00" },
  { id: "al-2", eventId: "ev-coldplay", eventTitle: "Coldplay: Music of the Spheres", tierId: "t-cp-fest", tierName: "Festival", createdAtISO: "2026-07-31T11:00:00+07:00" },
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
    { name: "opertix:alerts" }
  )
);
