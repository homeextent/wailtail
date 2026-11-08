import { createHash } from 'node:crypto';
import { getFirebaseAdminServices, type FirebaseAdminServices } from './_lib/firebaseAdmin.js';
import { CANADIAN_LICENSING_JURISDICTIONS, INTAKE_DECLARATION_VERSION, DEALER_DECLARATIONS } from '../../src/config/consignmentIntake.js';

const textLimits: Record<string, number> = {
  make: 120, model: 120, generation: 160, vin: 40, mileage: 80, transmission: 120,
  location: 300, locationCity: 120, locationProvince: 120, locationCountry: 100,
  reserveExpectation: 120, sellerName: 160, sellerEmail: 254, sellerPhone: 50, notes: 8000
};
const dealerLimits: Record<string, number> = { submittedDealershipName: 200, submittedDbaName: 200, submittedDealerLicenseNumber: 100, submittedLicensingJurisdiction: 2 };
export function parseConsignmentIntake(body: unknown): { error: string } | { submissionId: string; application: Record<string, any> } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid application.' };
  const input = body as Record<string, unknown>;
  const allowed = new Set(['submissionId', 'applicantType', 'year', 'termsAccepted', 'declarationVersion',
    ...Object.keys(textLimits), ...Object.keys(dealerLimits), ...DEALER_DECLARATIONS.map(([key]) => key)]);
  if (Object.keys(input).some(key => !allowed.has(key))) return { error: 'Application contains unsupported fields.' };
  if (typeof input.submissionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.submissionId)) return { error: 'Invalid submission reference.' };
  if (typeof input.applicantType !== 'string' || !['private', 'dealer'].includes(input.applicantType)) return { error: 'Select private seller or dealer.' };
  if (input.termsAccepted !== true || input.declarationVersion !== INTAKE_DECLARATION_VERSION) return { error: 'Confirm the current ownership and terms agreement.' };
  const year = typeof input.year === 'number' ? String(input.year) : input.year;
  if (typeof year !== 'string' || !/^\d{4}$/.test(year) || Number(year) < 1900 || Number(year) > new Date().getUTCFullYear() + 1) return { error: 'Provide a valid vehicle year.' };
  const application: Record<string, any> = { applicantType: input.applicantType, year };
  for (const [key, max] of Object.entries({ ...textLimits, ...dealerLimits })) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'string' || (input[key] as string).length > max) return { error: `Invalid or oversized field: ${key}.` };
    application[key] = (input[key] as string).trim();
  }
  if (['make', 'model', 'sellerName'].some(key => !application[key])) return { error: 'Provide vehicle make, model and contact name.' };
  application.sellerEmail = (application.sellerEmail || '').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(application.sellerEmail)) return { error: 'Provide a valid contact email.' };
  if (application.vin) application.vin = application.vin.toUpperCase();
  if (input.applicantType === 'dealer') {
    if (!application.submittedDealershipName || !application.submittedDealerLicenseNumber ||
        !CANADIAN_LICENSING_JURISDICTIONS.some(([code]) => code === application.submittedLicensingJurisdiction)) return { error: 'Provide the legal business name, dealer licence number and Canadian licensing jurisdiction.' };
    if (!application.sellerPhone || !/^[+\d() .-]+$/.test(application.sellerPhone) || application.sellerPhone.replace(/\D/g, '').length < 7 || application.sellerPhone.replace(/\D/g, '').length > 20) return { error: 'Provide the authorized representative’s phone number.' };
    if (DEALER_DECLARATIONS.some(([key]) => input[key] !== true)) return { error: 'Confirm all three dealer declarations.' };
    for (const [key] of DEALER_DECLARATIONS) application[key] = true;
  } else if ([...Object.keys(dealerLimits), ...DEALER_DECLARATIONS.map(([key]) => key)].some(key => key in input)) {
    return { error: 'Dealer details must be submitted as a dealer application.' };
  }
  application.termsAccepted = true;
  application.declarationVersion = INTAKE_DECLARATION_VERSION;
  return { submissionId: input.submissionId, application };
}

export async function handleSubmitConsignment(req: any, res: any, services?: Pick<FirebaseAdminServices, 'firestore'>) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method-not-allowed' }); }
  const input = parseConsignmentIntake(req.body);
  if ('error' in input) return res.status(422).json({ error: input.error });
  try {
    const { firestore } = services ?? getFirebaseAdminServices();
    const canonical = firestore.collection('consignment_applications').doc(input.submissionId);
    const legacy = firestore.collection('consignments').doc(input.submissionId);
    const command = firestore.collection('consignmentIntakeCommands').doc(input.submissionId);
    const hash = createHash('sha256').update(JSON.stringify(input.application)).digest('hex');
    const result = await firestore.runTransaction(async transaction => {
      const previous = (await transaction.get(command)).data();
      const canonicalExists = (await transaction.get(canonical)).exists;
      const legacyExists = (await transaction.get(legacy)).exists;
      if (previous) return { status: previous.hash === hash && canonicalExists && legacyExists ? 200 : 409, created: false };
      if (canonicalExists || legacyExists) return { status: 409, created: false };
      const now = Date.now();
      const record = { ...input.application, submittedAt: now, declarationAcceptedAt: now, status: 'pending' };
      transaction.create(canonical, record);
      transaction.create(legacy, record);
      transaction.create(command, { hash, createdAt: now });
      return { status: 201, created: true };
    });
    if (result.status === 409) return res.status(409).json({ error: 'Submission changed or reference already exists. Please retry with a new submission reference.' });
    return res.status(result.status).json({ applicationId: input.submissionId, created: result.created });
  } catch { return res.status(503).json({ error: 'Application could not be saved. Please retry; your information has been retained.' }); }
}
export default handleSubmitConsignment;
