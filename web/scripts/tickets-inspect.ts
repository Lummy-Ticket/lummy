/**
 * Reads ticket PDFs on this machine and prints what Lummy's check would see, to try the reader on
 * real tickets before any seller uploads one. Nothing leaves the machine and payloads are never
 * printed: only each barcode's format, page and last four characters. Files that carry the same
 * barcode are pointed out (keys use a pepper made for this run only).
 *
 *   npm run tickets:inspect -- ~/tickets/coldplay.pdf ~/tickets/tulus.pdf
 */
import { randomBytes } from "crypto";
import { readFile } from "fs/promises";
import path from "path";
import { analyzeTicket, TicketError } from "../src/lib/tickets/analyze";

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error("usage: npm run tickets:inspect -- <ticket.pdf> [more.pdf ...]");
    process.exit(2);
  }
  const pepper = randomBytes(32).toString("hex");
  const seen = new Map<string, string>();
  for (const file of files) {
    const name = path.basename(file);
    try {
      const started = Date.now();
      const a = await analyzeTicket(new Uint8Array(await readFile(file)), pepper);
      const f = a.forensics;
      console.log(`\n${name}  (${Math.round(a.size / 1024)} KB, ${a.pages} page${a.pages === 1 ? "" : "s"}, ${Date.now() - started} ms)`);
      console.log(`  made by    ${f.producer ?? "-"}${f.creator && f.creator !== f.producer ? ` / ${f.creator}` : ""}`);
      console.log(`  structure  ${f.revisions} revision${f.revisions === 1 ? "" : "s"}${f.linearized ? ", linearized" : ""}${f.signed ? ", signed" : ""}${f.encrypted ? ", encrypted" : ""}`);
      console.log(`  verdict    ${f.suspicious ? "goes to review" : "clean"}, score ${f.score}/100`);
      for (const r of f.reasons) console.log(`             ${JSON.stringify(r)}`);
      if (!a.barcodes.length) console.log(`  barcodes   none read on ${a.scannedPages} page${a.scannedPages === 1 ? "" : "s"}`);
      for (const b of a.barcodes) {
        const twin = seen.get(b.key);
        console.log(`  barcode    ${b.format} on page ${b.page}${b.tail ? `, ends ...${b.tail}` : ""}${twin ? `  (same barcode as ${twin})` : ""}`);
        if (!twin) seen.set(b.key, name);
      }
    } catch (e) {
      console.log(`\n${name}\n  refused    ${e instanceof TicketError ? `${e.code}: ${e.message}` : String(e)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
