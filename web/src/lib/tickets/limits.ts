// Limits the sell page checks before an upload and the server checks again, in one place. No
// server code here, so the page can import it.

/**
 * A ticket PDF over this is refused (the sell page says so before anything is sent). Vercel refuses
 * request bodies over 4.5 MB, and e-tickets are far smaller.
 */
export const MAX_TICKET_BYTES = 4 * 1024 * 1024;
