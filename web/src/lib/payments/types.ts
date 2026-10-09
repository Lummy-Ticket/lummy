// What the QRIS routes answer (docs/09 §6), shared by the server and the checkout page.
/** `refunded`: money that came without an order, sent back by staff (admin, Payments). Final, like paid. */
export type PaymentStatus = "pending" | "paid" | "unfulfilled" | "refunded" | "expired" | "canceled" | "failed";

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

// --- Staff view of money that needs a person (GET /api/admin/payments).

export type StaffPayment = {
  id: string;
  status: string;
  total: number;
  testMode: boolean;
  /** Xendit's payment number (py-...), what its dashboard searches by. */
  number: string | null;
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
  refundNote: string | null;
  eventTitle: string;
  /** Who to send the money back to; only on payments waiting for a refund, or refunded. */
  buyer: { name: string; email: string | null } | null;
  /** Last moment Xendit can still refund the QRIS itself. */
  refundBy: string | null;
  orderId: string | null;
  ledgerId: string | null;
  ledgerStatus: string | null;
};

export type StuckRecord = { id: string; eventTitle: string; amount: number; escrowStatus: string; error: string; ledgerId: string | null };

export type PaymentsOverview = {
  needsRefund: StaffPayment[];
  refunded: StaffPayment[];
  recent: StaffPayment[];
  stuck: StuckRecord[];
  ledger: { contract: string; chainId: number; operator: string | null; gasEth: string | null; low: boolean; waiting: number } | null;
};
