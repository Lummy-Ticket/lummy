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

/**
 * Whether QRIS is switched on here, in test mode or live, and its ceiling per payment; and whether a
 * show priced in USDC can be paid from the buyer's own wallet (tasks/founder-house-usdc.md).
 */
export type PaymentsConfig = { enabled: boolean; testMode: boolean; max: number; usdc: boolean };

/** One EIP-712 message as eth_signTypedData_v4 takes it: domain, field types, the message itself. */
export type TypedMessage = {
  domain: { name: string; version: string; chainId: number; verifyingContract: string };
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, string>;
};

/** A USDC hold, as POST /api/payments hands it back: what the wallet signs, bigints as strings. */
export type UsdcStart = {
  payment: PaymentView;
  wallet: string;
  /** Micro-USDC, as a decimal string. */
  value: string;
  chainId: number;
  token: string;
  escrow: string;
  auth: TypedMessage;
  fund: TypedMessage;
};

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
