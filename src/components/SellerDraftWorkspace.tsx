import React, { useEffect, useState, useRef } from 'react';
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

export function SellerDraftWorkspace({ auctionId, user, onBack, mediaOnly = false, onImagesChanged }: {
  auctionId: string;
  mediaOnly?: boolean;
  onImagesChanged?: (images: DraftImageView[]) => void;
  user: User;
  onBack: () => void;
  // React consumes this JSX attribute when remounting the workspace.
  key?: string;
}) {
  const [uploadPlacement, setUploadPlacement] = useState<'hero' | 'gallery'>('gallery');
  const [uploadCategory, setUploadCategory] = useState('exterior');
  const imageCache = useRef(new Map<string, string>());
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
    if (!onImagesChanged) return;
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
      if (!controller.signal.aborted) onImagesChanged(views);
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

  async function updateMedia(action: 'upload' | 'preview' | 'remove' | 'assign', target: File | string, placement = uploadPlacement, category = uploadCategory) {
    if (!draft || busy || (action !== 'preview' && !editable)) return;
    setBusy(true);
    setError('');
    setMessage(action === 'upload' ? 'Uploading private draft image…' : '');
    try {
      if (action === 'preview' && typeof target === 'string') {
        const response = await request(user, 'media', { action, auctionId, assetId: target });
        setPreview({ assetId: target, image: await readImage(await response.blob()) });
        return;
      }
      if (action === 'upload' && target instanceof File) {
        if (target.type !== 'image/jpeg' || target.size > 2 * 1024 * 1024) {
          throw new Error('Choose a JPEG image no larger than 2 MiB.');
        }
        const image = await readImage(target);
        const result = await draftRequest<{ assetId: string; revision: number }>(user, 'upload', {
          auctionId, expectedRevision: draft.revision, jpegBase64: image.split(',')[1], placement, category
        });
        setGalleryOrder(order => [...order, result.assetId]);
        setDraft({ ...draft, revision: result.revision, assetIds: [...draft.assetIds, result.assetId], assets: [...draft.assets, { id: result.assetId, placement, category }] });
        setMessage('Image uploaded.');
      } else if (action === 'assign' && typeof target === 'string') {
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
        <section aria-labelledby="draft-media-heading" className="space-y-3">
          <h2 id="draft-media-heading" className="text-xl font-bold">Draft images ({galleryOrder.length})</h2>
          <p className="text-sm text-zinc-400">Photos and placement save immediately to this private draft. They become public only when an administrator publishes the listing.</p>
          {editable && <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={busy} onClick={() => { if (imageInput.current) { delete imageInput.current.dataset.placement; delete imageInput.current.dataset.category; imageInput.current.click(); } }}
              className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 disabled:opacity-50">
              {busy ? 'Working…' : 'Upload draft photos'}
            </button>
            <label>Placement <select aria-label="New draft image placement" value={uploadPlacement} disabled={busy} onChange={event => setUploadPlacement(event.target.value as 'hero' | 'gallery')} className="rounded border bg-zinc-900 p-2 text-white"><option value="hero">Hero</option><option value="gallery">Gallery</option></select></label>
            <label>Category <select aria-label="New draft image category" value={uploadCategory} disabled={busy} onChange={event => setUploadCategory(event.target.value)} className="rounded border bg-zinc-900 p-2 text-white">{['exterior','interior','engine','underbody','documentation'].map(category => <option key={category}>{category}</option>)}</select></label>
            <span className="text-sm text-zinc-400">JPEG · up to 2 MiB per photo</span>
            <input ref={imageInput} aria-label="Upload draft JPEG" className="hidden" type="file" accept="image/jpeg" disabled={busy} onChange={event => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void updateMedia('upload', file, event.currentTarget.dataset.placement === 'hero' ? 'hero' : event.currentTarget.dataset.placement === 'gallery' ? 'gallery' : uploadPlacement, event.currentTarget.dataset.category || uploadCategory);
            }} />
          </div>}
          <ul className="space-y-2">
            {galleryOrder.map((assetId, index) => <li key={assetId} className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-100">
              <span>{index + 1}. {imageLabel(assetId)}</span>
              <span>{draft.assets.find(asset => asset.id === assetId)?.placement === 'hero' ? 'Hero' : 'Gallery'} · {draft.assets.find(asset => asset.id === assetId)?.category}</span>
              {editable && <select aria-label={`Placement for ${imageLabel(assetId)}`} disabled={busy} className="rounded border bg-zinc-900 p-2 text-white"
                value={draft.assets.find(asset => asset.id === assetId)?.placement || 'gallery'}
                onChange={event => void updateMedia('assign', assetId, event.target.value as 'hero' | 'gallery', draft.assets.find(asset => asset.id === assetId)?.category || 'exterior')}>
                <option value="hero">Hero</option><option value="gallery">Gallery</option>
              </select>}
              {editable && <select aria-label={`Category for ${imageLabel(assetId)}`} disabled={busy} className="rounded border bg-zinc-900 p-2 text-white"
                value={draft.assets.find(asset => asset.id === assetId)?.category || 'exterior'}
                onChange={event => void updateMedia('assign', assetId, draft.assets.find(asset => asset.id === assetId)?.placement || 'gallery', event.target.value)}>
                {['exterior','interior','engine','underbody','documentation'].map(category => <option key={category}>{category}</option>)}
              </select>}
              <button className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-amber-400 disabled:opacity-50" type="button" disabled={busy} onClick={() => void updateMedia('preview', assetId)}>Preview</button>
              {editable && <>
                {!mediaOnly && <button className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-amber-400 disabled:opacity-50" type="button" disabled={busy || index === 0} onClick={() => {
                  const next = [...galleryOrder];
                  [next[index - 1], next[index]] = [next[index], next[index - 1]];
                  setGalleryOrder(next);
                  setMessage(`${imageLabel(assetId)} moved to position ${index}. Save narrative to keep this order.`);
                }}>Move up</button>}
                <button className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-amber-400 disabled:opacity-50" type="button" disabled={busy} onClick={() => void updateMedia('remove', assetId)}>Remove</button>
              </>}
            </li>)}
          </ul>
          {preview && <div>
            <button className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-amber-400 disabled:opacity-50" type="button" onClick={() => setPreview(null)}>Close preview</button>
            <img src={preview.image} alt="Private draft preview" className="mt-3 max-h-96 max-w-full rounded-lg border border-zinc-700" />
          </div>}
        </section>
      </>}
    </div>
  );
}
