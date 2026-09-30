// How a named ticket can change hands at a show's gate. It decides what a buyer reads before paying,
// whether a listing may open at all, and which claim a refusal at the gate falls under. The rule comes
// from the organiser's terms and is recorded per event (events.transfer_policy). Null means nobody has
// confirmed it yet, and the app says so instead of guessing.
import type { Bi } from "./escrow";
import type { TransferPolicy } from "./types";

export interface TransferPolicyMeta {
  label: Bi;
  /** What a buyer needs to know before paying. */
  buyer: Bi;
  /** What a seller needs to know before listing. */
  seller: Bi;
  tone: "ok" | "info" | "warn" | "block";
}

const NO_RESALE: Bi = {
  en: "The organiser does not allow tickets for this show to be resold, so Lummy does not open listings for it.",
  id: "Penyelenggara melarang tiket acara ini dijual ulang, jadi Lummy tidak membuka listing untuknya.",
};

const TRANSFER_POLICY: Record<TransferPolicy, TransferPolicyMeta> = {
  open: {
    label: { en: "Freely transferable", id: "Bebas dialihkan" },
    buyer: {
      en: "Tickets for this show are not tied to a name, so whoever holds the ticket gets in.",
      id: "Tiket acara ini tidak atas nama, jadi siapa pun yang membawa tiketnya bisa masuk.",
    },
    seller: {
      en: "Tickets for this show are not tied to a name, so no ID card is needed at the gate.",
      id: "Tiket acara ini tidak atas nama, jadi tidak perlu KTP di gate.",
    },
    tone: "ok",
  },
  letter: {
    label: { en: "Named ticket, letter accepted", id: "Atas nama, surat kuasa diterima" },
    buyer: {
      en: "The name on the ticket is checked, and the organiser accepts a letter of authorisation with the seller's ID card. Lummy prepares both for you.",
      id: "Nama di tiket dicek, dan penyelenggara menerima surat kuasa dengan KTP penjual. Lummy menyiapkan keduanya untukmu.",
    },
    seller: {
      en: "The buyer gets in with your letter of authorisation and a photo of your ID card, so stage the ID card in the next step.",
      id: "Pembeli masuk dengan surat kuasa dan foto KTP kamu, jadi siapkan KTP di langkah berikutnya.",
    },
    tone: "info",
  },
  id_match: {
    label: { en: "ID must match the name", id: "KTP harus cocok dengan nama" },
    buyer: {
      en: "The organiser checks that your ID card matches the name on the ticket, so you could be turned away even with a genuine ticket. If that happens, file a claim with a photo from the gate and you get your money back in full.",
      id: "Penyelenggara mengecek KTP harus sama dengan nama di tiket, jadi kamu bisa ditolak walaupun tiketnya asli. Kalau itu terjadi, ajukan klaim dengan foto dari gate dan uangmu kembali penuh.",
    },
    seller: {
      en: "The organiser matches ID cards to names, so a buyer may be refused over the name. That sale is refunded, without a penalty for you as long as your ID card is staged for the gate.",
      id: "Penyelenggara mencocokkan KTP dengan nama, jadi pembeli bisa ditolak karena nama. Penjualan itu di-refund, tanpa penalti untukmu selama KTP kamu sudah disiapkan untuk gate.",
    },
    tone: "warn",
  },
  no_resale: {
    label: { en: "Resale not allowed", id: "Dilarang dijual ulang" },
    buyer: NO_RESALE,
    seller: NO_RESALE,
    tone: "block",
  },
};

const UNCONFIRMED: TransferPolicyMeta = {
  label: { en: "Name rules not confirmed", id: "Aturan nama belum dipastikan" },
  buyer: {
    en: "We have not confirmed this show's name rules yet. Lummy prepares a letter of authorisation, but the gate staff have the final say.",
    id: "Aturan nama untuk acara ini belum kami pastikan. Lummy menyiapkan surat kuasa, tapi keputusan akhir ada di petugas gate.",
  },
  seller: {
    en: "We have not confirmed this show's name rules yet. If the venue checks ID, stage your ID card in the next step.",
    id: "Aturan nama acara ini belum kami pastikan. Kalau venue mengecek KTP, siapkan KTP kamu di langkah berikutnya.",
  },
  tone: "info",
};

export const transferPolicyMeta = (p: TransferPolicy | null | undefined): TransferPolicyMeta =>
  p ? TRANSFER_POLICY[p] : UNCONFIRMED;

/** Listings stay closed for a show whose organiser forbids resale. */
export const resaleAllowed = (p: TransferPolicy | null | undefined) => p !== "no_resale";

/** The buyer confirms the name risk before paying. */
export const needsNameAcknowledgement = (p: TransferPolicy | null | undefined) => p === "id_match";
