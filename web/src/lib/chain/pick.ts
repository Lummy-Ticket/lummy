// Which record a proof page shows for an id that was looked up in both contracts (lib/chain/history,
// readAnyHistory). The ledger wins: only Lummy's operator writes it, while anyone may create an
// escrow listing under any id, a ledger record's included, and the ids are public in its events. So
// an escrow answer is taken only when the ledger read worked and holds nothing for the id: with the
// ledger unreadable, an escrow answer could be someone's copy of a QRIS record (contract audit,
// 4 Nov 2026). Plain, so access:check can try it offline.

export type Read<T> = { ok: true; value: T | null } | { ok: false; error: unknown };

/** `ledgerAsked`: the ledger was read at all (not when the page named the escrow as the source). */
export function pickRecord<T>(escrow: Read<T>, ledger: Read<T>, ledgerAsked: boolean, found: (v: T) => boolean): T | null {
  if (ledger.ok && ledger.value && found(ledger.value)) return ledger.value;
  if (ledgerAsked && !ledger.ok) throw ledger.error;
  if (escrow.ok && escrow.value && found(escrow.value)) return escrow.value;
  if (!escrow.ok) throw escrow.error;
  return null;
}
