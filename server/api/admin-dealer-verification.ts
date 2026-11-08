import { createHash } from 'node:crypto';
import { isDesignatedAdminEmail, normalizeEmail } from '../../src/config/adminConfig.js';
import { CANADIAN_LICENSING_JURISDICTIONS } from '../../src/config/consignmentIntake.js';
import type { FirebaseAdminServices } from './_lib/firebaseAdmin.js';
import { withSellerDraftRequest } from './seller-draft-narrative.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const actions = ['reviewed', 'verified', 'rejected', 'suspended', 'updated', 'renewed'];
const profileFields = ['legalBusinessName', 'dbaName', 'dealerLicenseNumber', 'licensingJurisdiction',
  'primaryRepresentativeUid', 'streetAddress', 'postalCode', 'city', 'province', 'phone', 'website',
  'displayPhonePublicly', 'displayWebsitePublicly', 'verificationExpiresAt'];
export function parseDealerVerification(body: any) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['applicationId', 'source', 'action', 'expectedRevision', 'commandId',
        'reason', 'verificationMethod', 'sourceReferenceDescription', 'checkedAt', 'profile', 'beforeRevision'].includes(key)) ||
      typeof body.applicationId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(body.applicationId) ||
      !['consignment_applications', 'consignments'].includes(body.source)) return null;
  if (body.action === 'read') return Object.keys(body).every(key => ['applicationId', 'source', 'action', 'beforeRevision'].includes(key)) &&
    (body.beforeRevision === undefined || (Number.isSafeInteger(body.beforeRevision) && body.beforeRevision > 0)) ? body : null;
  if (!actions.includes(body.action) || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 ||
      body.expectedRevision >= Number.MAX_SAFE_INTEGER || typeof body.commandId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(body.commandId) || 'beforeRevision' in body ||
      typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 4000) return null;
  const needsProfile = ['verified', 'updated', 'renewed'].includes(body.action);
  if (needsProfile) {
    const p = body.profile;
    if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).some(key => !profileFields.includes(key)) ||
        profileFields.some(key => !(key in p)) ||
        profileFields.filter(key => !['displayPhonePublicly', 'displayWebsitePublicly', 'verificationExpiresAt'].includes(key))
          .some(key => typeof p[key] !== 'string' || p[key].length > 240) ||
        ['legalBusinessName', 'dealerLicenseNumber', 'primaryRepresentativeUid', 'streetAddress', 'postalCode', 'city', 'phone']
          .some(key => !p[key].trim()) || !/^[a-zA-Z0-9_-]{1,128}$/.test(p.primaryRepresentativeUid) ||
        !CANADIAN_LICENSING_JURISDICTIONS.some(([code]) => code === p.licensingJurisdiction) ||
        !CANADIAN_LICENSING_JURISDICTIONS.some(([code]) => code === p.province) ||
        typeof p.displayPhonePublicly !== 'boolean' || typeof p.displayWebsitePublicly !== 'boolean' ||
        (p.website !== '' && !/^https:\/\/[^\s]+$/.test(p.website)) ||
        (p.displayWebsitePublicly && !p.website) || !Number.isSafeInteger(p.verificationExpiresAt)) return null;
    if (typeof body.verificationMethod !== 'string' || !body.verificationMethod.trim() || body.verificationMethod.length > 1000 ||
        typeof body.sourceReferenceDescription !== 'string' || !body.sourceReferenceDescription.trim() || body.sourceReferenceDescription.length > 2000 ||
        !Number.isSafeInteger(body.checkedAt) || body.checkedAt <= 0) return null;
  } else if (['profile', 'verificationMethod', 'sourceReferenceDescription', 'checkedAt'].some(key => key in body)) return null;
  return body;
}

