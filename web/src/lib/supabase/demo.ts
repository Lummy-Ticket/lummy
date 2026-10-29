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
