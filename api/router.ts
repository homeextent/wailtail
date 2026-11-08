// The only Vercel Function entry point. Endpoint modules live outside api/ so they
// remain independently testable without each consuming a deployed function.
const endpoints: Record<string, () => Promise<{ default: (req: any, res: any) => any }>> = {
  'submit-consignment': () => import('../server/api/submit-consignment.js'),
  'admin-dealer-verification': () => import('../server/api/admin-dealer-verification.js'),
  'admin-consignment-review': () => import('../server/api/admin-consignment-review.js'),
  'auction-member-actions': () => import('../server/api/auction-member-actions.js'),
  'public-settings': () => import('../server/api/public-settings.js'),
  'admin-create-auction': () => import('../server/api/admin-create-auction.js'),
  'admin-delete-auction': () => import('../server/api/admin-delete-auction.js'),
  'admin-delete-user': () => import('../server/api/admin-delete-user.js'),
  'admin-duplicate-auction': () => import('../server/api/admin-duplicate-auction.js'),
  'admin-reset-auction-bids': () => import('../server/api/admin-reset-auction-bids.js'),
  'admin-retract-auction-bid': () => import('../server/api/admin-retract-auction-bid.js'),
  'admin-return-auction-to-draft': () => import('../server/api/admin-return-auction-to-draft.js'),
  'admin-save-auction-media': () => import('../server/api/admin-save-auction-media.js'),
  'admin-settle-auction': () => import('../server/api/admin-settle-auction.js'),
  'admin-update-auction': () => import('../server/api/admin-update-auction.js'),
  'admin-upload-auction-image': () => import('../server/api/admin-upload-auction-image.js'),
  'ai-assistant': () => import('../server/api/ai-assistant.js'),
  'auction-clock': () => import('../server/api/auction-clock.js'),
  'auction-comments': () => import('../server/api/auction-comments.js'),
  'authorize-approved-consignor': () => import('../server/api/authorize-approved-consignor.js'),
  'dispatch-auction-notifications': () => import('../server/api/dispatch-auction-notifications.js'),
  'dispatch-auction-review': () => import('../server/api/dispatch-auction-review.js'),
  'place-auction-bid': () => import('../server/api/place-auction-bid.js'),
  'public-auctions': () => import('../server/api/public-auctions.js'),
  'reconcile-auction-clock': () => import('../server/api/reconcile-auction-clock.js'),
  'seller-draft-list': () => import('../server/api/seller-draft-list.js'),
  'seller-draft-media': () => import('../server/api/seller-draft-media.js'),
  'seller-draft-narrative': () => import('../server/api/seller-draft-narrative.js'),
  'seller-draft-read': () => import('../server/api/seller-draft-read.js'),
  'seller-draft-submit': () => import('../server/api/seller-draft-submit.js'),
  'seller-draft-upload': () => import('../server/api/seller-draft-upload.js'),
  'send-consignment-email': () => import('../server/api/send-consignment-email.js'),
  'youtube-playlist': () => import('../server/api/youtube-playlist.js'),
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
