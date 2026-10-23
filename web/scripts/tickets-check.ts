/**
 * Checks the ticket reader (src/lib/tickets) on PDFs made here, so nothing real is needed or
 * kept: a genuine ticket, the same ticket edited three ways, another file carrying the same
 * barcode, two tickets in one PDF (a QR image and a Code 128 drawn as shapes), and files with
 * no barcode, with a script, or that are not PDFs at all.
 *
 *   npm run tickets:check
 */
import { analyzeTicket, TicketError, type TicketAnalysis } from "../src/lib/tickets/analyze";
import { barcodeKey } from "../src/lib/tickets/barcode";
import { judge, parsePdfDate, scanStructure, toolHits, type ForensicReason } from "../src/lib/tickets/forensics";
import { GENUINE, appendRevision, genuineTicket, initWriter, latin1, rewrite, ticketPdf, withScript } from "./ticket-fixtures";

const PEPPER = "tickets-check, not a real pepper";

const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => results.push({ name, ok, note: ok ? undefined : note });
const codes = (a: TicketAnalysis) => a.forensics.reasons.map((r) => r.code).sort().join(",");

async function timed(name: string, bytes: Uint8Array) {
  const t = Date.now();
  const a = await analyzeTicket(bytes, PEPPER);
  console.log(`  ${name.padEnd(18)} ${String(Date.now() - t).padStart(5)} ms  barcodes=${a.barcodes.length} score=${a.forensics.score} reasons=[${codes(a)}]`);
  return a;
}

async function expectError(name: string, bytes: Uint8Array, code: TicketError["code"]) {
  try {
    await analyzeTicket(bytes, PEPPER);
    check(name, false, "no error");
  } catch (e) {
    check(name, e instanceof TicketError && e.code === code, String(e));
  }
}

