// Error tracking with Sentry (docs/config/06-monitoring.md), shared by the browser and the server.
// None of it runs unless the build has NEXT_PUBLIC_SENTRY_DSN: next.config.ts adds the browser half
// and the tunnel only then, and instrumentation.ts starts the server half only then.
import type { BrowserOptions } from "@sentry/nextjs";
import { scrubEvent } from "./scrub";

/**
 * Tracing (how long pages and requests take) is off unless NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE
 * asks for it, and never for more than one visit in ten: errors are what the free plan is for.
 */
export function tracesSampleRate(raw = process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE): number {
  const rate = Number(raw);
  return Number.isFinite(rate) && rate > 0 ? Math.min(rate, 0.1) : 0;
}

/**
 * Since SDK 11 the SDK collects by default what used to need sendDefaultPii (which is gone): the
 * user and their IP address, cookies, headers, bodies, queries, local variables. Here it collects
 * none of them; the user agent is the one header kept, for the browser and device.
 */
const DATA_COLLECTION: NonNullable<BrowserOptions["dataCollection"]> = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: ["user-agent"] }, response: false },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
};

export function sharedOptions() {
  const rate = tracesSampleRate();
  return {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // Set by next.config.ts at build time: Vercel's production or preview, or local.
    environment: process.env.SENTRY_ENVIRONMENT || "local",
    dataCollection: DATA_COLLECTION,
    // Without a rate the SDK starts no trace at all. With one, traces are sent whole, as transactions,
    // so beforeSendTransaction sees (and cleans) every span in them.
    ...(rate > 0 ? { tracesSampleRate: rate } : {}),
    traceLifecycle: "static" as const,
    maxBreadcrumbs: 30,
    ignoreErrors: [/ResizeObserver loop/i],
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    // Errors only: no logs or metrics leave, whatever an integration records, and no reports on
    // what the SDK itself dropped.
    beforeSendLog: () => null,
    beforeSendMetric: () => null,
    sendClientReports: false,
  };
}
