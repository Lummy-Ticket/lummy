// What the bytes of a ticket PDF say about how it was made and whether it was changed afterwards
// (docs/09 §5.3). Pure functions over the raw bytes and the document info, so they run anywhere
// and are tested on their own. The verdict is a signal for a person, never a gate: a flagged
// listing waits for review, it is not refused.

/** Why a file was flagged. The page turns each code into a sentence. */
export type ForensicReason =
  | { code: "revised"; extra: number } // saved again after it was made, extra = revisions beyond the first
  | { code: "signed_then_changed" } // carries a signature, and bytes were added after it
  | { code: "editor"; tool: string } // made or re-saved with a PDF editor
  | { code: "design"; tool: string } // drawn in a design or office tool
  | { code: "print"; tool: string } // printed to PDF: a copy, not the file the organiser sent
  | { code: "modified_later"; days: number } // changed days after it was created
  | { code: "active_content"; what: string[] } // scripts, launch actions, attachments: no ticket needs them
  | { code: "appended"; bytes: number }; // data after the end of the file

export type ToolKind = "editor" | "design" | "print";

export type PdfStructure = {
  version: string | null;
  /** Count of %%EOF markers: one per save, plus one extra in a linearized ("fast web view") file. */
  eofMarkers: number;
  linearized: boolean;
  /** Saves the file went through. 1 = written once. */
  revisions: number;
  /** End offset of each signature's signed byte range, and whether it reaches the end of the file. */
  signatures: { end: number; coversFile: boolean }[];
  encrypted: boolean;
  /** Non-whitespace bytes after the last %%EOF. */
  appendedBytes: number;
  /** Producer and Creator strings found anywhere in the raw bytes, older revisions included. */
  rawTools: string[];
  /** Active-content names seen in the raw bytes. Object streams can hide these; the parser adds what it finds. */
  activeKeywords: string[];
};

export type DocInfo = {
  producer?: string | null;
  creator?: string | null;
  creationDate?: string | null;
  modDate?: string | null;
  /** Raw XMP packet, when the file has one. */
  xmp?: string | null;
  /** Active content the parser found (document scripts, attachments, XFA forms). */
  activeContent?: string[];
};

export type Forensics = {
  suspicious: boolean;
  /** 0-100, the sum of the weights below. 60 or more reads "needs review" on the page. */
  score: number;
  reasons: ForensicReason[];
  producer: string | null;
  creator: string | null;
  revisions: number;
  linearized: boolean;
  signed: boolean;
  encrypted: boolean;
};

/**
 * Tools that leave their name in the file. Editors are how a name or a seat gets changed on a
 * real ticket; design and office tools are how a ticket gets redrawn (or how a small organiser
 * makes theirs, which is why this asks a person rather than refusing). Printing to PDF makes a
 * copy that is no longer the file the organiser sent. Headless browsers ("Skia/PDF") and server
 * libraries are what ticketing systems themselves use, so they are deliberately absent.
 */
