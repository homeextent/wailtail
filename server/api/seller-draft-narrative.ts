import { dealerListingEligible } from './_lib/dealerEligibility.js';
import { getFirebaseAdminServices, type FirebaseAdminServices } from './_lib/firebaseAdmin.js';

const MAX_HEADING_LENGTH = 240;
const MAX_PARAGRAPHS = 40;
const MAX_PARAGRAPH_LENGTH = 4000;

export function parseDraftNarrative(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !['auctionId', 'expectedRevision', 'overviewHeading', 'overviewParagraphs', 'videoTitle', 'videoSubtitle', 'youtubePlaylistUrl', 'showcaseEdits', 'galleryOrder', 'videoChapters'].includes(key))) {
    return null;
  }
  const { auctionId, expectedRevision, overviewHeading, overviewParagraphs } = input;
  if (typeof auctionId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(auctionId) ||
      typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision) ||
      expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER ||
      typeof overviewHeading !== 'string' || overviewHeading.length > MAX_HEADING_LENGTH ||
      !Array.isArray(overviewParagraphs) || overviewParagraphs.length > MAX_PARAGRAPHS ||
      overviewParagraphs.some(value => typeof value !== 'string' || value.length > MAX_PARAGRAPH_LENGTH)) {
    return null;
  }

  const { videoTitle, videoSubtitle, youtubePlaylistUrl } = input;
  if ((videoTitle !== undefined && (typeof videoTitle !== 'string' || videoTitle.length > 240)) ||
      (videoSubtitle !== undefined && (typeof videoSubtitle !== 'string' || videoSubtitle.length > 1000)) ||
      (youtubePlaylistUrl !== undefined && (typeof youtubePlaylistUrl !== 'string' || !isPlaylistUrl(youtubePlaylistUrl)))) {
    return null;
  }
  const showcaseEdits = input.showcaseEdits;
  if (showcaseEdits !== undefined && (!Array.isArray(showcaseEdits) || showcaseEdits.length > 30 ||
      !showcaseEdits.every(isShowcaseEdit) || new Set(showcaseEdits.map(edit => edit.id)).size !== showcaseEdits.length)) {
    return null;
  }
  const { galleryOrder, videoChapters } = input;
  if (galleryOrder !== undefined && (!Array.isArray(galleryOrder) || galleryOrder.length > 100 ||
      !galleryOrder.every(id => typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id)) ||
      new Set(galleryOrder).size !== galleryOrder.length)) return null;
  if (videoChapters !== undefined && (!Array.isArray(videoChapters) || videoChapters.length > 20 ||
      !videoChapters.every(isVideoChapter))) return null;
  const video = {
    ...(typeof videoTitle === 'string' ? { videoTitle } : {}),
    ...(typeof videoSubtitle === 'string' ? { videoSubtitle } : {}),
    ...(typeof youtubePlaylistUrl === 'string' ? { youtubePlaylistUrl } : {})
  };
  return { auctionId, expectedRevision, overviewHeading, overviewParagraphs, ...video,
    ...(Array.isArray(galleryOrder) ? { galleryOrder } : {}),
    ...(Array.isArray(videoChapters) ? { videoChapters } : {}), ...(Array.isArray(showcaseEdits) ? { showcaseEdits } : {}) };
}

interface ShowcaseEdit {
  id: string;
  title?: string;
  highlights?: string[];
  photoAssetId?: string | null;
  subtitle: string;
  narrative: string;
}

function isShowcaseEdit(value: unknown): value is ShowcaseEdit {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const edit = value as Record<string, unknown>;
  return Object.keys(edit).every(key => ['id', 'subtitle', 'narrative', 'title', 'highlights', 'photoAssetId'].includes(key)) &&
    typeof edit.id === 'string' && edit.id.length > 0 && edit.id.length <= 160 &&
    typeof edit.subtitle === 'string' && edit.subtitle.length <= 240 &&
    typeof edit.narrative === 'string' && edit.narrative.length <= 4000 &&
    (edit.photoAssetId == null || (typeof edit.photoAssetId === 'string' && /^[0-9a-f-]{36}$/.test(edit.photoAssetId))) &&
    (edit.title === undefined || (typeof edit.title === 'string' && edit.title.trim().length > 0 && edit.title.length <= 240)) &&
    (edit.highlights === undefined || (Array.isArray(edit.highlights) && edit.highlights.length <= 20 &&
      edit.highlights.every(item => typeof item === 'string' && item.length <= 240)));
}

