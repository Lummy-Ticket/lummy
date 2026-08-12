import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Category } from "./types";

// Event baru diminta penjual pertama. Realita (dari tiket asli): PDF penjual cuma
// nunjukin SATU kategori (kategori dia) + harga dia; kadang malah gak ada harganya.
// Jadi daftar harga semua tier = admin lengkapi dari SUMBER RESMI ORGANIZER
// (website / sosmed / poster), bukan di-extract full dari 1 PDF.
export interface EventRequest {
  id: string;
  submittedBy: string;
  title: string;
  dateISO: string;
  venue: string;
  city: string;
  category: Category;
  faceValues: { tier: string; value: number }[];
  pdfTier: string; // satu-satunya tier yang kebaca dari PDF penjual (punya dia)
  organizerRef: string; // sumber resmi buat verifikasi harga (sosmed/website organizer)
  forgeryScore: number;
  pdfSuspicious: boolean;
  status: "pending" | "approved" | "rejected";
}

const SEED: EventRequest[] = [
  {
    id: "req-1", status: "pending", submittedBy: "Zahra A.", title: "Bruno Mars Live in Jakarta",
    dateISO: "2027-02-08T20:00:00+07:00", venue: "Stadion Utama GBK", city: "Jakarta",
    category: "Music", forgeryScore: 7, pdfSuspicious: false,
    pdfTier: "CAT 1", organizerRef: "instagram.com/pkentertainment.id",
    faceValues: [
      { tier: "Front CAT", value: 4_500_000 },
      { tier: "CAT 1", value: 2_500_000 },
      { tier: "Festival", value: 1_800_000 },
    ],
  },
  {
    id: "req-2", status: "pending", submittedBy: "Bagas W.", title: "Hindia: Menari Dengan Bayangan",
    dateISO: "2026-12-20T19:30:00+07:00", venue: "Beach City International Stadium", city: "Jakarta",
    category: "Music", forgeryScore: 63, pdfSuspicious: true,
    pdfTier: "VIP", organizerRef: "instagram.com/hindia.official",
    faceValues: [
      { tier: "VIP", value: 850_000 },
      { tier: "Reguler", value: 450_000 },
    ],
  },
];

interface ReqState {
  requests: EventRequest[];
  approve: (id: string) => void;
  reject: (id: string) => void;
}

export const useEventRequests = create<ReqState>()(
  persist(
    (set) => ({
      requests: SEED,
      approve: (id) => set((s) => ({ requests: s.requests.map((r) => (r.id === id ? { ...r, status: "approved" } : r)) })),
      reject: (id) => set((s) => ({ requests: s.requests.map((r) => (r.id === id ? { ...r, status: "rejected" } : r)) })),
    }),
    {
      name: "opertix:eventreq",
      // v2: nambah pdfTier + organizerRef ke schema. Reset localStorage lama.
      version: 2,
      migrate: () => ({ requests: SEED }),
    }
  )
);
