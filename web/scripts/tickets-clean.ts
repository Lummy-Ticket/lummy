/**
 * Runs the AI-extraction cleaner (docs/09 §5.1) on ticket PDFs on this machine and prints exactly
 * what would be sent to a model, so a person can check on real e-tickets that no name, NIK, email,
 * phone number, order code or barcode gets through before the extraction is switched on. Nothing
 * leaves the machine. Pass the names to take out as a seller would type them.
 *
 * Once the printed text has been read and is clean, --ask sends it to Claude, as the server would at
 * publish, and prints what was read, given the show's categories as the seller would pick from them
 * (a past show is not in the catalogue). The key comes from ~/.lummy/production.env and is never
 * printed. A file the cleaner refuses is never sent.
 *
 * Names and categories can sit in a note next to each PDF, so they are typed in neither the command
 * nor a chat: for coldplay.pdf, coldplay.txt with lines like "nama: Luthfi Hadi" and
 * "kategori: CAT 1, CAT 3, Festival". --name and --tiers add to them for every file.
 *
 *   npm run tickets:clean -- ~/tiket-asli/*.pdf
 *   npm run tickets:clean -- ~/tiket-asli/*.pdf --ask
 *   npm run tickets:clean -- ~/tickets/coldplay.pdf --name "Luthfi Hadi" --ask --tiers "CAT 1,CAT 3,Festival"
 */
import { readFileSync } from "fs";
import { readFile } from "fs/promises";
import { homedir } from "os";
import path from "path";
import { extractTicketFacts, type ShowForTicket } from "../src/lib/tickets/ai";
import { TicketError } from "../src/lib/tickets/analyze";
import { prepareForExtraction } from "../src/lib/tickets/extract";

/** Only the Claude lines of the env file; nothing else in it is loaded. */
function loadClaudeKey() {
  if (process.env.ANTHROPIC_API_KEY) return true;
  try {
    for (const line of readFileSync(`${homedir()}/.lummy/production.env`, "utf8").split("\n")) {
      const m = /^(ANTHROPIC_API_KEY|CLAUDE_[A-Z_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // No file: the check below says what is missing.
  }
  return !!process.env.ANTHROPIC_API_KEY;
}

const list = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);

/** The names and categories in the note next to a PDF, if there is one. */
function note(file: string) {
  const names: string[] = [];
  const tiers: string[] = [];
  let text = "";
  try {
    text = readFileSync(file.replace(/\.pdf$/i, ".txt"), "utf8");
  } catch {
    return { names, tiers, found: false };
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(nama|name|kategori|category|tiers?)\s*:\s*(.+)$/i.exec(line);
    if (m) (/^(nama|name)$/i.test(m[1]) ? names : tiers).push(...list(m[2]));
  }
  return { names, tiers, found: true };
}

async function main() {
  const args = process.argv.slice(2);
  const names: string[] = [];
  const files: string[] = [];
  let ask = false;
  let tiers: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--name" && args[i + 1]) names.push(args[++i]);
    else if (args[i] === "--tiers" && args[i + 1]) tiers = list(args[++i]);
    else if (args[i] === "--ask") ask = true;
    else files.push(args[i]);
  }
  if (!files.length) {
    console.error('usage: npm run tickets:clean -- <ticket.pdf> [more.pdf ...] [--name "Holder Name"] [--ask --tiers "VIP,CAT 1"]');
    process.exit(2);
  }
  if (ask && !loadClaudeKey()) {
    console.error("No ANTHROPIC_API_KEY: set it with web/scripts/set-secret.sh (docs/config/01-claude.md).");
    process.exit(1);
  }

  for (const file of files) {
    const name = path.basename(file);
    const n = note(file);
    const fileNames = [...n.names, ...names];
    const fileTiers = [...n.tiers, ...tiers];
    console.log(`\n${name}`);
    try {
      if (!fileNames.length) console.log(`  note       no buyer's name given (${n.found ? "the note has no nama: line" : "no note next to it"}), so only labelled names are taken out`);
      const r = await prepareForExtraction(new Uint8Array(await readFile(file)), fileNames);
      if (!r.ok) {
        console.log(`  NOT SENT   ${r.reason}${r.left ? ` (${r.left.join(", ")})` : ""}`);
        continue;
      }
      const removed = Object.entries(r.removed).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(", ");
      console.log(`  would send pages ${r.pages.join(", ")}, ${r.text.length} characters; removed: ${removed || "nothing"}`);
      console.log("  ----- exactly what the model would read -----");
      console.log(r.text.split("\n").map((l) => `  | ${l}`).join("\n"));
      console.log("  ---------------------------------------------");
      if (!ask) continue;
      // The server asks for the original buyer's name before a real ticket is read, and so does this.
      if (!fileNames.length) {
        console.log("  Claude: not asked, no buyer's name given (a nama: line in the note, or --name)");
        continue;
      }
      if (!fileTiers.length) {
        console.log("  Claude: not asked, no categories given (a kategori: line in the note, or --tiers)");
        continue;
      }
      const show: ShowForTicket = { tiers: fileTiers.map((t, i) => ({ id: `tier-${i + 1}`, name: t })) };
      const res = await extractTicketFacts(r.text, show, { provider: "claude" });
      if (!res.ok) {
        console.log(`  Claude: no answer, ${res.reason}${res.detail ? ` (${res.detail})` : ""}`);
        continue;
      }
      const f = res.facts;
      const tier = show.tiers.find((t) => t.id === f.tierId)?.name ?? "none of the categories given";
      console.log(`  Claude (${res.model}, ${res.ms} ms, ${res.tokens.in} tokens in, ${res.tokens.out} out) read:`);
      console.log(`    category   ${tier} (printed: ${f.tierPrinted ?? "-"})`);
      console.log(`    date       ${f.date ?? "-"}`);
      console.log(`    title      ${f.eventTitle ?? "-"}`);
      console.log(`    venue      ${f.venue ?? "-"}`);
      console.log(`    seat       ${f.seat ?? "-"}`);
      console.log(`    price      ${f.printedPrice ?? "-"}`);
      console.log(`    people     ${f.quantity ?? "-"}`);
    } catch (e) {
      console.log(`  refused    ${e instanceof TicketError ? `${e.code}: ${e.message}` : String(e)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
