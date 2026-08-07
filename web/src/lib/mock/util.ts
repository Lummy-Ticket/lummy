// Mock on-chain + money helpers.

export const CONTRACT_ADDRESS = "0x7c3F1a4e9B2d5A8c6E0f13B9aD4c2E7f0A9b3C1d";

export const mockTxHash = () =>
  "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

export const explorerTx = (h: string) => `https://testnet.monadexplorer.com/tx/${h}`;
export const explorerAddr = (a: string) => `https://testnet.monadexplorer.com/address/${a}`;

// Fee model (docs): pass-through materai + platform fee max(5%, Rp25.000).
export const MATERAI = 12000;
export const platformFee = (price: number) => Math.max(Math.round(price * 0.05), 25000);

export const shortHash = (h: string, n = 6) => `${h.slice(0, n + 2)}…${h.slice(-4)}`;

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

// event date + 2 hari = auto-release window (dispute window 48 jam sesudah event)
export const releaseDeadline = (eventISO: string) => {
  const d = new Date(eventISO);
  d.setDate(d.getDate() + 2);
  return d.toISOString();
};
