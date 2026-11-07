// The only Vercel Function entry point. Endpoint modules live outside api/ so they
// remain independently testable without each consuming a deployed function.
const endpoints: Record<string, () => Promise<{ default: (req: any, res: any) => any }>> = {
  'admin-create-auction': () => import('../server/api/admin-create-auction'),
  'admin-delete-auction': () => import('../server/api/admin-delete-auction'),
  'admin-delete-user': () => import('../server/api/admin-delete-user'),
  'admin-duplicate-auction': () => import('../server/api/admin-duplicate-auction'),
  'admin-reset-auction-bids': () => import('../server/api/admin-reset-auction-bids'),
  'admin-retract-auction-bid': () => import('../server/api/admin-retract-auction-bid'),
  'admin-return-auction-to-draft': () => import('../server/api/admin-return-auction-to-draft'),
  'admin-save-auction-media': () => import('../server/api/admin-save-auction-media'),
  'admin-settle-auction': () => import('../server/api/admin-settle-auction'),
  'admin-update-auction': () => import('../server/api/admin-update-auction'),
  'admin-upload-auction-image': () => import('../server/api/admin-upload-auction-image'),
  'ai-assistant': () => import('../server/api/ai-assistant'),
  'auction-clock': () => import('../server/api/auction-clock'),
  'auction-comments': () => import('../server/api/auction-comments'),
  'authorize-approved-consignor': () => import('../server/api/authorize-approved-consignor'),
  'dispatch-auction-notifications': () => import('../server/api/dispatch-auction-notifications'),
  'dispatch-auction-review': () => import('../server/api/dispatch-auction-review'),
  'place-auction-bid': () => import('../server/api/place-auction-bid'),
  'public-auctions': () => import('../server/api/public-auctions'),
  'reconcile-auction-clock': () => import('../server/api/reconcile-auction-clock'),
  'seller-draft-list': () => import('../server/api/seller-draft-list'),
  'seller-draft-media': () => import('../server/api/seller-draft-media'),
  'seller-draft-narrative': () => import('../server/api/seller-draft-narrative'),
  'seller-draft-read': () => import('../server/api/seller-draft-read'),
  'seller-draft-submit': () => import('../server/api/seller-draft-submit'),
  'seller-draft-upload': () => import('../server/api/seller-draft-upload'),
  'send-consignment-email': () => import('../server/api/send-consignment-email'),
  'youtube-playlist': () => import('../server/api/youtube-playlist'),
};

export default async function handler(req: any, res: any) {
  const endpoint = req.query?.__endpoint;
  if (typeof endpoint !== 'string' || !Object.hasOwn(endpoints, endpoint)) {
    return res.status(404).json({ error: 'API endpoint not found.' });
  }
  // Routing is internal metadata. All other query values, body, method and
  // credentials pass through to the handler's existing authorization checks.
  const { __endpoint: _route, ...query } = req.query;
  req.query = query;
  const module = await endpoints[endpoint]();
  return module.default(req, res);
}
