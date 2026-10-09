/**
 * Runs the AI-extraction cleaner (docs/09 §5.1) on ticket PDFs on this machine and prints exactly
 * what would be sent to a model, so a person can check on real e-tickets that no name, NIK, email,
 * phone number, order code or barcode gets through before the extraction is switched on. Nothing
 * leaves the machine. Pass the names to take out as a seller would type them.
 *
 *   npm run tickets:clean -- ~/tickets/coldplay.pdf --name "Luthfi Hadi"
 */
import { readFile } from "fs/promises";
import path from "path";
import { TicketError } from "../src/lib/tickets/analyze";
import { prepareForExtraction } from "../src/lib/tickets/extract";

async function main() {
  const args = process.argv.slice(2);
  const names: string[] = [];
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--name" && args[i + 1]) names.push(args[++i]);
    else files.push(args[i]);
  }
  if (!files.length) {
    console.error('usage: npm run tickets:clean -- <ticket.pdf> [more.pdf ...] [--name "Holder Name"]');
    process.exit(2);
  }
  for (const file of files) {
    const name = path.basename(file);
    try {
      const r = await prepareForExtraction(new Uint8Array(await readFile(file)), names);
      if (!r.ok) {
        console.log(`\n${name}\n  NOT SENT   ${r.reason}${r.left ? ` (${r.left.join(", ")})` : ""}`);
        continue;
      }
      const removed = Object.entries(r.removed).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(", ");
      console.log(`\n${name}\n  would send pages ${r.pages.join(", ")}, ${r.text.length} characters; removed: ${removed || "nothing"}`);
      console.log("  ----- exactly what the model would read -----");
      console.log(r.text.split("\n").map((l) => `  | ${l}`).join("\n"));
      console.log("  ---------------------------------------------");
    } catch (e) {
      console.log(`\n${name}\n  refused    ${e instanceof TicketError ? `${e.code}: ${e.message}` : String(e)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
