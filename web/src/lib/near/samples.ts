// Made-up tickets for the public demo on /near. They name no real buyer, so anyone can run them and read
// exactly what the model reads. On a real upload the same call runs after the cleaner has taken names,
// numbers and codes out (lib/tickets/clean.ts), so the model sees text just like this.
import type { ShowForTicket } from "@/lib/tickets/ai";

export type SampleTicket = { id: string; label: string; text: string; show: ShowForTicket };

const BBW: ShowForTicket = {
  tiers: [
    { id: "t-bbw-early", name: "Early Bird" },
    { id: "t-bbw-full", name: "Full Pass" },
  ],
};
const CONCERT: ShowForTicket = {
  tiers: [
    { id: "t-cat1", name: "CAT 1" },
    { id: "t-cat2", name: "CAT 2" },
    { id: "t-festival", name: "Festival" },
  ],
};

export const SAMPLES: SampleTicket[] = [
  {
    id: "conference",
    label: "Conference pass, Bangkok",
    show: BBW,
    text: [
      "E-TICKET",
      "Binance Blockchain Week 2026",
      "Queen Sirikit National Convention Center, Bangkok",
      "28 November 2026, 09:00",
      "Pass: Early Bird",
      "Attendee: [x]",
      "Order: [x]",
      "Price: USD 19.00",
      "Non-transferable without the organiser's written consent.",
    ].join("\n"),
  },
  {
    id: "concert",
    label: "Concert ticket, Jakarta",
    show: CONCERT,
    text: [
      "BUKTI PEMESANAN",
      "M2M TWO. Tour 2027, Jakarta",
      "Tennis Indoor Senayan",
      "Sabtu, 10 April 2027 pukul 19.00 WIB",
      "Kategori: CAT 2",
      "Tribun Barat, Baris F, Kursi 12",
      "Nama pemesan: [x]",
      "Kode: [x]",
      "Harga tiket Rp1.250.000",
      "Jumlah: 1 tiket",
    ].join("\n"),
  },
];