async function main() {
  await initWriter();

  // --- Pure parts
  check("date: D:20260115093000+07'00' is 02:30 UTC", parsePdfDate("D:20260115093000+07'00'")?.toISOString() === "2026-01-15T02:30:00.000Z");
  check("date: rubbish gives null", parsePdfDate("yesterday") === null);
  const kinds = (s: string) => toolHits([s]).map((h) => h.kind).join(",");
  check("tools: Acrobat Pro is an editor", kinds("Adobe Acrobat Pro (64-bit) 23.6") === "editor");
  check("tools: headless Chrome is not flagged", kinds("Skia/PDF m128") === "");
  check("tools: Canva is a design tool, a canvas library is not", kinds("Canva") === "design" && kinds("node-canvas 2.11") === "");
  check("tools: Print to PDF is a printed copy", kinds("Microsoft: Print To PDF") === "print");
  const pad = "x".repeat(300);
  const linear = scanStructure(latin1(`%PDF-1.7\n1 0 obj << /Linearized 1 >> endobj\n${pad}\n%%EOF\n${pad}\n%%EOF\n`));
  check("structure: a linearized file is one revision", linear.linearized && linear.revisions === 1, JSON.stringify(linear));
  const signedThenChanged = scanStructure(latin1(`%PDF-1.7\n${pad}/ByteRange [0 100 150 50]${pad}\n%%EOF\n${pad}\n%%EOF\n`));
  check("structure: bytes after the signature", judge(signedThenChanged, {}).reasons.some((r) => r.code === "signed_then_changed"));
  const body = `%PDF-1.7\n/ByteRange [0 100 150 0000000000]${pad}\n%%EOF\n`;
  const signed = scanStructure(latin1(body.replace("0000000000", String(body.length - 150).padStart(10, "0"))));
  check("structure: a signature over the whole file is fine", judge(signed, {}).reasons.length === 0, JSON.stringify(judge(signed, {}).reasons));
  check("structure: data after the end", judge(scanStructure(latin1(`%PDF-1.7\n${pad}\n%%EOF\n<script>x</script>`)), {}).reasons.some((r) => r.code === "appended"));
  const k = barcodeKey(latin1(GENUINE), PEPPER);
  check("key: same payload, same key", k === barcodeKey(latin1(GENUINE), PEPPER) && /^[0-9a-f]{64}$/.test(k));
  check("key: another pepper, another key", k !== barcodeKey(latin1(GENUINE), "another pepper"));

  // --- Files
  console.log("analysing generated tickets:");
  const genuinePdf = await genuineTicket();
  const genuine = await timed("genuine", genuinePdf);
  check("genuine: one QR code read", genuine.barcodes.length === 1 && genuine.barcodes[0].format === "QRCode", JSON.stringify(genuine.barcodes));
  check("genuine: key is the HMAC of the payload", genuine.barcodes[0]?.key === k);
  check("genuine: only the last four characters are kept", genuine.barcodes[0]?.tail === "2290");
  check("genuine: clean, score 0", !genuine.forensics.suspicious && genuine.forensics.score === 0, JSON.stringify(genuine.forensics.reasons));
  check("genuine: sha256 of the file", /^[0-9a-f]{64}$/.test(genuine.sha256) && genuine.size === genuinePdf.length);

  // An editor copies the old info into the new revision and moves ModDate on.
  const incremental = await timed(
    "edited, saved on",
    appendRevision(genuinePdf, "/Producer (Lummy test issuer PDF engine) /CreationDate (D:20260901100000+07'00') /ModDate (D:20260920120000+07'00')")
  );
  check("incremental save: revised and modified later", codes(incremental) === "modified_later,revised" && incremental.forensics.suspicious, codes(incremental));
  check("incremental save: same barcode still read", incremental.barcodes[0]?.key === k);

  const rewritten = await timed("edited, iLovePDF", await rewrite(genuinePdf, "iLovePDF"));
  const tool = (a: TicketAnalysis, code: ForensicReason["code"]) => a.forensics.reasons.find((r) => r.code === code) as { tool?: string } | undefined;
  check("iLovePDF rewrite: editor named", tool(rewritten, "editor")?.tool === "iLovePDF" && rewritten.forensics.suspicious, codes(rewritten));

  const redrawn = await timed("redrawn in Canva", await ticketPdf({ codes: [{ text: GENUINE, format: "QRCode", vector: true }], producer: "Canva", creator: "Canva", name: "Budi Santoso" }));
  check("redrawn in Canva: design tool, suspicious", tool(redrawn, "design")?.tool === "Canva" && redrawn.forensics.suspicious, codes(redrawn));
  check("redrawn in Canva: same barcode, same key as the genuine file", redrawn.barcodes[0]?.key === k, JSON.stringify(redrawn.barcodes));

  const two = await timed("two tickets", await ticketPdf({
    codes: [{ text: "LMY|ev-5sos-jakarta|CAT3|C-12|1111-2222-3333", format: "QRCode" }, { text: "TIX88427731", format: "Code128", vector: true }],
    producer: "Lummy test issuer PDF engine",
  }));
  check("two tickets: both codes, one per page", two.barcodes.length === 2 && two.barcodes.map((b) => `${b.format}@${b.page}`).join(" ") === "QRCode@1 Code128@2", JSON.stringify(two.barcodes));
  check("two tickets: different keys", two.barcodes.length === 2 && two.barcodes[0].key !== two.barcodes[1].key);

  const none = await timed("no barcode", await ticketPdf({ codes: [], producer: "Lummy test issuer PDF engine" }));
  check("no barcode: nothing read, nothing invented", none.barcodes.length === 0 && none.scannedPages === 1);

  const js = await timed("with a script", await withScript(genuinePdf));
  check("script: active content flagged", js.forensics.reasons.some((r) => r.code === "active_content") && js.forensics.suspicious, codes(js));

  await expectError("not a PDF is refused", latin1("hello, this is a jpeg"), "not_pdf");
  await expectError("a broken PDF is refused", latin1(`%PDF-1.7\n${pad}`), "unreadable");
  const big = new Uint8Array(4 * 1024 * 1024 + 1);
  big.set(latin1("%PDF-1.7\n"));
  await expectError("over 4 MB is refused", big, "too_big");

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? `  (${r.note.slice(0, 160)})` : ""}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks pass`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