const TOOLS: { kind: ToolKind; name: string; re: RegExp }[] = [
  { kind: "editor", name: "iLovePDF", re: /ilovepdf/i },
  { kind: "editor", name: "Smallpdf", re: /smallpdf/i },
  { kind: "editor", name: "Sejda", re: /sejda/i },
  { kind: "editor", name: "PDFescape", re: /pdfescape/i },
  { kind: "editor", name: "PDF Candy", re: /pdf ?candy/i },
  { kind: "editor", name: "pdfFiller", re: /pdffiller/i },
  { kind: "editor", name: "DocHub", re: /dochub/i },
  { kind: "editor", name: "PDF24", re: /pdf24/i },
  { kind: "editor", name: "LightPDF", re: /lightpdf/i },
  { kind: "editor", name: "PDFgear", re: /pdfgear/i },
  { kind: "editor", name: "Foxit PDF Editor", re: /foxit ?(phantompdf|pdf ?editor)/i },
  { kind: "editor", name: "Nitro PDF", re: /nitro ?(pdf|pro)/i },
  { kind: "editor", name: "PDF-XChange", re: /pdf-xchange/i },
  { kind: "editor", name: "PDFelement", re: /pdfelement|wondershare/i },
  { kind: "editor", name: "Adobe Acrobat", re: /adobe acrobat (pro|standard|dc)|acrobat pro/i },
  { kind: "editor", name: "Master PDF Editor", re: /master pdf editor/i },
  { kind: "editor", name: "PDF Expert", re: /pdf expert/i },
  { kind: "editor", name: "Xodo", re: /xodo/i },
  { kind: "editor", name: "Soda PDF", re: /soda ?pdf/i },
  { kind: "design", name: "Photoshop", re: /photoshop/i },
  { kind: "design", name: "Illustrator", re: /adobe illustrator/i },
  { kind: "design", name: "Canva", re: /\bcanva\b/i },
  { kind: "design", name: "GIMP", re: /\bgimp\b/i },
  { kind: "design", name: "Inkscape", re: /inkscape/i },
  { kind: "design", name: "CorelDRAW", re: /coreldraw/i },
  { kind: "design", name: "Microsoft Word", re: /microsoft.{0,3}word/i },
  { kind: "design", name: "Microsoft PowerPoint", re: /powerpoint/i },
  { kind: "design", name: "Microsoft Excel", re: /microsoft.{0,3}excel/i },
  { kind: "design", name: "LibreOffice", re: /libreoffice|openoffice/i },
  { kind: "design", name: "WPS Office", re: /\bwps (office|writer)\b/i },
  { kind: "design", name: "Google Docs", re: /google docs/i },
  { kind: "print", name: "Microsoft Print to PDF", re: /microsoft: print to pdf/i },
  { kind: "print", name: "macOS print or Preview", re: /quartz pdfcontext/i },
  { kind: "print", name: "a PDF printer", re: /pdfcreator|cutepdf|bullzip|dopdf|novapdf|primopdf/i },
];

const WEIGHT: Record<ForensicReason["code"], number> = {
  revised: 40,
  signed_then_changed: 50,
  editor: 40,
  design: 30,
  print: 20,
  modified_later: 10,
  active_content: 30,
  appended: 30,
};

/** Codes that send a file to review on their own. The rest only add to the score. */
const SUSPICIOUS = new Set<ForensicReason["code"]>(["revised", "signed_then_changed", "editor", "design", "active_content", "appended"]);

const DAY = 86_400_000;

// latin1 keeps one character per byte, so offsets in the string are offsets in the file.
const asText = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

/** A PDF literal string body, with the common escapes undone. */
function unescapeLiteral(s: string) {
  return s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, e: string) => {
    const map: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
    return map[e] ?? String.fromCharCode(parseInt(e, 8));
  });
}

/** A PDF hex string: UTF-16BE when it starts with a byte-order mark, else one byte per character. */
function decodeHex(hex: string) {
  const h = hex.replace(/\s+/g, "");
  const bytes = Array.from({ length: Math.floor(h.length / 2) }, (_, i) => parseInt(h.slice(i * 2, i * 2 + 2), 16));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return out;
  }
  return String.fromCharCode(...bytes);
}

/** Every value of /Producer and /Creator visible in the raw bytes (not inside compressed streams). */
function rawToolStrings(s: string) {
  const out = new Set<string>();
  // Literal strings may hold balanced parentheses unescaped: "(Adobe Acrobat Pro (64-bit) 23.6)".
  for (const m of s.matchAll(/\/(?:Producer|Creator)\s*(?:\(((?:\\.|\([^()]*\)|[^\\()])*)\)|<([0-9A-Fa-f\s]*)>)/g)) {
    const v = (m[1] !== undefined ? unescapeLiteral(m[1]) : decodeHex(m[2] ?? "")).replace(/^﻿/, "").trim();
    if (v) out.add(v.slice(0, 200));
  }
  return [...out];
}

