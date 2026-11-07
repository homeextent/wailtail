import { isDesignatedAdminEmail } from '../src/config/adminConfig';
import { withSellerDraftRequest } from './seller-draft-narrative';

const id = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
const publicStatuses = ['preview', 'upcoming', 'active', 'live', 'ending_soon', 'ended', 'sold', 'reserve_not_met'];

export default function handler(req: any, res: any) {
  return withSellerDraftRequest(req, res, undefined, async ({ firestore }, uid, email) => {
    const input = req.body;
    const action = input?.action;
    if (!['post', 'edit', 'delete', 'vote', 'pin'].includes(action) ||
        (action === 'post' ? !id(input.auctionId) : !id(input.commentId))) {
      return res.status(422).json({ error: 'Invalid comment request.' });
    }
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    if ((action === 'post' || action === 'edit') && (!text || text.length > 5000)) {
      return res.status(422).json({ error: 'Comment must contain 1 to 5000 characters.' });
    }
    if ((action === 'post' && input.replyToId !== undefined && !id(input.replyToId)) ||
        (action === 'pin' && typeof input.pinned !== 'boolean')) {
      return res.status(422).json({ error: 'Invalid comment request.' });
    }

    const admin = isDesignatedAdminEmail(email);
    const comments = firestore.collection('comments');
    const ref = action === 'post' ? comments.doc() : comments.doc(input.commentId);
    const result = await firestore.runTransaction(async tx => {
      const existing = action === 'post' ? undefined : (await tx.get(ref)).data();
      const auctionId = action === 'post' ? input.auctionId : existing?.auctionId;
      if (!id(auctionId)) return 404;
      const auction = (await tx.get(firestore.collection('auctions').doc(auctionId))).data();
      if (!auction || !publicStatuses.includes(auction.status)) return 404;
      const now = Date.now();

      if (action === 'post') {
        const user = (await tx.get(firestore.collection('users').doc(uid))).data();
        if (user?.isBanned === true) return 403;
        if (input.replyToId) {
          const parent = (await tx.get(comments.doc(input.replyToId))).data();
          if (parent?.auctionId !== auctionId) return 404;
        }
        const name = typeof user?.displayName === 'string' && user.displayName.trim()
          ? user.displayName.trim().slice(0, 120) : 'Member';
        tx.create(ref, {
          auctionId, userId: uid, userName: name, text, timestamp: now,
          userBadge: admin ? 'Admin' : auction.sellerId === uid ? 'Seller' : 'Member',
          upvotes: 0, upvotedBy: [], ...(input.replyToId ? { replyToId: input.replyToId } : {})
        });
        return 201;
      }

      if (!existing) return 404;
      if (action === 'edit' || action === 'delete') {
        if (existing.isBid === true || (!admin && existing.userId !== uid)) return 403;
        if (action === 'edit') tx.update(ref, { text, isEdited: true, editedAt: now });
        else tx.delete(ref);
        return 200;
      }
      if (action === 'pin') {
        if (!admin && auction.sellerId !== uid) return 403;
        if (input.pinned) {
          const pinned = await tx.get(comments.where('auctionId', '==', auctionId).where('isPinned', '==', true));
          for (const doc of pinned.docs) {
            if (doc.id !== ref.id) tx.update(doc.ref, { isPinned: false, pinnedAt: null, pinnedBy: null });
          }
        }
        tx.update(ref, { isPinned: input.pinned, pinnedAt: input.pinned ? now : null, pinnedBy: input.pinned ? uid : null });
        return 200;
      }
      const voters = new Set<string>(Array.isArray(existing.upvotedBy)
        ? existing.upvotedBy.filter((entry: unknown): entry is string => typeof entry === 'string')
        : []);
      if (voters.has(uid)) voters.delete(uid);
      else voters.add(uid);
      tx.update(ref, { upvotedBy: [...voters], upvotes: voters.size });
      return 200;
    });

    if (result >= 400) return res.status(result).json({ error: 'Comment operation denied.' });
    return res.status(result).json({ id: ref.id });
  });
}
