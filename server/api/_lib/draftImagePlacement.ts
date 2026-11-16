import { chapterToSection } from '../../../src/utils/showcaseConverter.js';
export const draftImageCategories = ['exterior', 'interior', 'engine', 'underbody', 'documentation'] as const;
export function parseImagePlacement(input: Record<string, unknown>) {
  const placement = input.placement ?? 'gallery';
  const category = input.category ?? 'exterior';
  return ['hero', 'gallery'].includes(String(placement)) && draftImageCategories.includes(category as any)
    ? { placement: placement as 'hero' | 'gallery', category: category as string } : null;
}

/** Merge only server-owned published URLs; private object paths never enter public media. */
export function applyPublishedDraftImages(config: Record<string, any>, assets: Array<Record<string, any>>) {
  const active = assets.filter(asset => asset.removedAt === null && typeof asset.publishedUrl === 'string');
  const order = Array.isArray(config.sellerDraftGalleryOrder) ? config.sellerDraftGalleryOrder : [];
  active.sort((a, b) => {
    const index = (id: string) => order.includes(id) ? order.indexOf(id) : order.length;
    return index(a.id) - index(b.id) || Number(a.createdAt) - Number(b.createdAt);
  });
  const urls = new Set([...(config.draftPublishedUrls ?? []), ...active.flatMap(asset => [asset.publishedUrl, asset.previousPublishedUrl].filter(Boolean))]);
  const heroImages = [...(config.heroImages ?? []).filter((url: string) => !urls.has(url)),
    ...active.filter(asset => asset.placement === 'hero').map(asset => asset.publishedUrl)];
  const fullGallery = [...(config.fullGallery ?? []).filter((item: any) => !urls.has(item.url)),
    ...active.filter(asset => asset.placement !== 'hero').map(asset => ({ id: asset.id, url: asset.publishedUrl,
      category: asset.category || 'exterior', title: 'Vehicle photo', isPdf: false }))];
  const showcaseChapters = (config.showcaseChapters ?? []).map((chapter: any) => {
    const asset = active.find(asset => asset.id === chapter.photoAssetId);
    return asset ? { ...chapter, photoUrl: asset.publishedUrl } : chapter;
  });
  return { ...config, heroImages, fullGallery, showcaseChapters, ...(showcaseChapters.length ? { inlineShowcase: showcaseChapters.map(chapterToSection) } : {}), draftPublishedUrls: active.map(asset => asset.publishedUrl) };
}
