// A venue's point on the map, as staff paste it (docs/config/05): the "lat, lng" Google Maps copies
// when the spot is right-clicked, or a Maps link that carries the point. Used by the location check
// on claim photos (lib/evidence/server.ts, radius 1.5 km).

export type LatLng = { lat: number; lng: number };

const NUM = "(-?\\d{1,3}(?:\\.\\d+)?)";
// Most precise first: a place's own pin (!3d…!4d…) beats the map's centre (@lat,lng,zoom).
const PATTERNS = [
  new RegExp(`!3d${NUM}!4d${NUM}`),
  new RegExp(`[?&](?:q|query|ll|destination)=${NUM}(?:,|%2C)\\s*${NUM}`, "i"),
  new RegExp(`@${NUM},${NUM}`),
  new RegExp(`^${NUM}\\s*[,;\\s]\\s*${NUM}$`),
];

/** The point in pasted text, or null when there is none. Six decimals, about 10 cm, is plenty. */
export function parseLocation(text: string): LatLng | null {
  const t = text.trim();
  for (const re of PATTERNS) {
    const m = re.exec(t);
    if (m) return { lat: Math.round(Number(m[1]) * 1e6) / 1e6, lng: Math.round(Number(m[2]) * 1e6) / 1e6 };
  }
  return null;
}

/** Roughly Indonesia's bounding box: a swapped pair or a typo lands outside it. */
export const inIndonesia = (p: LatLng) => p.lat >= -11.5 && p.lat <= 6.5 && p.lng >= 94.5 && p.lng <= 141.5;

export const mapsLink = (p: LatLng) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
