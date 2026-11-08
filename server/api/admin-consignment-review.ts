import { isDesignatedAdminEmail, normalizeEmail } from '../../src/config/adminConfig.js';
import type { FirebaseAdminServices } from './_lib/firebaseAdmin.js';
import { withSellerDraftRequest } from './seller-draft-narrative.js';

export function parseConsignmentReview(body: any) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['applicationId', 'source', 'action', 'expectedRevision', 'commandId', 'note', 'assigneeEmail', 'beforeRevision'].includes(key)) ||
      typeof body.applicationId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(body.applicationId) ||
      !['consignment_applications', 'consignments'].includes(body.source) ||
      !['read', 'add_note', 'assign'].includes(body.action)) return null;
  if (body.action === 'read') {
    if (['expectedRevision', 'commandId', 'note', 'assigneeEmail'].some(key => key in body) ||
        (body.beforeRevision !== undefined && (!Number.isSafeInteger(body.beforeRevision) || body.beforeRevision < 1))) return null;
  } else {
    if ('beforeRevision' in body || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 ||
        body.expectedRevision >= Number.MAX_SAFE_INTEGER || typeof body.commandId !== 'string' ||
        !/^[0-9a-f-]{36}$/.test(body.commandId)) return null;
    if (body.action === 'add_note' && ('assigneeEmail' in body || typeof body.note !== 'string' ||
        !body.note.trim() || body.note.length > 4000)) return null;
    if (body.action === 'assign' && ('note' in body || typeof body.assigneeEmail !== 'string' ||
        (body.assigneeEmail !== '' && !isDesignatedAdminEmail(body.assigneeEmail)))) return null;
  }
  return body as { applicationId: string; source: 'consignment_applications' | 'consignments';
    action: 'read' | 'add_note' | 'assign'; expectedRevision?: number; commandId?: string;
    note?: string; assigneeEmail?: string; beforeRevision?: number };
}

export function handleConsignmentReview(req: any, res: any, services?: Pick<FirebaseAdminServices, 'auth' | 'firestore'>) {
  return withSellerDraftRequest(req, res, services, async ({ firestore }, uid, email) => {
    if (!isDesignatedAdminEmail(email)) return res.status(403).json({ error: 'administrator-required' });
    const input = parseConsignmentReview(req.body);
    if (!input) return res.status(422).json({ error: 'invalid-consignment-review' });
    const applicationRef = firestore.collection(input.source).doc(input.applicationId);
    // Never put private metadata in applicant-readable application documents.
    const reviewRef = firestore.collection('consignmentReviews').doc(`${input.source}:${input.applicationId}`);
    const result = await firestore.runTransaction(async transaction => {
      const application = (await transaction.get(applicationRef)).data();
      if (!application) return { status: 404 };
      const review = (await transaction.get(reviewRef)).data() ?? { revision: 0, assigneeEmail: '' };
      if (input.action === 'read') {
        const dealerId = application.dealerId;
        const profile = typeof dealerId === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(dealerId)
          ? (await transaction.get(firestore.collection('dealer_profiles').doc(dealerId))).data() : undefined;
        const verifiedInformation = profile ? Object.fromEntries([
          'legalBusinessName', 'dealerLicenseNumber', 'licensingJurisdiction', 'verificationStatus',
          'verifiedAt', 'verifierUid', 'verificationMethod', 'verificationExpiresAt'
        ].filter(key => profile[key] !== undefined).map(key => [key, profile[key]])) : null;
        return { status: 200, application, review, verifiedInformation };
      }
      const eventRef = reviewRef.collection('events').doc(input.commandId!);
      const previous = (await transaction.get(eventRef)).data();
      const value = input.action === 'add_note' ? input.note!.trim() : normalizeEmail(input.assigneeEmail);
      if (previous) {
        return { status: previous.administratorUid === uid && previous.action === input.action && previous.value === value ? 200 : 409 };
      }
      if (review.revision !== input.expectedRevision) return { status: 409 };
      const revision = review.revision + 1;
      const createdAt = Date.now();
      transaction.create(eventRef, { action: input.action, value, revision, createdAt,
        administratorUid: uid, administratorEmail: normalizeEmail(email) });
      transaction.set(reviewRef, { revision, updatedAt: createdAt,
        ...(input.action === 'assign' ? { assigneeEmail: value } : {}) }, { merge: true });
      return { status: 200 };
    });
    if (result.status !== 200) return res.status(result.status).json({ error: result.status === 404 ? 'application-not-found' : 'review-conflict' });
    if (input.action !== 'read') return res.status(200).json({ saved: true });
    let historyQuery = reviewRef.collection('events').orderBy('revision', 'desc');
    // Cap at the transaction's revision so a concurrent save cannot create a mixed snapshot.
    historyQuery = historyQuery.where('revision', '<=', result.review!.revision);
    if (input.beforeRevision !== undefined) historyQuery = historyQuery.startAfter(input.beforeRevision);
    const history = await historyQuery.limit(51).get();
    const events = history.docs.slice(0, 50).map(event => ({ id: event.id, ...event.data() }));
    return res.status(200).json({ application: result.application, verifiedInformation: result.verifiedInformation, review: result.review, events, hasMore: history.size > 50 });
  });
}

export default handleConsignmentReview;