export function handleDealerVerification(req: any, res: any, services?: Pick<FirebaseAdminServices, 'auth' | 'firestore'>) {
  return withSellerDraftRequest(req, res, services, async ({ auth, firestore }, uid, email) => {
    if (!isDesignatedAdminEmail(email)) return res.status(403).json({ error: 'administrator-required' });
    const input = parseDealerVerification(req.body);
    if (!input) return res.status(422).json({ error: 'invalid-dealer-verification' });
    const caseId = hash(`${input.source}:${input.applicationId}`);
    const caseRef = firestore.collection('dealerVerificationCases').doc(caseId);
    const auditCollection = firestore.collection('dealer_verification_audits');
    const candidate = input.profile;
    // Resolve an exact existing UID from authoritative Auth, never by applicant email.
    let representativeEmail = "";
    if (candidate) {
      try {
        const account = await auth.getUser(candidate.primaryRepresentativeUid);
        representativeEmail = account.email || "";
        if (!account.emailVerified || account.disabled || !account.email || isDesignatedAdminEmail(account.email)) {
          return res.status(422).json({ error: 'eligible-verified-representative-required' });
        }
      } catch (error: any) {
        if (error?.code === 'auth/user-not-found') return res.status(422).json({ error: 'eligible-verified-representative-required' });
        throw error;
      }
    }
    const result = await firestore.runTransaction(async transaction => {
      const application = (await transaction.get(firestore.collection(input.source).doc(input.applicationId))).data();
      if (!application || application.applicantType !== 'dealer') return { status: 404, error: 'dealer-application-not-found' };
      const review = (await transaction.get(caseRef)).data() ?? { revision: 0, verificationStatus: 'pending' };
      const dealerId = review.dealerId || application.dealerId || `dealer_${caseId}`;
      if (typeof dealerId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(dealerId)) return { status: 409, error: 'invalid-existing-dealer-link' };
      const profileRef = firestore.collection('dealer_profiles').doc(dealerId);
      const previous = (await transaction.get(profileRef)).data();
      if (input.action === 'read') return { status: 200, application, review, profile: previous ?? null };
      const auditRef = auditCollection.doc(hash(`${caseId}:${input.commandId}`));
      const existing = (await transaction.get(auditRef)).data();
      const fingerprint = hash(JSON.stringify(input));
      if (existing) return { status: existing.administratorUid === uid && existing.fingerprint === fingerprint ? 200 : 409, error: 'command-conflict' };
      if (review.revision !== input.expectedRevision) return { status: 409, error: 'verification-conflict-reload' };
      if (previous && previous.verificationCaseId !== caseId) return { status: 409, error: 'dealer-managed-by-another-case' };
      if (['suspended', 'updated', 'renewed'].includes(input.action) && !previous) return { status: 409, error: 'canonical-profile-required' };
      if (input.action === 'renewed' && previous?.verificationStatus !== 'verified') return { status: 409, error: 'reverify-required' };
      const now = Date.now();
      let next = previous ?? null;
      if (candidate) {
        if (candidate.verificationExpiresAt <= now || input.checkedAt > now) return { status: 422, error: 'future-expiry-and-past-check-required' };
        if (input.action === 'renewed' && candidate.verificationExpiresAt <= previous!.verificationExpiresAt) return { status: 422, error: 'renewal-must-extend-expiry' };
        if (input.action === 'updated' && previous?.verificationStatus !== 'verified') return { status: 409, error: 'reverify-required' };
        // Primary representative and licence identity are immutable in this milestone.
        if (previous && ['primaryRepresentativeUid', 'dealerLicenseNumber', 'licensingJurisdiction'].some(key => previous[key] !== candidate[key])) {
          return { status: 409, error: 'dealer-identity-change-outside-scope' };
        }
        const licenceKey = hash(`${candidate.licensingJurisdiction}:${candidate.dealerLicenseNumber.toUpperCase().replace(/[^A-Z0-9]/g, '')}`);
        if (!candidate.dealerLicenseNumber.replace(/[^a-zA-Z0-9]/g, '')) return { status: 422, error: 'invalid-licence-number' };
        const licenceRef = firestore.collection('dealerIdentityClaims').doc(`licence_${licenceKey}`);
        const repRef = firestore.collection('dealerIdentityClaims').doc(`uid_${hash(candidate.primaryRepresentativeUid)}`);
        const userRef = firestore.collection('users').doc(candidate.primaryRepresentativeUid);
        const bidderRef = firestore.collection('bidders').doc(candidate.primaryRepresentativeUid);
        // Include pre-M2.3 profiles that have no identity reservation yet.
        const jurisdictionProfiles = await transaction.get(firestore.collection('dealer_profiles')
          .where('licensingJurisdiction', '==', candidate.licensingJurisdiction).limit(201));
        const representativeProfiles = await transaction.get(firestore.collection('dealer_profiles')
          .where('primaryRepresentativeUid', '==', candidate.primaryRepresentativeUid).limit(2));
        if (jurisdictionProfiles.size > 200 || [...jurisdictionProfiles.docs, ...representativeProfiles.docs].some(doc =>
          doc.id !== dealerId && (doc.data().primaryRepresentativeUid === candidate.primaryRepresentativeUid ||
            (doc.data().licensingJurisdiction === candidate.licensingJurisdiction &&
              typeof doc.data().dealerLicenseNumber === 'string' && hash(`${candidate.licensingJurisdiction}:${doc.data().dealerLicenseNumber.toUpperCase().replace(/[^A-Z0-9]/g, '')}`) === licenceKey)))) {
          return { status: 409, error: 'existing-dealer-identity-requires-reconciliation' };
        }
        const snapshots = await Promise.all([licenceRef, repRef, userRef, bidderRef].map(ref => transaction.get(ref)));
        if (snapshots.some(snap => snap.data()?.dealerId && snap.data()!.dealerId !== dealerId)) return { status: 409, error: 'dealer-or-representative-already-linked' };
        next = { ...Object.fromEntries(Object.entries(candidate).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])), primaryRepresentativeEmail: representativeEmail, id: dealerId, verificationCaseId: caseId, verificationStatus: 'verified',
          verifiedAt: now, verifierUid: uid, verificationMethod: input.verificationMethod.trim(),
          sourceReferenceDescription: input.sourceReferenceDescription.trim(), checkedAt: input.checkedAt,
          contactVisibilityConsent: { phone: candidate.displayPhonePublicly, website: candidate.displayWebsitePublicly, recordedAt: now, recordedBy: uid },
          createdAt: previous?.createdAt ?? now, updatedAt: now };
        transaction.set(licenceRef, { dealerId }); transaction.set(repRef, { dealerId });
        transaction.set(userRef, { dealerId }, { merge: true }); transaction.set(bidderRef, { dealerId }, { merge: true });
      } else if (previous && ['rejected', 'suspended'].includes(input.action)) {
        next = { ...previous, verificationStatus: input.action, updatedAt: now };
      }
      if (next && input.action !== 'reviewed') transaction.set(profileRef, next);
      const status = next?.verificationStatus ?? (input.action === 'rejected' ? 'rejected' : review.verificationStatus);
      const after = { revision: review.revision + 1, verificationStatus: status, updatedAt: now, ...(next ? { dealerId } : {}) };
      transaction.set(caseRef, after);
      transaction.create(auditRef, { caseId, applicationId: input.applicationId, source: input.source,
        dealerId: next ? dealerId : null, action: input.action, reason: input.reason.trim(),
        administratorUid: uid, administratorEmail: normalizeEmail(email), timestamp: now,
        revision: after.revision, fingerprint, before: { review, profile: previous ?? null }, after: { review: after, profile: next } });
      return { status: 200 };
    });
    if (result.status !== 200) return res.status(result.status).json({ error: result.error });
    if (input.action !== 'read') return res.status(200).json({ saved: true });
    let query = auditCollection.where('caseId', '==', caseId).where('revision', '<=', result.review!.revision).orderBy('revision', 'desc');
    if (input.beforeRevision !== undefined) query = query.startAfter(input.beforeRevision);
    const history = await query.limit(21).get();
    return res.status(200).json({ application: result.application, review: result.review, profile: result.profile,
      events: history.docs.slice(0, 20).map(doc => ({ id: doc.id, ...doc.data() })), hasMore: history.size > 20 });
  });
}
export default handleDealerVerification;
