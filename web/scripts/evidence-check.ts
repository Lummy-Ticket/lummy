/**
 * Checks the claim photo reader (src/lib/evidence/read.ts) on images made here: a phone photo with
 * full EXIF (time, place, camera, an editing app) showing an order's QR code, a PNG with no
 * metadata showing another code, a photo with no code, and files that are not images.
 *
 *   npm run evidence:check
 */
import { barcodeKey } from "../src/lib/tickets/barcode";
import { EvidenceError, distanceMetres, exifTime, readEvidence, sniffImage } from "../src/lib/evidence/read";
import { GENUINE, initWriter, latin1, photo, withExif } from "./ticket-fixtures";

const PEPPER = "evidence-check, not a real pepper";
const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => results.push({ name, ok, note: ok ? undefined : note });

async function main() {
  await initWriter();

  // --- Pure parts
  check("type: JPEG, PNG and WebP by their bytes", sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])) === "image/jpeg" && sniffImage(latin1("\x89PNG\r\n")) === "image/png" && sniffImage(latin1("RIFF\0\0\0\0WEBPVP8 ")) === "image/webp");
  check("type: a PDF is not a photo", sniffImage(latin1("%PDF-1.7")) === null);
  check("time: with the camera's zone", exifTime("2026:12:20 19:30:00", "+08:00") === "2026-12-20T11:30:00.000Z");
  check("time: without a zone, read as WIB", exifTime("2026:12:20 19:30:00", undefined) === "2026-12-20T12:30:00.000Z");
  check("time: rubbish gives nothing", exifTime("0000:00:00 00:00:00", undefined) === null && exifTime(42, undefined) === null);
  const d = distanceMetres({ lat: -6.2186, lng: 106.8021 }, { lat: -6.2286, lng: 106.8021 });
  check("distance: 0.01 degrees of latitude is about 1.1 km", d > 1100 && d < 1125, String(d));

  // --- Photos
  const order = barcodeKey(latin1(GENUINE), PEPPER);
  const full = await readEvidence(withExif(await photo(GENUINE, "jpeg")), PEPPER);
  check("phone photo: taken at the time in its EXIF", full.capturedAtISO === "2026-12-20T12:30:00.000Z", String(full.capturedAtISO));
  check(
    "phone photo: located where its GPS says",
    !!full.gps && Math.abs(full.gps.lat + 6.218611) < 0.0001 && Math.abs(full.gps.lng - 106.802222) < 0.0001,
    JSON.stringify(full.gps)
  );
  check("phone photo: camera named, editing app caught", full.device === "samsung SM-S918B" && full.editedWith === "Snapseed", `${full.device} / ${full.editedWith}`);
  check("phone photo: the order's code is read and keyed", full.keys.length === 1 && full.keys[0] === order, JSON.stringify(full.keys));
  check("phone photo: sha256 and size", /^[0-9a-f]{64}$/.test(full.sha256) && full.size > 0 && full.type === "image/jpeg");

  const bare = await readEvidence(await photo("LMY|someone-else|C-99|0000", "png"), PEPPER);
  check("bare PNG: no time, no place, no camera", bare.capturedAtISO === null && bare.gps === null && bare.device === null && bare.editedWith === null);
  check("bare PNG: a code is read, and it is not the order's", bare.keys.length === 1 && bare.keys[0] !== order);

  const blank = await readEvidence(await photo(null, "jpeg"), PEPPER);
  check("no code in the photo: nothing read", blank.keys.length === 0);

  for (const [name, bytes] of [["a PDF", latin1("%PDF-1.7\n%%EOF")], ["text", latin1("not an image")]] as const) {
    try {
      await readEvidence(bytes, PEPPER);
      check(`${name} is refused`, false, "no error");
    } catch (e) {
      check(`${name} is refused`, e instanceof EvidenceError, String(e));
    }
  }

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? `  (${r.note.slice(0, 160)})` : ""}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks pass`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
