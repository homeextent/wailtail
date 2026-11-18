import { createHash } from 'node:crypto';
import type { FirebaseAdminServices } from './_lib/firebaseAdmin.js';
import { withSellerDraftRequest } from './seller-draft-narrative.js';
import { returningDealer } from './_lib/returningDealer.js';
import { parseConsignmentIntake } from './submit-consignment.js';
import { isDesignatedAdminEmail } from '../../src/config/adminConfig.js';

const protectedFields = ['dealerId', 'sellerId', 'representativeUid', 'verificationCaseId', 'dealerVerificationCaseId', 'registeredUserId',
  'status', 'intakePath', 'submittedDealershipName', 'submittedDbaName', 'submittedDealerLicenseNumber', 'submittedLicensingJurisdiction', 'applicantType'];
export function handleDealerVehicleIntake(req: any, res: any, services?: Pick<FirebaseAdminServices, 'auth' | 'firestore'>) {
  return withSellerDraftRequest(req, res, services, async ({ firestore }, uid, email) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || !['context', 'submit'].includes(body.action) ||
      (body.action === 'context' && Object.keys(body).some(k => k !== 'action')) ||
      (body.action === 'submit' && Object.keys(body).some(k => protectedFields.includes(k)))) {
      return res.status(422).json({ error: 'Invalid returning-dealer request.' });
    }
    if (isDesignatedAdminEmail(email)) return res.status(body.action === 'context' ? 200 : 403).json(body.action === 'context' ? { dealer: null } : { error: 'Use the administrator listing workflow.' });
    const result = await firestore.runTransaction(async tx => {
      const linked = await returningDealer(tx, firestore, uid);
      if (body.action === 'context') {
        if (!linked) return { statusCode: 200, dealer: null };
        return { statusCode: 200, dealer: { status: linked.status,
          ...('profile' in linked ? { name: linked.profile.dbaName || linked.profile.legalBusinessName,
            legalBusinessName: linked.profile.legalBusinessName, city: linked.profile.city, province: linked.profile.province,
            expiresAt: linked.profile.verificationExpiresAt, representativeName: linked.user.displayName || '',
            representativeEmail: email?.trim().toLowerCase() || '', representativePhone: linked.user.phone || linked.profile.phone || '' } : {}) } };
      }
      if (!linked || linked.status !== 'current' || !('profile' in linked)) return { statusCode: 409, error: `Dealer verification ${linked?.status || 'unavailable'}. Contact Wailtail for administrator review; your vehicle information has been retained.` };
      const { action: _action, ...vehicle } = body;
      const input = parseConsignmentIntake({ ...vehicle, applicantType: 'dealer', sellerEmail: email?.trim().toLowerCase(),
        submittedDealershipName: linked.profile.legalBusinessName, submittedDbaName: linked.profile.dbaName || '',
        submittedDealerLicenseNumber: linked.profile.dealerLicenseNumber, submittedLicensingJurisdiction: linked.profile.licensingJurisdiction });
      if ('error' in input) return { statusCode: 422, error: input.error };
      const canonical = firestore.collection('consignment_applications').doc(input.submissionId);
      const legacy = firestore.collection('consignments').doc(input.submissionId);
      const command = firestore.collection('consignmentIntakeCommands').doc(input.submissionId);
      const audit = firestore.collection('dealerVehicleIntakeAudits').doc(input.submissionId);
      // Fingerprint the submitted contract and actor, not mutable profile presentation.
      const fingerprint = createHash('sha256').update(JSON.stringify({ uid, vehicle })).digest('hex');
      const previous = (await tx.get(command)).data();
      const before = (await tx.get(canonical)).data();
      const legacyExists = (await tx.get(legacy)).exists;
      const auditExists = (await tx.get(audit)).exists;
      if (previous) return previous.hash === fingerprint && previous.actorUid === uid && before?.dealerId === linked.dealerId && legacyExists && auditExists
        ? { statusCode: 200, applicationId: input.submissionId, created: false } : { statusCode: 409, error: 'Submission changed or reference already exists.' };
      if (before || legacyExists || auditExists) return { statusCode: 409, error: 'Submission reference already exists.' };
      const now = Date.now();
      if (linked.profile.verificationExpiresAt <= now) return { statusCode: 409, error: 'Dealer verification expired. Contact Wailtail for administrator review.' };
      const { submittedDealerLicenseNumber: _licence, submittedLicensingJurisdiction: _jurisdiction, ...application } = input.application;
      const record = { ...application, sellerEmail: application.sellerEmail, dealerId: linked.dealerId, dealerVerificationCaseId: linked.profile.verificationCaseId,
        registeredUserId: uid, isRegisteredUser: true, intakePath: 'returning_dealer', status: 'pending', submittedAt: now, declarationAcceptedAt: now };
      tx.create(canonical, record); tx.create(legacy, record);
      tx.create(command, { hash: fingerprint, actorUid: uid, createdAt: now });
      tx.create(audit, { actorUid: uid, dealerId: linked.dealerId, applicationId: input.submissionId,
        verificationCaseId: linked.profile.verificationCaseId, verificationRevision: linked.review.revision, createdAt: now, action: 'vehicle_submitted' });
      return { statusCode: 201, applicationId: input.submissionId, created: true };
    });
    const { statusCode, ...payload } = result;
    return res.status(statusCode).json(payload);
  });
}
export default handleDealerVehicleIntake;
