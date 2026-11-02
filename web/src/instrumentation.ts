// Next.js calls this once per server instance, and onRequestError for every error a request meets
// while rendering, in a route handler or in a server action. Both pass to Sentry only when the
// build has its DSN (docs/config/06-monitoring.md); without it neither loads any Sentry code.
import type { Instrumentation } from "next";

export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./lib/sentry/server");
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  const { captureRequestError } = await import("@sentry/nextjs");
  captureRequestError(...args);
};