export function scanStructure(bytes: Uint8Array): PdfStructure {
  const s = asText(bytes);
  const version = s.slice(0, 1024).match(/%PDF-(\d\.\d)/)?.[1] ?? null;
  const eofs = [...s.matchAll(/%%EOF/g)].map((m) => m.index);
  const linearized = /\/Linearized\s/.test(s.slice(0, 4096));
  const revisions = Math.max(1, eofs.length - (linearized && eofs.length >= 2 ? 1 : 0));
  const end = eofs.length ? eofs[eofs.length - 1] + 5 : s.length;
  const appendedBytes = s.slice(end).replace(/[\s\0]/g, "").length;
  const signatures = [...s.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)].map((m) => {
    const signedEnd = Number(m[3]) + Number(m[4]);
    return { end: signedEnd, coversFile: signedEnd >= end };
  });
  const encrypted = /\/Encrypt\s*(?:\d+\s+\d+\s+R|<<)/.test(s);
  const activeKeywords = ["JavaScript", "JS", "Launch", "EmbeddedFile", "RichMedia", "XFA"].filter((k) =>
    new RegExp(`/${k}(?=[\\s/<\\[(>])`).test(s)
  );
  return { version, eofMarkers: eofs.length, linearized, revisions, signatures, encrypted, appendedBytes, rawTools: rawToolStrings(s), activeKeywords };
}

/** "D:20260115093000+07'00'" and its shorter forms. */
export function parsePdfDate(v: string | null | undefined): Date | null {
  const m = v?.match(/^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?\s*(Z|[+-])?(\d{2})?'?(\d{2})?'?/);
  if (!m) return null;
  const [, y, mo = "01", d = "01", h = "00", mi = "00", se = "00", tz, th = "00", tm = "00"] = m;
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
  if (Number.isNaN(utc)) return null;
  const offset = tz === "+" || tz === "-" ? (tz === "+" ? 1 : -1) * (+th * 60 + +tm) * 60_000 : 0;
  return new Date(utc - offset);
}

/** Values of CreatorTool, Producer and every history softwareAgent in an XMP packet. */
function xmpTools(xmp: string | null | undefined) {
  if (!xmp) return [];
  const out: string[] = [];
  for (const m of xmp.matchAll(/(?:xmp:CreatorTool|pdf:Producer|stEvt:softwareAgent)\s*(?:=\s*"([^"]*)"|>([^<]*)<)/g)) {
    const v = (m[1] ?? m[2] ?? "").trim();
    if (v) out.push(v);
  }
  return out;
}

export function toolHits(strings: string[]) {
  const hits = new Map<string, ToolKind>();
  for (const str of strings) for (const t of TOOLS) if (t.re.test(str)) hits.set(t.name, t.kind);
  return [...hits].map(([name, kind]) => ({ name, kind }));
}

export function judge(structure: PdfStructure, info: DocInfo): Forensics {
  const reasons: ForensicReason[] = [];

  const lastSignature = structure.signatures.at(-1);
  if (lastSignature && !lastSignature.coversFile) reasons.push({ code: "signed_then_changed" });
  // A signature on the last revision vouches for the saves before it (an issuer filling a template
  // and then signing it), so only an unsigned file is judged by its revision count.
  else if (!lastSignature && structure.revisions > 1) reasons.push({ code: "revised", extra: structure.revisions - 1 });

  const tools = toolHits([info.producer ?? "", info.creator ?? "", ...structure.rawTools, ...xmpTools(info.xmp)]);
  for (const kind of ["editor", "design", "print"] as const) {
    const names = tools.filter((t) => t.kind === kind).map((t) => t.name);
    if (names.length) reasons.push({ code: kind, tool: names.join(", ") });
  }

  const created = parsePdfDate(info.creationDate);
  const modified = parsePdfDate(info.modDate);
  if (created && modified && modified.getTime() - created.getTime() > DAY) {
    reasons.push({ code: "modified_later", days: Math.floor((modified.getTime() - created.getTime()) / DAY) });
  }

  const active = [...new Set([...(info.activeContent ?? []), ...structure.activeKeywords])];
  if (active.length) reasons.push({ code: "active_content", what: active });
  if (structure.appendedBytes > 0) reasons.push({ code: "appended", bytes: structure.appendedBytes });

  const score = Math.min(100, reasons.reduce((n, r) => n + WEIGHT[r.code], 0));
  return {
    suspicious: reasons.some((r) => SUSPICIOUS.has(r.code)),
    score,
    reasons,
    producer: info.producer?.trim() || null,
    creator: info.creator?.trim() || null,
    revisions: structure.revisions,
    linearized: structure.linearized,
    signed: structure.signatures.length > 0,
    encrypted: structure.encrypted,
  };
}
