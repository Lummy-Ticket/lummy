import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

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
  // A staging build inlines staging's NEXT_PUBLIC_ values, so it gets a folder of its own
  // (scripts/start-local.sh) and never replaces the production build in .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
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

/**
 * Error tracking (docs/config/06-monitoring.md). Sentry joins only a build that has its DSN: without
 * NEXT_PUBLIC_SENTRY_DSN the config is returned as it is, so the browser gets no Sentry code, there
 * is no tunnel, and nothing is uploaded or sent. Source maps go to Sentry only from a build that also
 * has SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT (Vercel's), and are deleted from the build
 * once uploaded, so lummy.id never serves them.
 */
function withSentry(config: NextConfig): NextConfig {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return config;
  const upload = !!(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT);
  const tracing = Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE) > 0;
  return withSentryConfig(
    {
      ...config,
      // The browser half, loaded before the page hydrates (Next 16.3).
      instrumentationClientInject: [...(config.instrumentationClientInject ?? []), "./src/lib/sentry/instrumentation-client.ts"],
      env: { ...config.env, SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || "local" },
      // The SDK's debug logging never ships, and its tracing code only when tracing is on.
      compiler: {
        ...config.compiler,
        define: { ...config.compiler?.define, __SENTRY_DEBUG__: false, ...(tracing ? {} : { __SENTRY_TRACING__: false }) },
      },
    },
    {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Upload lines in Vercel's build log; nothing at all from a build that uploads nothing.
      silent: !upload,
      // Sentry's own build telemetry, off.
      telemetry: false,
      // Where the browser posts its reports, on lummy.id (app/sentry-tunnel/route.ts).
      tunnelRoute: "/api/client-errors",
      release: { name: process.env.VERCEL_GIT_COMMIT_SHA, create: upload, finalize: upload },
      sourcemaps: upload ? { deleteSourcemapsAfterUpload: true } : { disable: true },
      widenClientFileUpload: upload,
      // It rewrites server libraries for tracing; errors do not need it.
      buildTimeInstrumentation: false,
      // A Sentry outage must not stop a deploy: an upload that fails is a warning.
      errorHandler: (error) => console.warn("[sentry] source map upload failed:", error.message),
    },
  );
}

export default withSentry(nextConfig);