function sellerShowcaseChapters(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap(chapter => {
    if (!chapter || typeof chapter.id !== 'string') return [];
    return [{
      id: chapter.id,
      photoAssetId: typeof chapter.photoAssetId === 'string' ? chapter.photoAssetId : null,
      customTitle: chapter.category === 'CUSTOM',
      highlights: Array.isArray(chapter.highlights) ? chapter.highlights.filter(item => typeof item === 'string') : [],
      title: typeof chapter.title === 'string' ? chapter.title : '',
      subtitle: typeof chapter.subtitle === 'string' ? chapter.subtitle : '',
      narrative: typeof chapter.narrative === 'string' ? chapter.narrative : ''
    }];
  });
}

function isVideoChapter(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const chapter = value as Record<string, unknown>;
  return Object.keys(chapter).every(key => ['title', 'description', 'videoUrl'].includes(key)) &&
    typeof chapter.title === 'string' && chapter.title.trim().length > 0 && chapter.title.length <= 240 &&
    typeof chapter.description === 'string' && chapter.description.length <= 1000 &&
    isVideoChapterUrl(chapter.videoUrl);
}

function isVideoChapterUrl(value: unknown) {
  return typeof value === 'string' && /^https:\/\/(?:(?:www\.)?youtube\.com\/watch\?v=|youtu\.be\/)[A-Za-z0-9_-]{11}(?:[?&]si=[A-Za-z0-9_-]{1,128})?$/.test(value);
}

function isPlaylistUrl(value: string) {
  if (value === '') return true;
  return /^https:\/\/(?:www\.)?youtube\.com\/playlist\?list=[A-Za-z0-9_-]{1,128}(?:&si=[A-Za-z0-9_-]{1,128})?$/.test(value);
}

export function checkDraftNarrativeWrite(
  auction: { sellerId?: unknown; status?: unknown; sellerDraftRevision?: unknown } | undefined,
  uid: string,
  expectedRevision: number
) {
  if (!auction || auction.sellerId !== uid) return 404;
  if (auction.status !== 'draft' || (auction.sellerDraftRevision ?? 0) !== expectedRevision) return 409;
  return 200;
}

