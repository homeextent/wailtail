import { getFirebaseAdminServices } from './_lib/firebaseAdmin.js';

export function projectPublicBranding(record: Record<string, unknown>) {
  return Object.fromEntries(['siteLogo', 'siteName', 'siteTagline'].flatMap(key =>
    typeof record[key] === 'string' && record[key].length <= 2000 ? [[key, record[key]]] : []));
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method-not-allowed' });
  }
  try {
    const firestore = getFirebaseAdminServices().firestore;
    const [global, legacy] = await firestore.getAll(firestore.collection('settings').doc('global'), firestore.collection('settings').doc('main-media-config'));
    return res.status(200).json({ branding: projectPublicBranding({ ...legacy.data(), ...global.data() }) });
  } catch {
    return res.status(503).json({ error: 'Branding unavailable.' });
  }
}
