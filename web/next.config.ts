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
    // The AI step reads the PDF's text with the same pdf.js before anything is sent.
    "/api/tickets/extract": TICKET_READER_FILES,
    "/api/listings": TICKET_READER_FILES,
    "/api/orders": PHOTO_READER_FILES,
  },
  images: {
    // Poster event = SVG data-URI (offline). Izinkan SVG lewat next/image.
    dangerouslyAllowSVG: true,
    contentDispositionType: "inline",
    // What Next asks for alongside SVG: an image served by the optimizer runs no script.
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {hostname: "i.pravatar.cc"}
    ],
  },
  poweredByHeader: false,
  // None of these were sent before 12 Oct 2026. The CSP only fences who may frame a page, the base
  // URL, where forms post and plugins; scripts and styles stay as Next serves them.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The gate's scanner needs the camera, on lummy.id itself; nothing needs the rest.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
        ],
      },
    ];
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
