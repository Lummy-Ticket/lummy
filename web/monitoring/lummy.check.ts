// What Checkly watches on lummy.id (checkly.config.ts, docs/config/06-monitoring.md), sized for the
// free Hobby plan: 10 uptime monitors, which cost no runs, and 1,000 browser runs a month, of which
// a Playwright suite takes one per started half minute. Both read only public pages and sample
// personas, so nothing is written to the database.
import { AlertEscalationBuilder, EmailAlertChannel, Frequency, PlaywrightCheck, RetryStrategyBuilder, UrlAssertionBuilder, UrlMonitor } from "checkly/constructs";

// The address comes from the shell that deploys, so none is kept in the repo.
const address = process.env.CHECKLY_ALERT_EMAIL;
if (!address) throw new Error("Set CHECKLY_ALERT_EMAIL to the address that gets lummy.id's alerts (docs/config/06-monitoring.md).");

const email = new EmailAlertChannel("lummy-alert-email", {
  address,
  sendFailure: true,
  sendRecovery: true,
  sendDegraded: false,
  sslExpiry: true,
  sslExpiryThreshold: 14,
});

// Is the site up: the home page every five minutes, from Singapore and Sydney in turn. A failure is
// retried once from the other place, and an alert needs two failed runs in a row (about ten minutes).
new UrlMonitor("lummy-home-up", {
  name: "lummy.id answers",
  frequency: Frequency.EVERY_5M,
  degradedResponseTime: 3_000,
  maxResponseTime: 10_000,
  retryStrategy: RetryStrategyBuilder.singleRetry({ sameRegion: false }),
  alertEscalationPolicy: AlertEscalationBuilder.runBasedEscalation(2),
  alertChannels: [email],
  request: { url: "https://lummy.id/", followRedirects: true, assertions: [UrlAssertionBuilder.statusCode().equals(200)] },
});

// Does the site work: the @smoke tests a laptop runs (the demo script and the site checks), as
// monitoring/playwright.config.ts sets them up. Playwright retries a failed test once inside the run;
// Checkly's own retries do not apply to suites.
new PlaywrightCheck("lummy-smoke", {
  name: "lummy.id smoke tests (laptop)",
  playwrightConfigPath: "./playwright.config.ts",
  frequency: Frequency.EVERY_6H,
  alertEscalationPolicy: AlertEscalationBuilder.runBasedEscalation(1),
  alertChannels: [email],
});
