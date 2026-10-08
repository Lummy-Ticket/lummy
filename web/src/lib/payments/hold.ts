// How long Pay holds the seats, shared by the checkout routes, the catalogue and the daily cron
// (docs/09 §6). The QRIS at Xendit expires with the hold; the seats come back a few minutes
// later, once nobody can pay that QRIS any more.
export const HOLD_MINUTES = 15;
export const GRACE_SECONDS = 300;
