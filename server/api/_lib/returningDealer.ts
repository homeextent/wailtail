import type { Firestore, Transaction } from 'firebase-admin/firestore';

export const dealerIdValid = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
export const caseIdValid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

/** Read all protected authority in the same transaction as a returning submission. */
export async function returningDealer(tx: Transaction, firestore: Firestore, uid: string) {
  const user = (await tx.get(firestore.collection('users').doc(uid))).data();
  const bidder = (await tx.get(firestore.collection('bidders').doc(uid))).data();
  if (!user?.dealerId && !bidder?.dealerId) return null;
  if (!dealerIdValid(user?.dealerId) || bidder?.dealerId !== user.dealerId) return { status: 'unavailable' as const };
  const dealerId = user.dealerId;
  const profile = (await tx.get(firestore.collection('dealer_profiles').doc(dealerId))).data();
  if (!profile || profile.primaryRepresentativeUid !== uid || !caseIdValid(profile.verificationCaseId)) return { status: 'unavailable' as const };
  const review = (await tx.get(firestore.collection('dealerVerificationCases').doc(profile.verificationCaseId))).data();
  if (review?.dealerId !== dealerId || !Number.isSafeInteger(review.revision) || review.revision <= 0) return { status: 'unavailable' as const };
  const status = user.isBanned === true || bidder.isBanned === true ? 'unavailable' : profile.verificationStatus === 'suspended' ? 'suspended' :
    profile.verificationStatus !== 'verified' ? 'not_current' : !Number.isSafeInteger(profile.verificationExpiresAt) || profile.verificationExpiresAt <= Date.now() ? 'expired' : 'current';
  return { status, dealerId, profile, review, user };
}
