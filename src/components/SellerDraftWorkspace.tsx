import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { User } from 'firebase/auth';

const videoFields = [
  ['videoTitle', 'Video title', 240],
  ['videoSubtitle', 'Video subtitle', 1000],
  ['youtubePlaylistUrl', 'YouTube playlist URL', 200]
] as const;

interface ShowcaseChapter {
  id: string;
  customTitle: boolean;
  highlights: string[];
  photoAssetId: string | null;
  title: string;
  subtitle: string;
  narrative: string;
}

interface SellerVideoChapter {
  title: string;
  description: string;
  videoUrl: string;
}

export interface DraftImageView { id: string; placement: 'hero' | 'gallery'; category: string; url: string }
interface DraftAsset { id: string; placement: 'hero' | 'gallery'; category: string }
interface Draft {
  assets: DraftAsset[];
  canEdit?: boolean;
  dealer?: { businessName: string; city: string; province: string; documentationFee: number };
  videoChapters: SellerVideoChapter[];
  showcaseChapters: ShowcaseChapter[];
  videoTitle: string;
  videoSubtitle: string;
  youtubePlaylistUrl: string;
  title: string;
  status: 'draft' | 'pending_review';
  revision: number;
  overviewHeading: string;
  overviewParagraphs: string[];
  assetIds: string[];
}

