// Reads the barcodes on a rendered ticket page and turns each one into the key Lummy stores
// (docs/09 §5.2). The raw payload is the ticket itself, whoever holds it can walk in, so it is
// never stored or logged: only a keyed hash leaves this file, plus the last few characters for
// the seller to recognise their ticket by.
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { prepareZXingModule, readBarcodes, type ReaderOptions } from "zxing-wasm/reader";

if (typeof window !== "undefined") throw new Error("lib/tickets/barcode is server-only");

/** Symbologies ticketing systems print. Linear formats that misread ordinary text are left out. */
const FORMATS: ReaderOptions["formats"] = [
  "QRCode", "MicroQRCode", "RMQRCode", "Aztec", "PDF417", "DataMatrix", "Code128", "Code39", "Code93", "EAN13",
];

const OPTIONS: ReaderOptions = { formats: FORMATS, tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, maxNumberOfSymbols: 32 };

export type DecodedBarcode = { format: string; bytes: Uint8Array; text: string };

/**
 * Resolves a file inside an installed package from the app's own directory. Not from
 * import.meta.url: in a Next server bundle that is the path the build ran in, not where the
 * function runs. next.config.ts traces the files this needs into the deployment.
 */
export const packageFile = (spec: string) => createRequire(path.join(process.cwd(), "package.json")).resolve(spec);

/** The decoder's wasm comes from node_modules, never from the CDN the library falls back to. */
let ready: Promise<unknown> | null = null;
function zxing() {
  if (!ready) {
    ready = readFile(packageFile("zxing-wasm/reader/zxing_reader.wasm")).then((buf) =>
      prepareZXingModule({
        overrides: { wasmBinary: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer },
        fireImmediately: true,
      })
    );
    // A failed load is retried on the next call instead of being cached.
    ready.catch(() => (ready = null));
  }
  return ready;
}

/** Every barcode readable in one RGBA image. */
export async function decodeImage(image: { data: Uint8ClampedArray; width: number; height: number }): Promise<DecodedBarcode[]> {
  await zxing();
  const results = await readBarcodes(image as ImageData, OPTIONS);
  return results.filter((r) => r.isValid && r.bytes.length > 0).map((r) => ({ format: r.format, bytes: r.bytes, text: r.text }));
}

/**
 * The stored key: HMAC-SHA256 over the payload's raw bytes, under a server-only pepper, so the
 * key cannot be turned back into a ticket by guessing payloads. Raw bytes, not decoded text: the
 * gate compares payloads, and the same ticket printed as a QR code or as a Code 128 barcode
 * carries the same bytes. The version prefix lets the scheme change without colliding with old keys.
 */
export function barcodeKey(bytes: Uint8Array, pepper: string) {
  return createHmac("sha256", pepper).update("lummy/barcode/v1\0").update(bytes).digest("hex");
}

/** Enough of the payload for the seller to recognise their ticket, not enough to rebuild it. */
export function payloadTail(text: string) {
  const clean = text.replace(/\s+/g, "");
  return clean.length <= 8 ? "" : clean.slice(-4);
}