async function handleSellerDraftCommand(
  req: any,
  res: any,
  services: Pick<FirebaseAdminServices, 'auth' | 'firestore'> | undefined,
  submit: boolean
) {
  return withSellerDraftRequest(req, res, services, async ({ firestore }, uid) => {
    const playlist = req.body?.youtubePlaylistUrl;
    if (!submit && playlist !== undefined && (typeof playlist !== 'string' || !isPlaylistUrl(playlist))) {
      return res.status(422).json({ error: 'invalid-youtube-playlist-url' });
    }
    const videoChapters = req.body?.videoChapters;
    if (!submit && Array.isArray(videoChapters) && videoChapters.length <= 20) {
      const invalidIndex = videoChapters.findIndex(chapter => !isVideoChapterUrl(chapter?.videoUrl));
      if (invalidIndex !== -1) {
        return res.status(422).json({ error: 'invalid-video-chapter-url', chapter: invalidIndex + 1 });
      }
    }
    const input = submit ? parseDraftSubmission(req.body) : parseDraftNarrative(req.body);
    if (!input) return res.status(422).json({ error: 'invalid-draft-request' });
    const auctionRef = firestore.collection('auctions').doc(input.auctionId);
    const mediaRef = firestore.collection('settings').doc(draftMediaId(input.auctionId));
    const status = await firestore.runTransaction(async transaction => {
      const auction = await transaction.get(auctionRef);
      const record = auction.data();
      const decision = checkDraftNarrativeWrite(record, uid, input.expectedRevision);
      if (decision !== 200) return decision;
      if (!await dealerListingEligible(transaction, firestore, record!, uid)) return 403;

      const updatedAt = Date.now();
      if (submit) {
        if (!record || !hasReviewIdentity(record)) return 422;
        const revision = input.expectedRevision + 1;
        const event = firestore.collection('auctionReviewOutbox').doc(auctionRef.id).collection('events').doc(String(revision));
        transaction.create(event, {
          type: 'listing_submitted_for_review', auctionId: input.auctionId, sellerId: uid,
          revision, status: 'queued', createdAt: updatedAt
        });
        const queue = firestore.collection('auctionReviewQueue').doc(`${input.auctionId}:${revision}`);
        transaction.create(queue, { auctionId: input.auctionId, revision, createdAt: updatedAt });
        transaction.update(auctionRef, { status: 'pending_review', sellerDraftRevision: revision, updatedAt });
        return 200;
      }
      if (!('overviewHeading' in input) || !('overviewParagraphs' in input)) return 422;
      const mediaPatch: Record<string, unknown> = {};
      if ('videoChapters' in input && Array.isArray(input.videoChapters)) {
        mediaPatch.videoChapters = input.videoChapters;
      }
      if ('galleryOrder' in input && Array.isArray(input.galleryOrder)) {
        const active = await transaction.get(auctionRef.collection('draftAssets').where('removedAt', '==', null).limit(100));
        const ids = new Set(active.docs.map(asset => asset.id));
        if (input.galleryOrder.length !== ids.size || !input.galleryOrder.every(id => ids.has(id))) return 422;
        mediaPatch.sellerDraftGalleryOrder = input.galleryOrder;
      }
      if ('showcaseEdits' in input && Array.isArray(input.showcaseEdits) && input.showcaseEdits.length) {
        const edits = new Map<string, ShowcaseEdit>(input.showcaseEdits.map(edit => [edit.id, edit]));
        const current = (await transaction.get(mediaRef)).get('showcaseChapters');
        if (!Array.isArray(current)) return 422;
        const photoIds = new Set<string>();
        for (const edit of edits.values()) {
          if (edit.photoAssetId) photoIds.add(edit.photoAssetId);
        }
        for (const id of photoIds) {
          const asset = (await transaction.get(auctionRef.collection('draftAssets').doc(id))).data();
          if (!asset || asset.removedAt !== null || asset.objectPath !== `auctionDraft/${input.auctionId}/${id}`) return 422;
        }
        const chapters = current.map(chapter => {
          const edit = edits.get(chapter?.id);
          if (!edit || (edit.title !== undefined && chapter.category !== 'CUSTOM')) return chapter;
          edits.delete(edit.id);
          return {
            ...chapter, subtitle: edit.subtitle, narrative: edit.narrative,
            ...(edit.title !== undefined ? { title: edit.title } : {}),
            ...(edit.highlights !== undefined ? { highlights: edit.highlights } : {}),
            ...(edit.photoAssetId !== undefined ? { photoAssetId: edit.photoAssetId } : {})
          };
        });
        if (edits.size) return 422;
        mediaPatch.showcaseChapters = chapters;
      }
      transaction.set(mediaRef, {
        ...mediaPatch,
        overviewHeading: input.overviewHeading,
        overviewParagraphs: input.overviewParagraphs,
        ...('videoTitle' in input ? { videoTitle: input.videoTitle } : {}),
        ...('videoSubtitle' in input ? { videoSubtitle: input.videoSubtitle } : {}),
        ...('youtubePlaylistUrl' in input ? { youtubePlaylistUrl: input.youtubePlaylistUrl } : {}),
        updatedAt
      }, { merge: true });
      transaction.update(auctionRef, {
        sellerDraftRevision: input.expectedRevision + 1,
        updatedAt
      });
      return 200;
    });

    if (status === 403) return res.status(403).json({ error: 'dealer-verification-required' });
    if (status === 404) return res.status(404).json({ error: 'draft-not-found' });
    if (status === 409) return res.status(409).json({ error: 'draft-state-or-revision-conflict' });
    if (status === 422) return res.status(422).json({ error: 'incomplete-draft' });
    return res.status(200).json({ revision: input.expectedRevision + 1, ...(submit ? { status: 'pending_review' } : {}) });
  });
}

function parseDraftSubmission(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => key !== 'auctionId' && key !== 'expectedRevision')) return null;
  const parsed = parseDraftNarrative({ ...input, overviewHeading: '', overviewParagraphs: [] });
  return parsed && { auctionId: parsed.auctionId, expectedRevision: parsed.expectedRevision };
}

function hasReviewIdentity(record: Record<string, unknown>) {
  return ['title', 'make', 'model'].every(key => typeof record[key] === 'string' && String(record[key]).trim().length > 0) &&
    (typeof record.year === 'number' ? Number.isInteger(record.year) && record.year > 0 :
      typeof record.year === 'string' && /^\d{4}$/.test(record.year.trim()));
}

export function handleSellerDraftNarrative(req: any, res: any, services?: Pick<FirebaseAdminServices, 'auth' | 'firestore'>) {
  return handleSellerDraftCommand(req, res, services, false);
}

