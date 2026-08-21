import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PayoutBank = "BCA" | "Mandiri" | "BNI" | "BRI";

interface ProfileState {
  phone: string;
  kycVerified: boolean;
  payoutBank: PayoutBank | null;
  payoutNumber: string;
  setPhone: (p: string) => void;
  verifyKyc: () => void;
  setPayout: (bank: PayoutBank, number: string) => void;
}

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      phone: "0812-3456-7890",
      kycVerified: false,
      payoutBank: null,
      payoutNumber: "",
      setPhone: (phone) => set({ phone }),
      verifyKyc: () => set({ kycVerified: true }),
      setPayout: (payoutBank, payoutNumber) => set({ payoutBank, payoutNumber }),
    }),
    { name: "lummy:profile" }
  )
);
