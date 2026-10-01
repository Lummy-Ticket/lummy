// How long Lummy keeps files that carry personal data. A ticket PDF has the original buyer's name
// and contact on it; a claim photo has faces and places. Each is kept while it can still matter
// and deleted after: the records stay (the file's sha256, what the checks concluded, the verdict),
// the file goes, and so does where a photo was taken. The daily job deletes (lib/retention-purge.ts);
// the routes and pages read these same dates, so nothing is offered that is gone.

const DAY = 86_400_000;

/** A ticket PDF: until this long after the show ended, and never while an order on it holds money. */
export const TICKET_RETENTION_DAYS = 30;
/** A claim photo: until this long after the claim was decided. */
export const EVIDENCE_RETENTION_DAYS = 30;
/** A photo uploaded but never attached to a claim or an answer. */
export const ORPHAN_UPLOAD_DAYS = 7;

/** When a ticket file is deleted, once no order on it holds money. */
export const ticketFileGoneAt = (showEndsAt: string | number) => new Date(new Date(showEndsAt).getTime() + TICKET_RETENTION_DAYS * DAY);

/** When a claim's photos are deleted. */
export const evidenceGoneAt = (decidedAtISO: string) => new Date(new Date(decidedAtISO).getTime() + EVIDENCE_RETENTION_DAYS * DAY);

export const isGone = (at: Date, now: number = Date.now()) => at.getTime() <= now;
