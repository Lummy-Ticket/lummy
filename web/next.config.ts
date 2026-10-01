import type { NextConfig } from "next";

/**
 * Files the ticket reader (src/lib/tickets) opens by path at run time, so tracing cannot find
 * them on its own: the decoder's wasm, the pdf.js worker and its fonts, maps and wasm, and the
 * native canvas built for Vercel's Linux.
 */
const TICKET_READER_FILES = [
  "./node_modules/zxing-wasm/dist/reader/zxing_reader.wasm",
  // The reader finds pdf.js's fonts through its package.json, which tracing leaves out because
  // the bundle imports a file deep inside the package rather than the package itself.
  "./node_modules/pdfjs-dist/package.json",
  "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  "./node_modules/pdfjs-dist/standard_fonts/**",
  "./node_modules/pdfjs-dist/cmaps/**",
  "./node_modules/pdfjs-dist/wasm/**",
  "./node_modules/pdfjs-dist/iccs/**",
  "./node_modules/@napi-rs/canvas-linux-x64-gnu/**",
];

/** Claim photos (src/lib/evidence) are read with the same canvas and decoder, without pdf.js. */
const PHOTO_READER_FILES = ["./node_modules/zxing-wasm/dist/reader/zxing_reader.wasm", "./node_modules/@napi-rs/canvas-linux-x64-gnu/**"];

const nextConfig: NextConfig = {
  devIndicators: false,
  // Dev only: the chain e2e opens `next dev` at 127.0.0.1, which Next 16.1+ treats as another
  // origin and refuses its scripts, so the page never hydrates.
  allowedDevOrigins: ["127.0.0.1"],
  // pdf.js loads the canvas and its worker relative to its own files, so the reader's packages
  // stay in node_modules rather than in the server bundle.
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas", "zxing-wasm"],
  outputFileTracingIncludes: {
    "/api/tickets/check": TICKET_READER_FILES,
    "/api/listings": TICKET_READER_FILES,
    "/api/orders": PHOTO_READER_FILES,
  },
  images: {
    // Poster event = SVG data-URI (offline). Izinkan SVG lewat next/image.
    dangerouslyAllowSVG: true,
    contentDispositionType: "inline",
    remotePatterns: [
      {hostname: "i.pravatar.cc"}
    ],
  },
  async redirects() {
    return [
      {
        source: '/event', 
        destination: '/events',
        permanent: true, 
      },
    ];
  },
};

export default nextConfig;
