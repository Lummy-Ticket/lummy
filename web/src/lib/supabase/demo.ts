import type { Role } from "@/lib/mock/types";

/**
 * Demo accounts for presenters. The subdomain has no DNS records at all, so no email can ever
 * reach these addresses; the Dev Panel signs in to them without sending anything. The same made-up
 * people as the sample personas (lib/mock/seed.ts, DEMO_USERS), never the team's own names (until
 * 29 Oct 2026 the buyer and seller were luthfi@ and zahra@).
 */
export const DEMO_EMAIL_DOMAIN = "demo.lummy.id";

export const DEMO_ACCOUNTS: Record<Role, { email: string; name: string; staff: boolean }> = {
  BUYER: { email: `raka@${DEMO_EMAIL_DOMAIN}`, name: "Raka Pratama", staff: false },
  SELLER: { email: `maya@${DEMO_EMAIL_DOMAIN}`, name: "Maya Kusuma", staff: false },
  ADMIN: { email: `admin@${DEMO_EMAIL_DOMAIN}`, name: "Admin Lummy", staff: true },
};

export const isDemoEmail = (email: string) => email.trim().toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);

/**
 * Whether a profile role makes an account staff here. On lummy.id (`production`) a demo account
 * never is, whatever its profile says: the demo key is shared, and a staff session minted with it
 * before 2 Nov 2026 would otherwise stay staff for as long as its refresh token lives (review,
 * 4 Nov 2026). The database's own rule (private.is_admin) still reads the role, so the demo admin's
 * profile is kept at member on lummy.id as well (lib/supabase/demo-accounts.ts). Checked offline by
 * `npm run access:check`.
 */
export const staffByRole = (role: string | null | undefined, email: string, production: boolean) =>
  role === "admin" && !(production && isDemoEmail(email));
