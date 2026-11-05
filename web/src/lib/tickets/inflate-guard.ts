// A PDF small enough to upload can hold a stream that inflates to a gigabyte, and pdf.js then
// spends tens of seconds and gigabytes on it: a 1 MB file took 38 s and 2.5 GB in the audit of
// 4 Nov 2026. Before pdf.js sees a ticket, every Flate stream in it is inflated here against one
// budget for the whole file, with zlib stopping at the budget, and a file past it is refused. So
// is a Flate stream zlib cannot read, since its size could not be counted. Server only.
import { constants, inflateSync } from "node:zlib";
import { MAX_TICKET_BYTES, TicketError } from "./analyze";

if (typeof window !== "undefined") throw new Error("lib/tickets/inflate-guard is server-only");

/** Decoded bytes a whole ticket PDF may hold. An e-ticket with a few pages and images is a few MB. */
export const MAX_INFLATED_BYTES = 64 * 1024 * 1024;

/** The dictionary in front of a stream is at most this far back; ticket PDFs keep it short. */
const DICT_LOOKBACK = 4096;

/**
 * The inflated size of the file's Flate streams, counted until `budget`: Infinity once past it,
 * NaN when a Flate stream cannot be read.
 */
export function inflatedSize(bytes: Uint8Array, budget = MAX_INFLATED_BYTES): number {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let total = 0;
  for (let from = 0; ; ) {
    const at = buf.indexOf("stream", from, "latin1");
    if (at < 0) return total;
    from = at + 6;
    // "endstream" holds the word too, and only "stream" followed by an end of line opens one.
    if (at >= 3 && buf.toString("latin1", at - 3, at) === "end") continue;
    let start = at + 6;
    if (buf[start] === 0x0d) start++;
    if (buf[start] === 0x0a) start++;
    if (start === at + 6) continue;
    const end = buf.indexOf("endstream", start, "latin1");
    if (end < 0) return total;
    from = end + 9;
    const dict = buf.toString("latin1", Math.max(0, at - DICT_LOOKBACK), at);
    const head = dict.slice(dict.lastIndexOf(" obj") + 1);
    if (!/\/FlateDecode\b/.test(head)) continue;
    try {
      // Sync flush: a stream cut short still gives what it holds, as pdf.js reads it.
      total += inflateSync(buf.subarray(start, end), { maxOutputLength: budget - total + 1, finishFlush: constants.Z_SYNC_FLUSH }).length;
    } catch (e) {
      if ((e as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") return Infinity;
      return NaN;
    }
    if (total > budget) return Infinity;
  }
}

/** Refuses a ticket whose streams inflate past the budget, or cannot be counted, before pdf.js opens it. */
export function assertInflatesWithin(bytes: Uint8Array, budget = MAX_INFLATED_BYTES) {
  // A file over the upload limit is refused by its size alone, without inflating anything.
  if (bytes.length > MAX_TICKET_BYTES) return;
  const size = inflatedSize(bytes, budget);
  if (size === Infinity) throw new TicketError("unreadable", `its streams inflate to more than ${budget / 1024 / 1024} MB`);
  if (Number.isNaN(size)) throw new TicketError("unreadable", "a compressed stream in it cannot be read");
}
