import type { Role } from "@/lib/mock/types";

/**
 * Demo accounts for presenters. The subdomain has no DNS records at all, so no email can ever
 * reach these addresses; the Dev Panel signs in to them without sending anything.
 */
export const DEMO_EMAIL_DOMAIN = "demo.lummy.id";

export const DEMO_ACCOUNTS: Record<Role, { email: string; name: string; staff: boolean }> = {
  BUYER: { email: `luthfi@${DEMO_EMAIL_DOMAIN}`, name: "Luthfi Hadi", staff: false },
  SELLER: { email: `zahra@${DEMO_EMAIL_DOMAIN}`, name: "Zahra Amelia", staff: false },
  ADMIN: { email: `admin@${DEMO_EMAIL_DOMAIN}`, name: "Admin Lummy", staff: true },
};

export const isDemoEmail = (email: string) => email.trim().toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
