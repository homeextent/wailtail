import { createHash } from 'node:crypto';
import type { FirebaseAdminServices } from './_lib/firebaseAdmin.js';
import { withSellerDraftRequest } from './seller-draft-narrative.js';
import { isDesignatedAdminEmail, normalizeEmail } from '../../src/config/adminConfig.js';
import { DEALER_TAX_CHOICES, DEALER_TAX_DISCLAIMER_VERSION } from '../../src/config/dealerListing.js';
import { DEALER_DECLARATIONS, INTAKE_DECLARATION_VERSION } from '../../src/config/consignmentIntake.js';
import { dealerListingEligible } from './_lib/dealerEligibility.js';
import { dealerSnapshot } from './_lib/dealerListing.js';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const validId = (s: unknown): s is string => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(s);
interface DealerListingCommand {
  action: 'read' | 'convert' | 'update_tax'; applicationId?: string; auctionId?: string;
  commandId?: string; reason?: string; expectedRevision?: number; taxHandling?: string;
  applicationFingerprint?: string;
}
export function parseDealerListing(body: any): DealerListingCommand | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const application = body.action === 'read' || body.action === 'convert';
  const keys = application ? ['action', 'applicationId'] : ['action', 'auctionId'];
  if (body.action !== 'read') keys.push('commandId', 'reason', 'expectedRevision', 'taxHandling');
  if (body.action === 'convert') keys.push('applicationFingerprint');
  if (!['read', 'convert', 'update_tax'].includes(body.action) || Object.keys(body).some(key => !keys.includes(key)) ||
      !validId(application ? body.applicationId : body.auctionId)) return null;
  if (body.action === 'read') return { action: 'read', applicationId: body.applicationId };
  if (body.action === 'convert' && (typeof body.applicationFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(body.applicationFingerprint))) return null;
  if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 || body.expectedRevision >= Number.MAX_SAFE_INTEGER ||
      typeof body.commandId !== 'string' || !/^[0-9a-f-]{36}$/.test(body.commandId) ||
      typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 4000 ||
      !DEALER_TAX_CHOICES.some(([value]) => value === body.taxHandling)) return null;
  return { action: body.action, ...(application ? { applicationId: body.applicationId } : { auctionId: body.auctionId }),
    ...(body.action === 'convert' ? { applicationFingerprint: body.applicationFingerprint } : {}),
    commandId: body.commandId, reason: body.reason.trim(), expectedRevision: body.expectedRevision, taxHandling: body.taxHandling };
}

