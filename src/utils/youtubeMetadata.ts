import { extractYouTubeVideoId } from '../components/YouTubePlaylistSection';

export interface YouTubeMetadataResult {
  title: string;
  authorName?: string;
  thumbnailUrl: string;
  videoId: string;
  sourceUrl: string;
  duration?: string;
  description?: string;
  isExactDuration?: boolean;
}

/**
 * Converts ISO 8601 duration strings (e.g. "PT3M45S", "PT1H12M30S", "PT55S")
 * into human-readable digital clock format "MM:SS" or "HH:MM:SS".
 */
export function formatIsoDuration(isoDuration: string): string {
  if (!isoDuration || typeof isoDuration !== 'string') return '';
  
  const trimmed = isoDuration.trim();
  
  // If already in MM:SS or HH:MM:SS format
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!match) return '';

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  const formattedSeconds = seconds < 10 ? `0${seconds}` : `${seconds}`;

  if (hours > 0) {
    const formattedMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`;
    return `${hours}:${formattedMinutes}:${formattedSeconds}`;
  }

  const formattedMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${formattedMinutes}:${formattedSeconds}`;
}

/**
 * Parses seconds to "MM:SS" or "HH:MM:SS" format.
 */
export function formatSecondsToDuration(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds <= 0) return '00:00';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const secStr = seconds < 10 ? `0${seconds}` : `${seconds}`;
  if (hours > 0) {
    const minStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
    return `${hours}:${minStr}:${secStr}`;
  }
  const minStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${minStr}:${secStr}`;
}

/**
 * Fetch video metadata (title, author, thumbnail, duration, description) strictly
 * isolated for the provided YouTube URL / video ID.
 */
export async function fetchYouTubeMetadata(rawUrlOrId: string): Promise<YouTubeMetadataResult> {
  const trimmed = (rawUrlOrId || '').trim();
  if (!trimmed) {
    throw new Error('Please enter a YouTube video URL or Video ID first');
  }

  let videoId = '';
  let standardWatchUrl = '';

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    videoId = trimmed;
    standardWatchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  } else {
    videoId = extractYouTubeVideoId(trimmed);
    if (videoId) {
      standardWatchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    } else {
      standardWatchUrl = trimmed;
    }
  }

  const highResThumb = videoId
    ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    : '';
  const fallbackThumb = videoId
    ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    : '';

  let title = videoId ? `YouTube Video (${videoId})` : 'YouTube Video';
  let authorName = 'YouTube';
  let thumbnailUrl = fallbackThumb;
  let duration = '';
  let description = '';
  let isExactDuration = false;

  // Tier 1: YouTube official oEmbed endpoint (high reliability for title & author)
  try {
    const oembedEndpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(standardWatchUrl)}&format=json`;
    const response = await fetch(oembedEndpoint);

    if (response.ok) {
      const data = await response.json();
      if (data.title) title = data.title;
      if (data.author_name) authorName = data.author_name;
      if (data.thumbnail_url) thumbnailUrl = data.thumbnail_url;
    }
  } catch (err) {
    console.warn('YouTube oEmbed fetch warning:', err);
  }

  // Tier 2: Public Noembed fallback
  try {
    const noembedEndpoint = `https://noembed.com/embed?url=${encodeURIComponent(standardWatchUrl)}`;
    const noembedRes = await fetch(noembedEndpoint);
    if (noembedRes.ok) {
      const noembedData = await noembedRes.json();
      if (!title || title.startsWith('YouTube Video')) {
        if (noembedData.title) title = noembedData.title;
      }
      if (noembedData.author_name) authorName = noembedData.author_name;
    }
  } catch {
    // Silent fallback
  }

  // Tier 3: Fetch YouTube page metadata via CORS proxy to parse exact duration and description tags
  if (videoId) {
    const proxyUrls = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`,
      `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`
    ];

    for (const pUrl of proxyUrls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const htmlRes = await fetch(pUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (htmlRes.ok) {
          const html = await htmlRes.text();
          
          // 1. Duration extraction (itemprop="duration" content="PT3M45S" or "approxDurationMs":"225000")
          const durationMatch = html.match(/itemprop="duration"\s+content="([^"]+)"/i) 
            || html.match(/"duration":\s*"([^"]+)"/i);
          if (durationMatch && durationMatch[1]) {
            const parsed = formatIsoDuration(durationMatch[1]);
            if (parsed) {
              duration = parsed;
              isExactDuration = true;
            }
          } else {
            const lengthSecMatch = html.match(/"lengthSeconds":\s*"(\d+)"/i) 
              || html.match(/"approxDurationMs":\s*"(\d+)"/i);
            if (lengthSecMatch && lengthSecMatch[1]) {
              const val = parseInt(lengthSecMatch[1], 10);
              const sec = val > 10000 ? Math.round(val / 1000) : val;
              duration = formatSecondsToDuration(sec);
              isExactDuration = true;
            }
          }

          // 2. Description extraction (og:description or name="description")
          const descMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/i)
            || html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)
            || html.match(/"shortDescription":\s*"([^"]*)"/i);
          
          if (descMatch && descMatch[1]) {
            let cleanDesc = descMatch[1]
              .replace(/\\n/g, ' ')
              .replace(/&#39;/g, "'")
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
              .trim();
            if (cleanDesc.length > 280) {
              cleanDesc = cleanDesc.substring(0, 277) + '...';
            }
            if (cleanDesc) {
              description = cleanDesc;
            }
          }

          // If title was still placeholder
          const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i);
          if (titleMatch && titleMatch[1] && (!title || title.startsWith('YouTube Video'))) {
            title = titleMatch[1]
              .replace(/&#39;/g, "'")
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
              .trim();
          }

          if (duration || description) {
            break; // found rich metadata
          }
        }
      } catch {
        // Fall through to next proxy or fallback
      }
    }
  }

  // Tier 4: Invidious API fallback if still missing
  if (videoId && (!duration || !description)) {
    const instances = [
      `https://api.invidious.io/api/v1/videos/${videoId}`,
      `https://inv.tux.pizza/api/v1/videos/${videoId}`,
      `https://vid.puffyan.us/api/v1/videos/${videoId}`
    ];

    for (const endpoint of instances) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(endpoint, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const vData = await res.json();
          if (!duration && vData.lengthSeconds) {
            duration = formatSecondsToDuration(parseInt(vData.lengthSeconds, 10));
            isExactDuration = true;
          }
          if (!description && vData.description) {
            const firstPart = vData.description.split('\n\n')[0] || vData.description;
            description = firstPart.length > 280 ? firstPart.substring(0, 277) + '...' : firstPart;
          }
          break;
        }
      } catch {
        // Fall through
      }
    }
  }

  // Generate clean default description only if nothing was found
  if (!description) {
    description = `HD video footage: ${title}. High-fidelity engine acoustics, exterior walkaround, and operational inspection.`;
  }

  return {
    title,
    authorName,
    thumbnailUrl: thumbnailUrl || highResThumb || fallbackThumb,
    videoId,
    sourceUrl: standardWatchUrl,
    duration,
    description,
    isExactDuration
  };
}
