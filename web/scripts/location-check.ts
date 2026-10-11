/**
 * The venue point staff paste in the console (docs/config/05), read the way Google Maps hands it
 * over: the numbers it copies, or a link. A place link's own pin wins over the map's centre, a
 * swapped pair is caught as outside Indonesia, and text with no point is refused. Offline.
 *
 *   npm run location:check
 */
import { inIndonesia, parseLocation } from "../src/lib/events/location";

const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => results.push({ name, ok, note: ok ? undefined : note });
const same = (a: { lat: number; lng: number } | null, lat: number, lng: number) => !!a && a.lat === lat && a.lng === lng;

const copied = parseLocation("-6.21858, 106.80251");
check("the numbers Google Maps copies", same(copied, -6.21858, 106.80251), JSON.stringify(copied));
check("without a space", same(parseLocation("-6.21858,106.80251"), -6.21858, 106.80251));
check("with only a space", same(parseLocation(" -6.21858 106.80251 "), -6.21858, 106.80251));

const place = parseLocation(
  "https://www.google.com/maps/place/Gelora+Bung+Karno+Main+Stadium/@-6.2183,106.8001,17z/data=!3m1!4b1!4m6!3m5!1s0x2e69f1505a7b4a6f:0x1!8m2!3d-6.2185758!4d106.8025083!16s"
);
check("a place link: its pin, not the map's centre", same(place, -6.218576, 106.802508), JSON.stringify(place));
check("a map link with only a centre", same(parseLocation("https://www.google.com/maps/@-6.1467,106.84568,15z"), -6.1467, 106.84568));
check("a search link", same(parseLocation("https://www.google.com/maps/search/?api=1&query=-6.22405,106.82309"), -6.22405, 106.82309));
check("a ?q= link", same(parseLocation("https://maps.google.com/?q=-6.30026,106.6366"), -6.30026, 106.6366));

const swapped = parseLocation("106.80251, -6.21858");
check("a swapped pair is read, then caught as outside Indonesia", !!swapped && !inIndonesia(swapped), JSON.stringify(swapped));
check("every seed venue is inside Indonesia", [[-6.21858, 106.80251], [-6.559, 106.84811], [-6.30026, 106.6366]].every(([lat, lng]) => inIndonesia({ lat, lng })));
check("text with no point is refused", parseLocation("Stadion Utama GBK, Jakarta") === null);
check("a lone number is refused", parseLocation("106.80251") === null);

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? `  (${r.note})` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks pass`);
process.exit(failed ? 1 : 0);
