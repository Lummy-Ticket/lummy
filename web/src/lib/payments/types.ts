// What the QRIS routes answer (docs/09 §6), shared by the server and the checkout page.
export type PaymentStatus = "pending" | "paid" | "unfulfilled" | "expired" | "canceled" | "failed";

/** One hold as its buyer sees it. The code to scan only while it can still be paid. */
export type PaymentView = {
  id: string;
  status: PaymentStatus;
  amount: number;
  expiresAt: string;
  qrString: string | null;
  testMode: boolean;
  orderId: string | null;
};

/** Whether QRIS is switched on here, in test mode or live, and its ceiling per payment. */
export type PaymentsConfig = { enabled: boolean; testMode: boolean; max: number };
