// A PDF small enough to upload can hold a stream that inflates to a gigabyte, and pdf.js then
// spends tens of seconds and gigabytes on it: a 1 MB file took 38 s and 2.5 GB in the audit of
// 4 Nov 2026. Before pdf.js sees a ticket, every stream in it that starts like zlib data is
// inflated here, holding none of the output, and counted against one budget for the whole file.
//
// It must not refuse a real ticket, and a first version did. Of the real PDFs tried on 5 Nov 2026,
// the largest holds 131 MB of flat images and reads in under 6 s, and one wraps its streams in a
// second filter, so zlib cannot read them as they stand; pdf.js reads both. So the budget is about
// twice that largest file, and a stream zlib gives up on counts up to where it broke, for pdf.js to
// judge. A stream is recognised by its bytes rather than by its dictionary, which also catches /Fl,
// an indirect /Filter and a dictionary padded out of reach.
//
// A first line, not a wall: a bomb under a second filter, or in an encrypted file (a ticket locked
// with only an owner password opens without one, so those stay allowed), is not counted. Behind this
// stand the attempt limit per account and the function's own memory limit. Server only.
import { constants, createInflate } from "node:zlib";
import { MAX_TICKET_BYTES, TicketError } from "./analyze";

if (typeof window !== "undefined") throw new Error("lib/tickets/inflate-guard is server-only");

/** Decoded bytes a whole ticket PDF may hold. */
export const MAX_INFLATED_BYTES = 256 * 1024 * 1024;
/** Each stream costs a zlib handle to count. The most seen on a real ticket is 234. */
export const MAX_INFLATED_STREAMS = 20_000;

/** The inflated length of one stream, or Infinity past `limit`. A broken one counts up to the break. */
function inflatedLength(data: Buffer, limit: number): Promise<number> {
  return new Promise((resolve) => {
    let length = 0;
    // Sync flush: a stream cut short still gives what it holds, as pdf.js reads it.
    const zlib = createInflate({ finishFlush: constants.Z_SYNC_FLUSH });
    zlib.on("data", (chunk: Buffer) => {
      length += chunk.length;
      if (length > limit) {
        zlib.destroy();
        resolve(Infinity);
      }
    });
    zlib.on("end", () => resolve(length));
    zlib.on("error", () => resolve(length));
    zlib.end(data);
  });
}

/** RFC 1950: the compression method in the low bits, and the two bytes a multiple of 31. */
const looksLikeZlib = (buf: Buffer, at: number) => at + 1 < buf.length && (buf[at] & 0x0f) === 8 && (buf[at] * 256 + buf[at + 1]) % 31 === 0;

/** The inflated size of the file's zlib streams, counted until `budget`: Infinity once past it, or past the stream limit. */
export async function inflatedSize(bytes: Uint8Array, budget = MAX_INFLATED_BYTES): Promise<number> {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let total = 0;
  let streams = 0;
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
    // pdf.js reads a stream with no end marker through to the end of the file, so this does too.
    const found = buf.indexOf("endstream", start, "latin1");
    const end = found < 0 ? buf.length : found;
    from = end + 9;
    if (!looksLikeZlib(buf, start)) continue;
    if (++streams > MAX_INFLATED_STREAMS) return Infinity;
    total += await inflatedLength(buf.subarray(start, end), budget - total);
    if (total > budget) return Infinity;
  }
}

/** Refuses a ticket whose streams inflate past the budget, before pdf.js opens it. */
export async function assertInflatesWithin(bytes: Uint8Array, budget = MAX_INFLATED_BYTES) {
  // A file over the upload limit is refused by its size alone, without inflating anything.
  if (bytes.length > MAX_TICKET_BYTES) return;
  if ((await inflatedSize(bytes, budget)) === Infinity) throw new TicketError("unreadable", `its streams inflate to more than ${budget / 1024 / 1024} MB, or there are too many`);
}
