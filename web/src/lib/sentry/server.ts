// The server half of error tracking, started by instrumentation.ts only when the build has a Sentry
// DSN, and only in Node: no route runs on the edge runtime (one that did would need its own init).
import * as Sentry from "@sentry/nextjs";
import { sharedOptions } from "./options";

Sentry.init({
  ...sharedOptions(),
  // The SDK's HTTP integration as @sentry/nextjs sets it up, minus the per-minute request counts
  // (release health sessions) and request bodies, and no session for the server process either:
  // errors are all that leave.
  integrations: (defaults) =>
    defaults
      .filter((i) => i.name !== "ProcessSession")
      .map((i) => (i.name === "Http" ? Sentry.httpIntegration({ disableIncomingRequestSpans: true, sessions: false, maxRequestBodySize: "none" }) : i)),
  // No Sentry trace headers on the server's own calls to Supabase, Xendit, Anthropic or the mail
  // server: they have no use for them.
  tracePropagationTargets: [],
});
