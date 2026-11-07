import { readMemberActivity } from './_lib/memberActivity.js';
import { withSellerDraftRequest } from './seller-draft-narrative.js';
import { projectPublicAuction } from './public-auctions.js';

export default function handler(req: any, res: any) {
  return withSellerDraftRequest(req, res, undefined, async ({ firestore, auth }, uid, email) => {
    const input = req.body ?? {};
    const { action, auctionId } = input;
    if (action === 'activity') {
      if (!email) return res.status(401).json({ error: 'Verified email required.' });
      return res.status(200).json(await readMemberActivity(firestore, uid, email));
    }
    if (typeof auctionId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(auctionId) ||
        !['watch', 'inquiry'].includes(action)) return res.status(422).json({ error: 'Invalid member action.' });
    const user = firestore.collection('users').doc(uid);
    const auction = firestore.collection('auctions').doc(auctionId);
    if (action === 'watch') {
      if (typeof input.watching !== 'boolean') return res.status(422).json({ error: 'Choose whether to watch this listing.' });
      const result = await firestore.runTransaction(async tx => {
        const [profile, lot] = await tx.getAll(user, auction);
        if (!profile.exists || profile.get('isBanned') === true) return { status: 403 };
        const current = Array.isArray(profile.get('watchlist')) ? profile.get('watchlist').filter((id: unknown) => typeof id === 'string') : [];
        const watching = current.includes(auctionId);
        // Removing a retired listing is still permitted.
        if (input.watching && (!lot.exists || !projectPublicAuction(lot.id, lot.data()!))) return { status: 404 };
        if (input.watching && !watching && current.length >= 500) return { status: 422 };
        const watchlist = input.watching ? [...new Set([...current, auctionId])] : current.filter((id: string) => id !== auctionId);
        const count = Number.isSafeInteger(lot.get('watchCount')) ? Math.max(0, lot.get('watchCount')) : 0;
        const watchCount = Math.max(0, count + (watching === input.watching ? 0 : input.watching ? 1 : -1));
        tx.update(user, { watchlist });
        if (lot.exists && watching !== input.watching) tx.update(auction, { watchCount });
        return { status: 200, watchlist, isWatching: input.watching, watchCount };
      });
      return res.status(result.status).json(result.status === 200 ? result : { error: 'Watchlist update unavailable.' });
    }
    const { message, topic, senderPhone = '', requestId } = input;
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,64}$/.test(requestId) ||
        typeof message !== 'string' || !message.trim() || message.length > 6000 ||
        typeof topic !== 'string' || !topic.trim() || topic.length > 160 ||
        typeof senderPhone !== 'string' || senderPhone.length > 80) return res.status(422).json({ error: 'Invalid inquiry.' });
    const identity = await auth.getUser(uid);
    const inquiry = firestore.collection('inquiries').doc(`${uid}_${requestId}`);
    const limit = firestore.collection('memberActionLimits').doc(uid);
    const result = await firestore.runTransaction(async tx => {
      const [existing, profile, lot, recent] = await tx.getAll(inquiry, user, auction, limit);
      if (!profile.exists || profile.get('isBanned') === true) return 403;
      if (existing.exists) return existing.get('auctionId') === auctionId ? 200 : 409;
      if (!lot.exists || !projectPublicAuction(lot.id, lot.data()!)) return 404;
      const now = Date.now();
      if (now - (recent.get('lastInquiryAt') ?? 0) < 30000) return 429;
      const seller = lot.get('sellerEmail');
      const recipient = typeof seller === 'string' && /^[^\s@]+@[^\s@]+$/.test(seller)
        ? seller : 'jeremy@theinnovativegroup.ca';
      const senderName = identity.displayName || 'Registered Member';
      tx.create(inquiry, { auctionId, senderId: uid, senderEmail: email, senderName,
        senderPhone, topic: topic.trim(), message: message.trim(), timestamp: now, status: 'new' });
      tx.set(limit, { lastInquiryAt: now }, { merge: true });
      tx.create(firestore.collection('auctionNotificationOutbox').doc(`inquiry_${inquiry.id}`), {
        status: 'queued', notificationType: 'seller_inquiry', createdAt: now,
        from: process.env.RESEND_FROM_EMAIL || 'Wailtail <consignments@wailtail.com>', to: [recipient],
        message: { subject: `Vehicle inquiry: ${String(lot.get('title') || auctionId).slice(0, 200)}`,
          text: `${senderName} (${email})\nPhone: ${senderPhone}\nTopic: ${topic.trim()}\n\n${message.trim()}` },
        metadata: { auctionId, inquiryId: inquiry.id }
      });
      return 201;
    });
    return res.status(result).json(result < 300 ? { submitted: true } : { error: result === 429 ? 'Please wait before sending another inquiry.' : 'Inquiry unavailable.' });
  });
}