export function handleDealerListing(req: any, res: any, services?: Pick<FirebaseAdminServices, 'auth' | 'firestore'>) {
  return withSellerDraftRequest(req, res, services, async ({ auth, firestore }, uid, email) => {
    if (!isDesignatedAdminEmail(email)) return res.status(403).json({ error: 'administrator-required' });
    const input = parseDealerListing(req.body);
    if (!input) return res.status(422).json({ error: 'invalid-dealer-listing-command' });
    const applicationRef = input.applicationId ? firestore.collection('consignment_applications').doc(input.applicationId) : null;
    const caseId = input.applicationId ? hash(`consignment_applications:${input.applicationId}`) : '';
    const caseRef = firestore.collection('dealerVerificationCases').doc(caseId || 'unused');
    // Auth is authoritative but cannot share a transaction with Firestore. Revalidate the UID inside it.
    let checkedUid = '';
    if (input.action === 'convert') {
      const review = (await caseRef.get()).data();
      if (!validId(review?.dealerId)) return res.status(409).json({ error: 'verified-canonical-dealer-required' });
      const p = (await firestore.collection('dealer_profiles').doc(review.dealerId).get()).data();
      try {
        const account = await auth.getUser(p?.primaryRepresentativeUid || '');
        if (!account.emailVerified || account.disabled || !account.email || isDesignatedAdminEmail(account.email)) return res.status(409).json({ error: 'eligible-representative-required' });
        checkedUid = account.uid;
      } catch (e: any) {
        if (['auth/user-not-found', 'auth/invalid-uid'].includes(e?.code)) return res.status(409).json({ error: 'eligible-representative-required' });
        throw e;
      }
    }
    const result = await firestore.runTransaction(async tx => {
      const commandRef = firestore.collection('dealerListingCommands').doc(hash(`${input.action}:${input.applicationId || input.auctionId}:${input.commandId}`));
      const fingerprint = hash(JSON.stringify(input));
      if (input.action !== 'read') {
        const old = (await tx.get(commandRef)).data();
        if (old) return old.actorUid === uid && old.fingerprint === fingerprint ? { status: 200, auctionId: old.auctionId, dealerListingRevision: old.revision ?? 0, replayed: true } : { status: 409, error: 'command-conflict' };
      }
      const now = Date.now();
      if (input.action === 'update_tax') {
        const ref = firestore.collection('auctions').doc(input.auctionId!);
        const before = (await tx.get(ref)).data();
        if (!before || before.sellerType !== 'dealer' || before.status !== 'draft' || !before.sourceApplicationId ||
            before.dealerListingRevision !== input.expectedRevision) return { status: 409, error: 'dealer-draft-changed-reload' };
        const patch = { taxHandling: input.taxHandling, taxDisclaimerVersion: DEALER_TAX_DISCLAIMER_VERSION,
          dealerListingRevision: input.expectedRevision + 1, updatedAt: now };
        tx.update(ref, patch);
        tx.create(commandRef, { actorUid: uid, fingerprint, auctionId: ref.id, revision: input.expectedRevision + 1 });
        tx.create(firestore.collection('dealerListingAudits').doc(commandRef.id), { action: input.action, actorUid: uid,
          actorEmail: normalizeEmail(email), reason: input.reason, timestamp: now, auctionId: ref.id,
          before: { taxHandling: before.taxHandling, taxDisclaimerVersion: before.taxDisclaimerVersion, revision: before.dealerListingRevision },
          after: patch });
        return { status: 200, auctionId: ref.id, dealerListingRevision: input.expectedRevision + 1 };
      }
      const application = (await tx.get(applicationRef!)).data();
      if (!application || application.applicantType !== 'dealer') return { status: 404, error: 'canonical-dealer-application-required' };
      const applicationFingerprint = hash(JSON.stringify(Object.entries(application).sort(([a], [b]) => a.localeCompare(b))));
      const review = (await tx.get(caseRef)).data();
      const profile = validId(review?.dealerId) ? (await tx.get(firestore.collection('dealer_profiles').doc(review.dealerId))).data() : null;
      const listingIdentity = { sellerType: 'dealer', dealerId: review?.dealerId, sellerId: profile?.primaryRepresentativeUid };
      const eligible = !!profile && Number.isSafeInteger(review?.revision) && review.revision > 0 && profile.verificationCaseId === caseId &&
        await dealerListingEligible(tx, firestore, listingIdentity, profile.primaryRepresentativeUid);
      const snapshot = profile && dealerSnapshot(profile, review!.dealerId, review!.revision);
      if (input.action === 'read') return { status: 200, applicationStatus: application.status,
        applicationFingerprint, vehicleTitle: `${application.year || ''} ${application.make || ''} ${application.model || ''}`,
        convertedAuctionId: application.convertedAuctionId || null, revision: review?.revision ?? 0,
        eligible: !!eligible && !!snapshot, dealer: snapshot, representativeUid: profile?.primaryRepresentativeUid || null };
      if (!eligible || !snapshot || profile!.primaryRepresentativeUid !== checkedUid || review!.revision !== input.expectedRevision) return { status: 409, error: 'dealer-verification-changed-or-ineligible' };
      if (input.applicationFingerprint !== applicationFingerprint) return { status: 409, error: 'application-changed-reload' };
      if (!['pending', 'reviewed', 'approved'].includes(application.status) || application.convertedAuctionId ||
          application.declarationVersion !== INTAKE_DECLARATION_VERSION || application.termsAccepted !== true ||
          DEALER_DECLARATIONS.some(([key]) => application[key] !== true) ||
          typeof application.year !== 'string' || !/^\d{4}$/.test(application.year) ||
          ['make', 'model'].some(key => typeof application[key] !== 'string' || !application[key].trim() || application[key].length > 120) ||
          ['generation', 'vin', 'mileage', 'transmission', 'location', 'locationCity', 'locationProvince', 'locationCountry'].some(key =>
            application[key] !== undefined && (typeof application[key] !== 'string' || application[key].length > 300))) return { status: 409, error: 'application-not-convertible' };
      const auctionId = `dealer-intake-${hash(input.applicationId!).slice(0, 40)}`;
      const ref = firestore.collection('auctions').doc(auctionId);
      const mediaRef = firestore.collection('settings').doc(`media-${auctionId}`);
      const [existing, existingMedia] = await tx.getAll(ref, mediaRef);
      if (existing.exists || existingMedia.exists) return { status: 409, error: 'draft-reference-conflict' };
      const defaults = (await tx.get(firestore.collection('settings').doc('global'))).data() || {};
      const startingBid = Number.isSafeInteger(defaults.defaultStartingBid) && defaults.defaultStartingBid >= 0 ? defaults.defaultStartingBid : 1000;
      const minimumIncrement = Number.isSafeInteger(defaults.defaultMinIncrement) && defaults.defaultMinIncrement > 0 ? defaults.defaultMinIncrement : 250;
      const title = `${application.year} ${application.make} ${application.model}`.slice(0, 240);
      const auction = { id: auctionId, title, year: application.year, make: application.make, model: application.model,
        generation: application.generation || '', vin: application.vin || '', mileage: application.mileage || '',
        drivetrain: application.transmission || '', location: application.location || '',
        locationCity: application.locationCity || '', locationProvince: application.locationProvince || '', locationCountry: application.locationCountry || 'Canada',
        sellerId: checkedUid, sellerName: snapshot.displayName, sellerType: 'dealer', dealerId: review!.dealerId, dealerSnapshot: snapshot,
        dealerDocFee: 0, taxHandling: input.taxHandling, taxDisclaimerVersion: DEALER_TAX_DISCLAIMER_VERSION,
        sourceApplicationId: input.applicationId, sourceApplicationCollection: 'consignment_applications', dealerListingRevision: 0,
        status: 'draft', currency: 'CAD', startingBid, minimumIncrement, currentBid: 0, bidCount: 0,
        reserveAmount: 0, isReserveMet: true, watchCount: 0, startTime: now, endTime: now + 604800000,
        sellerDraftRevision: 0, createdAt: now, updatedAt: now };
      tx.create(ref, auction);
      tx.create(mediaRef, { vehicleName: title, overviewHeading: title, overviewParagraphs: [], fullGallery: [], heroImages: [], showcaseChapters: [], inlineShowcase: [], videoChapters: [], youtubePlaylistUrl: '' });
      tx.update(applicationRef!, { status: 'approved', convertedAuctionId: auctionId, reviewedAt: now, reviewedBy: uid, updatedAt: now });
      tx.create(commandRef, { actorUid: uid, fingerprint, auctionId });
      tx.create(firestore.collection('dealerListingAudits').doc(commandRef.id), { action: 'convert', actorUid: uid,
        actorEmail: normalizeEmail(email), reason: input.reason, timestamp: now, auctionId, applicationId: input.applicationId,
        before: { applicationStatus: application.status, convertedAuctionId: null }, after: { applicationStatus: 'approved', auction }, verificationRevision: review!.revision });
      return { status: 201, auctionId };
    });
    return res.status(result.status).json(result.status < 300 ? result : { error: result.error });
  });
}
export default handleDealerListing;
