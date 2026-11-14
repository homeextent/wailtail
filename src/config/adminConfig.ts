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

/**
 * Milestone M2.0B Correction A:
 * Evaluates administrative authority based strictly on:
 * 1. Authenticated Firebase user present
 * 2. Email present
 * 3. Email matches explicit designated administrator allowlist
 * 4. Firebase Authentication reports emailVerified === true
 *
 * Mutable Firestore profile fields (e.g. role, isEmailVerified) must NEVER establish admin authority.
 */
export function evaluateAdminAuthority(
  user: { email: string | null; emailVerified: boolean } | null | undefined,
  _profile?: { isEmailVerified?: boolean; role?: string } | null
): boolean {
  return Boolean(
    user &&
    user.email &&
    isDesignatedAdminEmail(user.email) &&
    user.emailVerified === true
  );
}
