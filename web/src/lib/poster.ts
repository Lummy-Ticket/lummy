// Poster event offline (SVG data-URI). Gak ada host eksternal — anti-gagal pas demo
// venue Wi-Fi jelek, dan lebih kredibel dari foto stok random. Warna deterministik per key.
const PAIRS: [string, string][] = [
  ["#3A6CB4", "#8FD3F4"], // navy -> sky
  ["#5B7CFA", "#A6C1FF"], // blue -> periwinkle
  ["#7C5CFF", "#D9B8FF"], // indigo -> lilac
  ["#E85D9B", "#FFB6C1"], // pink
  ["#F08A3C", "#FFD166"], // orange -> gold
  ["#2EAF9B", "#7BE0C9"], // teal -> mint
  ["#9B6DFF", "#C3A6FF"], // purple
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Data-URI SVG poster untuk sebuah event. `key` biasanya id/slug event biar konsisten. */
export function eventPoster(key: string): string {
  const [c1, c2] = PAIRS[hash(key) % PAIRS.length];
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='440'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/>` +
    `</linearGradient></defs>` +
    `<rect width='600' height='440' fill='url(#g)'/>` +
    `<circle cx='500' cy='86' r='150' fill='#fff' opacity='0.12'/>` +
    `<circle cx='110' cy='380' r='120' fill='#fff' opacity='0.10'/>` +
    `<circle cx='300' cy='230' r='64' fill='#fff' opacity='0.06'/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