async function request(user: User, operation: string, body: object, signal?: AbortSignal): Promise<Response> {
  const token = await user.getIdToken();
  const response = await fetch(`/api/seller-draft-${operation}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });
  if (!response.ok) {
    if (response.status === 409) throw new Error('The listing changed. Reload it before trying again.');
    if (response.status === 404) throw new Error('This listing is unavailable to your account.');
    if (response.status === 422 && operation === 'narrative') {
      const failure = await response.clone().json().catch(() => null);
      if (failure?.error === 'invalid-video-chapter-url') {
        throw new Error(`Video chapter ${failure.chapter} needs a YouTube video URL (youtube.com/watch?v=… or youtu.be/…).`);
      }
      if (failure?.error === 'invalid-youtube-playlist-url') {
        throw new Error('Enter a YouTube playlist URL with a list ID, or leave the field blank.');
      }
    }
    if (response.status === 422 && operation === 'media') {
      const failure = await response.clone().json().catch(() => null);
      if (failure?.error === 'draft-image-assigned') throw new Error('Clear the chapter photo assignment and save before removing this image.');
    }
    if (response.status === 422) throw new Error('Check the draft fields or ask an administrator to complete the listing details.');
    throw new Error('The listing operation failed. Please try again.');
  }
  return response;
}

async function draftRequest<T>(user: User, operation: string, body: object, signal?: AbortSignal): Promise<T> {
  return (await request(user, operation, body, signal)).json() as Promise<T>;
}

function imageLabel(assetId: string) {
  return `Image ${assetId.slice(0, 8)}`;
}

function readImage(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.readAsDataURL(file);
  });
}

export function SellerDraftWorkspace({ auctionId, user, onBack, mediaOnly = false, onImagesChanged, galleryFilter = 'all' }: {
  auctionId: string;
  mediaOnly?: boolean;
  galleryFilter?: string;
  onImagesChanged?: (images: DraftImageView[]) => void;
  user: User;
  onBack: () => void;
  // React consumes this JSX attribute when remounting the workspace.
  key?: string;
}) {
  const [uploadCategory, setUploadCategory] = useState('exterior');
  const [imageViews, setImageViews] = useState<DraftImageView[]>([]);
  const imageCache = useRef(new Map<string, string>());
  const uploadLock = useRef(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [heading, setHeading] = useState('');
  const [paragraphs, setParagraphs] = useState('');
  const [video, setVideo] = useState<Pick<Draft, 'videoTitle' | 'videoSubtitle' | 'youtubePlaylistUrl'>>({
    videoTitle: '', videoSubtitle: '', youtubePlaylistUrl: ''
  });
  const [chapters, setChapters] = useState<ShowcaseChapter[]>([]);
  const [videoChapters, setVideoChapters] = useState<SellerVideoChapter[]>([]);
  const [galleryOrder, setGalleryOrder] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ assetId: string; image: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    draftRequest<Draft>(user, 'read', { auctionId }, controller.signal).then(record => {
      if (controller.signal.aborted) return;
      setDraft(record);
      setGalleryOrder(record.assetIds);
      setVideoChapters(record.videoChapters);
      setChapters(record.showcaseChapters);
      setHeading(record.overviewHeading);
      setVideo({ videoTitle: record.videoTitle, videoSubtitle: record.videoSubtitle, youtubePlaylistUrl: record.youtubePlaylistUrl });
      setParagraphs(record.overviewParagraphs.join('\n\n'));
    }).catch((err: Error) => {
      if (!controller.signal.aborted) setError(err.message);
    });
    return () => controller.abort();
  }, [auctionId, user]);

  const assetKey = JSON.stringify((draft?.assetIds ?? []).map(id => draft?.assets.find(asset => asset.id === id)).filter(Boolean));
  useEffect(() => {
    const controller = new AbortController();
    const assets: DraftAsset[] = JSON.parse(assetKey);
    void (async () => {
      const views: DraftImageView[] = [];
      for (const asset of assets) {
        let url = imageCache.current.get(asset.id);
        if (!url) {
          const response = await request(user, 'media', { action: 'preview', auctionId, assetId: asset.id }, controller.signal);
          url = await readImage(await response.blob());
          imageCache.current.set(asset.id, url);
        }
        views.push({ ...asset, url });
      }
      if (!controller.signal.aborted) { setImageViews(views); onImagesChanged?.(views); }
    })().catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [assetKey, auctionId, user, onImagesChanged]);

  const videoPatch = Object.fromEntries(videoFields
    .filter(([key]) => draft && video[key] !== draft[key])
    .map(([key]) => [key, video[key]]));
  const showcaseEdits = chapters.flatMap(({ id, title, customTitle, subtitle, narrative, highlights, photoAssetId }, index) => {
    const saved = draft?.showcaseChapters[index];
    if (!saved) return [];
    const titleChanged = customTitle && saved.title !== title;
    const highlightsChanged = JSON.stringify(saved.highlights) !== JSON.stringify(highlights);
    const photoChanged = saved.photoAssetId !== photoAssetId;
    return photoChanged || titleChanged || highlightsChanged || saved.subtitle !== subtitle || saved.narrative !== narrative
      ? [{ id, subtitle, narrative, ...(titleChanged ? { title } : {}), ...(highlightsChanged ? { highlights } : {}),
        ...(photoChanged ? { photoAssetId } : {}) }]
      : [];
  });
  const galleryChanged = !!draft && galleryOrder.join() !== draft.assetIds.join();
  const videoChaptersChanged = !!draft && JSON.stringify(videoChapters) !== JSON.stringify(draft.videoChapters);
  const dirty = draft !== null &&
    (heading !== draft.overviewHeading || paragraphs !== draft.overviewParagraphs.join('\n\n') || Object.keys(videoPatch).length > 0 || showcaseEdits.length > 0 || galleryChanged || videoChaptersChanged);
  const editable = draft?.status === 'draft' && draft?.canEdit !== false;

  async function apply(operation: 'narrative' | 'submit') {
    if (!draft || !editable || busy || (operation === 'submit' && dirty)) return;
    setBusy(true);
    setError('');
    setMessage('');
    const overviewParagraphs = paragraphs.split(/\n\s*\n/).map(value => value.trim()).filter(Boolean);
    try {
      const result = await draftRequest<{ revision: number; status?: Draft['status'] }>(user, operation, {
        auctionId,
        expectedRevision: draft.revision,
        ...(operation === 'narrative' ? { overviewHeading: heading, overviewParagraphs, ...videoPatch,
          ...(showcaseEdits.length ? { showcaseEdits } : {}),
          ...(galleryChanged ? { galleryOrder } : {}), ...(videoChaptersChanged ? { videoChapters } : {}) } : {})
      });
      if (operation === 'narrative') setParagraphs(overviewParagraphs.join('\n\n'));
      setDraft({
        ...draft,
        revision: result.revision,
        status: result.status ?? draft.status,
        ...(operation === 'narrative' ? { overviewHeading: heading, overviewParagraphs, ...videoPatch, showcaseChapters: chapters, assetIds: galleryOrder, videoChapters } : {})
      });
      setMessage(operation === 'submit' ? 'Listing submitted for review.' : 'Narrative saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The listing operation failed.');
    } finally {
      setBusy(false);
    }
  }

  async function updateMedia(action: 'preview' | 'remove' | 'assign', target: string, placement: 'hero' | 'gallery' = 'gallery', category = uploadCategory) {
    if (!draft || busy || (action !== 'preview' && !editable)) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (action === 'preview' && typeof target === 'string') {
        const response = await request(user, 'media', { action, auctionId, assetId: target });
        setPreview({ assetId: target, image: await readImage(await response.blob()) });
        return;
      }
      if (action === 'assign' && typeof target === 'string') {
        const result = await draftRequest<{ revision: number }>(user, 'media', {
          action, auctionId, assetId: target, expectedRevision: draft.revision, placement, category
        });
        setDraft({ ...draft, revision: result.revision, assets: draft.assets.map(asset => asset.id === target ? { ...asset, placement, category } : asset) });
        setMessage('Image placement saved.');
      } else if (action === 'remove' && typeof target === 'string') {
        const result = await draftRequest<{ revision: number }>(user, 'media', {
          action, auctionId, assetId: target, expectedRevision: draft.revision
        });
        setGalleryOrder(order => order.filter(id => id !== target));
        setDraft({ ...draft, revision: result.revision, assetIds: draft.assetIds.filter(id => id !== target), assets: draft.assets.filter(asset => asset.id !== target) });
        if (preview?.assetId === target) setPreview(null);
        setMessage('Image removed from the draft.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The media operation failed.');
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(files: File[], placement: 'hero' | 'gallery', category: string) {
    if (!draft || !editable || busy || uploadLock.current) return;
    uploadLock.current = true;
    setBusy(true); setError('');
    let current = draft;
    let uploaded = 0;
    const failures: string[] = [];
    try {
      for (const [index, file] of files.entries()) {
        setMessage(`Uploading photo ${index + 1} of ${files.length}…`);
        if (file.type !== 'image/jpeg' || file.size > 2 * 1024 * 1024) {
          failures.push(`${file.name}: choose a JPEG no larger than 2 MiB.`);
          continue;
        }
        try {
          const image = await readImage(file);
          const result = await draftRequest<{ assetId: string; revision: number }>(user, 'upload', {
            auctionId, expectedRevision: current.revision, jpegBase64: image.split(',')[1], placement, category
          });
          imageCache.current.set(result.assetId, image);
          current = { ...current, revision: result.revision, assetIds: [...current.assetIds, result.assetId],
            assets: [...current.assets, { id: result.assetId, placement, category }] };
          setDraft(current);
          setGalleryOrder(order => [...order, result.assetId]);
          uploaded++;
        } catch (error) {
          failures.push(`${file.name}: ${error instanceof Error ? error.message : 'Upload failed.'}`);
          // A lost response may have committed. Stop instead of reusing an uncertain revision.
          const remaining = files.length - index - 1;
          if (remaining) failures.push(`${remaining} remaining photo(s) were not attempted. Reload before retrying.`);
          break;
        }
      }
      setMessage(`${uploaded} of ${files.length} photos uploaded.`);
      setError(failures.join(' '));
    } finally { uploadLock.current = false; setBusy(false); }
  }

  async function moveImage(assetId: string, direction: number) {
    if (!draft || !editable || busy) return;
    const placement = draft.assets.find(asset => asset.id === assetId)?.placement;
    const group = draft.assetIds.filter(id => draft.assets.find(asset => asset.id === id)?.placement === placement);
    const position = group.indexOf(assetId);
    const other = group[position + direction];
    if (!other) return;
    const order = [...draft.assetIds];
    const a = order.indexOf(assetId), b = order.indexOf(other);
    [order[a], order[b]] = [order[b], order[a]];
    setBusy(true); setError('');
    try {
      const result = await draftRequest<{ revision: number }>(user, 'media', {
        action: 'reorder', auctionId, expectedRevision: draft.revision, assetIds: order
      });
      setDraft({ ...draft, revision: result.revision, assetIds: order });
      setGalleryOrder(order); setMessage('Photo order saved.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save photo order.'); }
    finally { setBusy(false); }
  }

  function privateCards(placement: 'hero' | 'gallery') {
    if (!draft) return null;
    const assets = draft.assetIds.map(id => draft.assets.find(asset => asset.id === id)).filter((asset): asset is DraftAsset => !!asset && asset.placement === placement);
    return <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-private-placement={placement}>
      {assets.filter(asset => placement === 'hero' || galleryFilter === 'all' || asset.category === galleryFilter).map(asset => <div key={asset.id} data-asset-id={asset.id} className="rounded-xl overflow-hidden border border-zinc-700 bg-zinc-950 text-zinc-100 text-xs">
        <button type="button" className="block w-full" disabled={busy} onClick={() => void updateMedia('preview', asset.id)} aria-label={`Preview ${imageLabel(asset.id)}`}>
          {imageViews.find(image => image.id === asset.id)?.url ? <img src={imageViews.find(image => image.id === asset.id)?.url} alt={`Private ${placement} photo`} className="w-full aspect-[4/3] object-cover" /> : <span>Loading photo…</span>}
        </button>
        <div className="p-2 space-y-2">
          <span>{placement === 'hero' ? 'Hero' : 'Gallery'} · {asset.category}</span>
          {editable && <>
            <select aria-label={`Placement for ${imageLabel(asset.id)}`} disabled={busy} value={placement} className="w-full rounded border border-zinc-700 bg-zinc-900 p-1" onChange={event => void updateMedia('assign', asset.id, event.target.value as 'hero' | 'gallery', asset.category)}><option value="hero">Hero</option><option value="gallery">Gallery</option></select>
            <select aria-label={`Category for ${imageLabel(asset.id)}`} disabled={busy} value={asset.category} className="w-full rounded border border-zinc-700 bg-zinc-900 p-1" onChange={event => void updateMedia('assign', asset.id, placement, event.target.value)}>{['exterior','interior','engine','underbody','documentation'].map(category => <option key={category}>{category}</option>)}</select>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy || assets[0]?.id === asset.id} onClick={() => void moveImage(asset.id, -1)}>Move up</button>
              <button type="button" disabled={busy || assets[assets.length - 1]?.id === asset.id} onClick={() => void moveImage(asset.id, 1)}>Move down</button>
              <button type="button" disabled={busy} onClick={() => void updateMedia('remove', asset.id)}>Remove</button>
            </div>
          </>}
        </div>
      </div>)}
    </div>;
  }

  if (mediaOnly) {
    const heroTarget = document.getElementById('private-hero-cards');
    const galleryTarget = document.getElementById('private-gallery-cards');
    return <div id="private-draft-images">
      <p className="text-xs text-zinc-400">Photos save privately until an administrator publishes the listing. Select multiple JPEG photos, up to 2 MiB each.</p>
      {error && <p role="alert" className="text-red-300">{error}</p>}
      {message && <p role="status" className="text-emerald-300">{message}</p>}
      {!draft && !error && <p>Loading photos…</p>}
      {draft && !editable && <p>Photos are read-only while the listing is under review.</p>}
      <input ref={imageInput} aria-label="Upload draft JPEG" className="hidden" type="file" multiple accept="image/jpeg" disabled={!editable || busy} onChange={event => {
        const files = Array.from(event.currentTarget.files ?? []) as File[];
        const placement = event.currentTarget.dataset.placement === 'hero' ? 'hero' : 'gallery';
        const category = event.currentTarget.dataset.category || 'exterior';
        event.currentTarget.value = '';
        if (files.length) void uploadFiles(files, placement, category);
      }} />
      {heroTarget && createPortal(privateCards('hero'), heroTarget)}
      {galleryTarget && createPortal(privateCards('gallery'), galleryTarget)}
      {preview && <div role="dialog" aria-modal="true" aria-label="Photo preview" className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-6" onClick={() => setPreview(null)}>
        <button type="button" className="text-white p-3" onClick={() => setPreview(null)}>Close preview</button>
        <img src={preview.image} alt="Private draft preview" className="max-h-[80vh] max-w-full object-contain" />
      </div>}
    </div>;
  }

  return (
    <div className={mediaOnly ? 'space-y-4 text-zinc-100' : 'mx-auto max-w-3xl space-y-5 p-6'}>
      {!mediaOnly && <button type="button" onClick={onBack}>Back to dashboard</button>}
      {error && <p role="alert" className="rounded-lg border border-red-500 bg-red-950 p-3 text-sm text-red-100">{error}</p>}
      {message && <p role="status" className="rounded-lg border border-emerald-600 bg-emerald-950 p-3 text-sm text-emerald-100">{message}</p>}
      {!draft && !error && <p>Loading listing…</p>}
      {draft && <>
        {!mediaOnly && <h1 className="text-2xl font-bold">{draft.title}</h1>}
        {!mediaOnly && draft.dealer && <section aria-label="Assigned dealer listing"><h2>Assigned dealer listing</h2><p>{draft.dealer.businessName} · {draft.dealer.city}, {draft.dealer.province} · Documentation fee: CAD $0</p><p>Dealer attribution, vehicle identity and financial fields are managed by administrators.</p></section>}
        {!editable && <p>{draft.canEdit === false ? 'This dealer listing is read-only because current verification or account links are unavailable. Contact an administrator.' : 'This listing is read-only while it is under review.'}</p>}
        {!mediaOnly && <fieldset disabled={!editable || busy} className="space-y-4">
          <label className="block">Overview heading
            <input className="block w-full rounded border p-2" maxLength={240}
              value={heading} onChange={event => setHeading(event.target.value)} />
          </label>
          <label className="block">Overview paragraphs
            <textarea className="block w-full rounded border p-2" rows={12}
              value={paragraphs} onChange={event => setParagraphs(event.target.value)} />
          </label>
          {videoFields.map(([key, label, maxLength]) => <label className="block" key={key}>{label}
            <input className="block w-full rounded border p-2" maxLength={maxLength}
              value={video[key]} onChange={event => setVideo({ ...video, [key]: event.target.value })} />
          </label>)}
          {chapters.map((chapter, index) => <fieldset key={chapter.id}>
            <legend>{chapter.title || 'Showcase chapter'}</legend>
            {chapter.customTitle && <label className="block">Custom chapter title
              <input className="block w-full rounded border p-2" maxLength={240} value={chapter.title}
                onChange={event => setChapters(chapters.map((item, position) =>
                  position === index ? { ...item, title: event.target.value } : item))} />
            </label>}
            <label className="block">Chapter photo
              <select value={chapter.photoAssetId ?? ''} onChange={event => setChapters(chapters.map((item, position) =>
                position === index ? { ...item, photoAssetId: event.target.value || null } : item))}>
                <option value="">No draft photo assigned</option>
                {galleryOrder.map(id => <option key={id} value={id}>{imageLabel(id)}</option>)}
              </select>
            </label>
            <label className="block">Highlights (one per line, up to 20)
              <textarea className="block w-full rounded border p-2" value={chapter.highlights.join('\n')}
                onChange={event => setChapters(chapters.map((item, position) =>
                  position === index ? { ...item, highlights: event.target.value ? event.target.value.split('\n') : [] } : item))} />
            </label>
            <label className="block">Subtitle
              <input className="block w-full rounded border p-2" maxLength={240} value={chapter.subtitle}
                onChange={event => setChapters(chapters.map((item, position) =>
                  position === index ? { ...item, subtitle: event.target.value } : item))} />
            </label>
            <label className="block">Narrative
              <textarea className="block w-full rounded border p-2" maxLength={4000} value={chapter.narrative}
                onChange={event => setChapters(chapters.map((item, position) =>
                  position === index ? { ...item, narrative: event.target.value } : item))} />
            </label>
          </fieldset>)}
          <section aria-label="Video chapters">
            {videoChapters.map((chapter, index) => <fieldset key={index}>
              <legend>Video chapter {index + 1}</legend>
              {(['title', 'description', 'videoUrl'] as const).map(key => <label className="block" key={key}>
                {key === 'videoUrl' ? 'YouTube video URL' : key === 'title' ? 'Video chapter title' : 'Description'}
                <input value={chapter[key]} onChange={event => setVideoChapters(videoChapters.map((item, position) =>
                  position === index ? { ...item, [key]: event.target.value } : item))} />
              </label>)}
              <button type="button" onClick={() => setVideoChapters(videoChapters.filter((_, position) => position !== index))}>Remove video chapter</button>
            </fieldset>)}
            <button type="button" disabled={videoChapters.length >= 20}
              onClick={() => setVideoChapters([...videoChapters, { title: '', description: '', videoUrl: '' }])}>Add video chapter</button>
          </section>
          <div className="flex gap-4">
            <button type="button" disabled={!dirty} onClick={() => void apply('narrative')}>Save narrative</button>
            <button type="button" disabled={dirty} onClick={() => void apply('submit')}>Submit for review</button>
          </div>
          {editable && dirty && <p>Save your changes before submitting for review.</p>}
        </fieldset>}
        <section className="space-y-4">
          <p>Photos save privately until an administrator publishes the listing. Select multiple JPEG photos, up to 2 MiB each.</p>
          <input ref={imageInput} aria-label="Upload draft JPEG" className="hidden" type="file" multiple accept="image/jpeg" disabled={!editable || busy} onChange={event => {
            const files = Array.from(event.currentTarget.files ?? []) as File[];
            const placement = event.currentTarget.dataset.placement === 'hero' ? 'hero' : 'gallery';
            event.currentTarget.value = '';
            if (files.length) void uploadFiles(files, placement, uploadCategory);
          }} />
          {(['hero', 'gallery'] as const).map(placement => <section key={placement} className="space-y-3">
            <h2 className="text-xl font-bold">{placement === 'hero' ? 'Hero Photos' : 'Gallery Photos'} ({draft.assets.filter(asset => asset.placement === placement).length})</h2>
            {editable && <div className="flex gap-3 items-center">
              <button type="button" disabled={busy} className="rounded-lg bg-red-700 px-4 py-2 text-white" onClick={() => {
                if (imageInput.current) { imageInput.current.dataset.placement = placement; imageInput.current.click(); }
              }}>{placement === 'hero' ? 'Upload Hero Photos' : 'Upload Gallery Photos'}</button>
              {placement === 'gallery' && <label>Category <select aria-label="New gallery photo category" value={uploadCategory} disabled={busy} onChange={event => setUploadCategory(event.target.value)}>{['exterior','interior','engine','underbody','documentation'].map(category => <option key={category}>{category}</option>)}</select></label>}
            </div>}
            {privateCards(placement)}
          </section>)}
          {preview && <div><button type="button" onClick={() => setPreview(null)}>Close preview</button><img src={preview.image} alt="Private draft preview" className="max-h-96 max-w-full" /></div>}
        </section>
      </>}
    </div>
  );
}
