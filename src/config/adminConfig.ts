/**
 * Wailtail Platform — Designated Administrator Configuration
 * Explicit root of trust for administrative privileges.
 * Mutable profile roles (users/{uid}.role) must NEVER independently establish administrative authority.
 */

export const DESIGNATED_ADMIN_EMAILS = [
  'jeremygoodmurphy@gmail.com',
  'jeremy@theinnovativegroup.ca'
] as const;

export const ADMIN_EMAILS = DESIGNATED_ADMIN_EMAILS;

/**
 * Normalizes email address by trimming whitespace and converting to lowercase.
 */
export function normalizeEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

/**
 * Checks if the provided email matches the explicit administrator allowlist.
 */
export function isDesignatedAdminEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return DESIGNATED_ADMIN_EMAILS.some((adminEmail) => adminEmail.toLowerCase() === normalized);
}
