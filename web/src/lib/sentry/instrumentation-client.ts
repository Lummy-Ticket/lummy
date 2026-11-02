// The browser half of error tracking. Not the app's instrumentation-client file: next.config.ts adds
// this module through instrumentationClientInject (Next 16.3) only when the build has a Sentry DSN,
// so a build without one ships no Sentry code to the browser at all. It keeps this file name because
// Sentry's build hands the tunnel's path to files named instrumentation-client.*.
import * as Sentry from "@sentry/nextjs";
import { sharedOptions } from "./options";

Sentry.init({
  ...sharedOptions(),
  // No session per page view: that would be a request to the tunnel on every visit, for counts the
  // site does not need.
  integrations: (defaults) => defaults.filter((i) => i.name !== "BrowserSession"),
  // Errors from this site's own scripts only, not from extensions or scripts a browser injects.
  allowUrls: [window.location.origin],
  denyUrls: [/^(?:chrome|moz|safari(?:-web)?)-extension:/i, /^webkit-masked-url:/i],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
