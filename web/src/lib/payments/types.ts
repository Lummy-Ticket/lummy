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

/** One payment through NEAR Intents, as its buyer sees it (lib/payments/intents.ts). */
export type IntentView = {
  payment: PaymentView;
  /** What to send, and where. */
  deposit: { address: string; memo: string | null; amount: string; usd: string | null; symbol: string; chainLabel: string; etaSeconds: number | null };
  swapStatus: "PENDING_DEPOSIT" | "KNOWN_DEPOSIT_TX" | "INCOMPLETE_DEPOSIT" | "PROCESSING" | "SUCCESS" | "REFUNDED" | "FAILED";
  /** The contract this order's money lands on, on Arbitrum One. */
  receiver: string;
  refundTo: string;
  /** Unix seconds: from then on the money can only go back to refundTo. */
  refundAfter: number;
  /** The order as LummyIntentFactory takes it: with these, anyone can deploy the receiver and sweep it. */
  terms: { factory: string; listingId: string; seller: string; price: string; eventEndsAt: number; refundTo: string; refundAfter: number };
  swapUrl: string;
  originTx: string | null;
  arrivalTx: string | null;
};
export type IntentStart = IntentView;

/** What the NEAR HACKATHON demo can do here (GET /api/near/options). */
export type NearOptions = {
  assets: { assetId: string; symbol: string; chain: string; chainLabel: string; evm: boolean; chainId: number | null; contract: string | null; decimals: number }[];
  rail: boolean;
  team: boolean;
  ticketAi: boolean;
  chainId: number;
  escrow: string | null;
  factory: string | null;
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