export function handleSellerDraftSubmission(req: any, res: any, services?: Pick<FirebaseAdminServices, 'auth' | 'firestore'>) {
  return handleSellerDraftCommand(req, res, services, true);
}

export async function withSellerDraftRequest(
  req: any,
  res: any,
  services: Pick<FirebaseAdminServices, 'auth' | 'firestore'> | undefined,
  execute: (services: Pick<FirebaseAdminServices, 'auth' | 'firestore'>, uid: string, email: string | undefined) => Promise<unknown>
) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method-not-allowed' });
  }

  const bearer = typeof req.headers?.authorization === 'string'
    ? /^Bearer ([^\s]+)$/i.exec(req.headers.authorization)
    : null;
  if (!bearer) return res.status(401).json({ error: 'unauthorized' });

  try {
    const resolved = services ?? getFirebaseAdminServices();
    let uid: string;
    let email: string | undefined;
    try {
      const token = await resolved.auth.verifyIdToken(bearer[1], true);
      if (!token.uid || token.email_verified !== true) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      uid = token.uid;
      email = token.email;
    } catch {
      return res.status(401).json({ error: 'unauthorized' });
    }
    return await execute(resolved, uid, email);
  } catch {
    return res.status(503).json({ error: 'draft-operation-unavailable' });
  }
}

export function handleSellerDraftRead(req: any, res: any, services?: Pick<FirebaseAdminServices, 'auth' | 'firestore'>) {
  return withSellerDraftRequest(req, res, services, async ({ firestore }, uid) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).length !== 1 || typeof body.auctionId !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,160}$/.test(body.auctionId)) {
      return res.status(422).json({ error: 'invalid-draft-request' });
    }

    const auctionId: string = body.auctionId;
    const auctionRef = firestore.collection('auctions').doc(auctionId);
    const mediaRef = firestore.collection('settings').doc(draftMediaId(auctionId));
    const draft = await firestore.runTransaction(async transaction => {
      const record = (await transaction.get(auctionRef)).data();
      if (!record || record.sellerId !== uid ||
          (record.status !== 'draft' && record.status !== 'pending_review')) return null;

      const media = (await transaction.get(mediaRef)).data();
      const assets = await transaction.get(auctionRef.collection('draftAssets').where('removedAt', '==', null).limit(100));
      return {
        showcaseChapters: sellerShowcaseChapters(media?.showcaseChapters),
        videoTitle: typeof media?.videoTitle === 'string' ? media.videoTitle : '',
        videoSubtitle: typeof media?.videoSubtitle === 'string' ? media.videoSubtitle : '',
        youtubePlaylistUrl: typeof media?.youtubePlaylistUrl === 'string' && isPlaylistUrl(media.youtubePlaylistUrl)
          ? media.youtubePlaylistUrl : '',
        assetIds: orderedDraftAssets(
          assets.docs.sort((a, b) => Number(a.get('createdAt')) - Number(b.get('createdAt'))).map(asset => asset.id),
          media?.sellerDraftGalleryOrder
        ),
        videoChapters: Array.isArray(media?.videoChapters) ? media.videoChapters.flatMap(chapter => {
          if (!chapter || typeof chapter.title !== 'string') return [];
          return [{
            title: chapter.title,
            description: typeof chapter.description === 'string' ? chapter.description : '',
            videoUrl: typeof chapter.videoUrl === 'string' ? chapter.videoUrl : ''
          }];
        }) : [],
        auctionId,
        status: record.status,
        revision: record.sellerDraftRevision ?? 0,
        title: typeof record.title === 'string' ? record.title : '',
        overviewHeading: typeof media?.overviewHeading === 'string' ? media.overviewHeading : '',
        overviewParagraphs: Array.isArray(media?.overviewParagraphs)
          ? media.overviewParagraphs.filter(value => typeof value === 'string')
          : []
      };
    }, { readOnly: true });

    if (!draft) return res.status(404).json({ error: 'draft-not-found' });
    return res.status(200).json(draft);
  });
}

function orderedDraftAssets(ids: string[], order: unknown) {
  if (!Array.isArray(order)) return ids;
  const remaining = new Set(ids);
  return [...order.filter(id => typeof id === 'string' && remaining.delete(id)), ...remaining];
}

export function draftMediaId(auctionId: string) {
  return auctionId === 'wailtail-1978-porsche-911' ? 'main-media-config' : `media-${auctionId}`;
}

export default function handler(req: any, res: any) {
  return handleSellerDraftNarrative(req, res);
}
