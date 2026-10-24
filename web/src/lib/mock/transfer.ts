// How a named ticket can change hands at a show's gate. It decides what a buyer reads before paying,
// whether a listing may open at all, and which claim a refusal at the gate falls under. The rule comes
// from the organiser's terms and is recorded per event (events.transfer_policy). Null means nobody has
// confirmed it yet, and the app says so instead of guessing.
import { FEATURES } from "../features";
import type { Bi } from "./escrow";
import type { TransferPolicy } from "./types";

// Until Lummy stores an ID card for the gate (lib/features.ts), the seller hands the signed letter
// and a copy of their ID card to the buyer themselves; the staged-ID wording waits behind the flag.
const ID_STAGED = FEATURES.sellerIdCard;

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
    buyer: ID_STAGED
      ? {
          en: "The name on the ticket is checked, and the organiser accepts a letter of authorisation with the seller's ID card. Lummy prepares both for you.",
          id: "Nama di tiket dicek, dan penyelenggara menerima surat kuasa dengan KTP penjual. Lummy menyiapkan keduanya untukmu.",
        }
      : {
          en: "The name on the ticket is checked, and the organiser accepts a letter of authorisation with the seller's ID card. Lummy gives you a draft of the letter; the seller signs it and gives it to you with a copy of their ID card.",
          id: "Nama di tiket dicek, dan penyelenggara menerima surat kuasa dengan KTP penjual. Lummy memberimu draf suratnya; penjual menandatanganinya dan menyerahkannya kepadamu bersama fotokopi KTP-nya.",
        },
    seller: ID_STAGED
      ? {
          en: "The buyer gets in with your letter of authorisation and a photo of your ID card, so stage the ID card in the next step.",
          id: "Pembeli masuk dengan surat kuasa dan foto KTP kamu, jadi siapkan KTP di langkah berikutnya.",
        }
      : {
          en: "The buyer gets in with your signed letter of authorisation and a copy of your ID card. Lummy does not store ID cards yet, so after the sale you sign the draft letter and give both to the buyer yourself.",
          id: "Pembeli masuk dengan surat kuasa yang kamu tanda tangani dan fotokopi KTP kamu. Lummy belum menyimpan KTP, jadi setelah terjual kamu menandatangani draf suratnya dan menyerahkan keduanya ke pembeli sendiri.",
        },
    tone: "info",
  },
  id_match: {
    label: { en: "ID must match the name", id: "KTP harus cocok dengan nama" },
    buyer: {
      en: "The organiser checks that your ID card matches the name on the ticket, so you could be turned away even with a genuine ticket. If that happens, file a claim with a photo from the gate and you get your money back in full.",
      id: "Penyelenggara mengecek apakah nama di KTP sama dengan nama di tiket, jadi kamu bisa ditolak walaupun tiketnya asli. Kalau itu terjadi, ajukan klaim dengan foto dari gate dan uangmu kembali penuh.",
    },
    seller: ID_STAGED
      ? {
          en: "The organiser matches ID cards to names, so a buyer may be refused over the name. That sale is refunded, without a penalty for you as long as your ID card is staged for the gate.",
          id: "Penyelenggara mencocokkan KTP dengan nama, jadi pembeli bisa ditolak karena nama. Penjualan itu di-refund, tanpa penalti untukmu selama KTP kamu sudah disiapkan untuk gate.",
        }
      : {
          en: "The organiser matches ID cards to names, so a buyer may be refused over the name. Lummy cannot stage your ID card for the gate yet, so that refusal counts as a failed ticket: the sale is refunded with the seller penalty.",
          id: "Penyelenggara mencocokkan KTP dengan nama, jadi pembeli bisa ditolak karena nama. Lummy belum bisa menyiapkan KTP kamu untuk gate, jadi penolakan itu dihitung tiket gagal: penjualan di-refund dengan penalti penjual.",
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
    en: "We have not confirmed this show's name rules yet. Lummy gives you a draft letter of authorisation, but the gate staff have the final say.",
    id: "Aturan nama untuk acara ini belum kami pastikan. Lummy memberimu draf surat kuasa, tapi keputusan akhir ada di petugas gate.",
  },
  seller: ID_STAGED
    ? {
        en: "We have not confirmed this show's name rules yet. If the venue checks ID, stage your ID card in the next step.",
        id: "Aturan nama acara ini belum kami pastikan. Kalau venue mengecek KTP, siapkan KTP kamu di langkah berikutnya.",
      }
    : {
        en: "We have not confirmed this show's name rules yet. If the venue checks ID, sign the draft letter after the sale and give it to the buyer with a copy of your ID card.",
        id: "Aturan nama acara ini belum kami pastikan. Kalau venue mengecek KTP, tanda tangani draf suratnya setelah terjual dan serahkan ke pembeli bersama fotokopi KTP-mu.",
  },
  tone: "info",
};

export const transferPolicyMeta = (p: TransferPolicy | null | undefined): TransferPolicyMeta =>
  p ? TRANSFER_POLICY[p] : UNCONFIRMED;

/** Listings stay closed for a show whose organiser forbids resale. */
export const resaleAllowed = (p: TransferPolicy | null | undefined) => p !== "no_resale";

/** The buyer confirms the name risk before paying. */
export const needsNameAcknowledgement = (p: TransferPolicy | null | undefined) => p === "id_match";
