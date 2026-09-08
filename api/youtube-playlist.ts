export interface ExtractedVideoChapter {
  id: string;
  title: string;
  description: string;
  videoUrl: string;
  thumbnailUrl?: string;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/'/g, "'");
}

function extractPlaylistId(rawInput?: string | string[]): string | null {
  if (!rawInput) return null;
  const input = Array.isArray(rawInput) ? rawInput[0] : rawInput;
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();
  const listMatch = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (listMatch && listMatch[1]) {
    return listMatch[1];
  }

  // Alphanumeric, underscores, hyphens (typical YouTube playlist IDs e.g. PL..., UU..., FL...)
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function sendJson(res: any, status: number, data: any) {
  if (res.setHeader) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(data);
  }

  res.statusCode = status;
  res.end(JSON.stringify(data));
}

export default async function handler(req: any, res: any) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    if (res.setHeader) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (typeof res.status === 'function') {
      return res.status(200).end();
    }
    res.statusCode = 200;
    return res.end();
  }

  if (req.method && req.method !== 'GET') {
    return sendJson(res, 405, { success: false, error: 'Method not allowed' });
  }

  // Extract query params from req.query or parse from req.url
  let queryPlaylistId = req.query?.playlistId;
  let queryUrl = req.query?.url;

  if (!queryPlaylistId && !queryUrl && req.url) {
    try {
      const parsedUrl = new URL(req.url, `http://${req.headers?.host || 'localhost'}`);
      queryPlaylistId = parsedUrl.searchParams.get('playlistId') || undefined;
      queryUrl = parsedUrl.searchParams.get('url') || undefined;
    } catch {
      // Ignore URL parsing errors
    }
  }

  const playlistId = extractPlaylistId(queryPlaylistId) || extractPlaylistId(queryUrl);

  if (!playlistId) {
    return sendJson(res, 400, {
      success: false,
      error: 'Missing or invalid playlistId'
    });
  }

  const feedUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(playlistId)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  let response: Response;
  try {
    response = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/xml, text/xml, */*'
      }
    });
  } catch (fetchErr: any) {
    clearTimeout(timeoutId);
    if (fetchErr?.name === 'AbortError') {
      return sendJson(res, 504, {
        success: false,
        error: 'Request timed out fetching YouTube playlist'
      });
    }
    return sendJson(res, 500, {
      success: false,
      error: `Failed to fetch YouTube playlist: ${fetchErr?.message || 'Network error'}`
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const status = response.status === 404 ? 404 : 500;
    return sendJson(res, status, {
      success: false,
      error: response.status === 404
        ? 'YouTube playlist not found or private'
        : `YouTube returned status ${response.status}`
    });
  }

  try {
    const xmlText = await response.text();

    const entryRegex = /<entry[\s\S]*?<\/entry>/gi;
    const entries = xmlText.match(entryRegex) || [];

    const videos: ExtractedVideoChapter[] = [];

    for (let index = 0; index < entries.length; index++) {
      const entryXml = entries[index];

      // Extract video ID
      const vIdMatch = entryXml.match(/<yt:videoId>([^<]+)<\/yt:videoId>/i)
        || entryXml.match(/<id>yt:video:([^<]+)<\/id>/i);
      const videoId = vIdMatch ? vIdMatch[1].trim() : '';
      if (!videoId) continue;

      // Extract Title
      const tMatch = entryXml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const rawTitle = tMatch ? decodeXmlEntities(tMatch[1].trim()) : `Video Chapter ${index + 1}`;

      // Extract Thumbnail
      const thumbMatch = entryXml.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
      const thumbnailUrl = thumbMatch ? thumbMatch[1].trim() : `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

      // Extract Description
      const descMatch = entryXml.match(/<media:description[^>]*>([\s\S]*?)<\/media:description>/i);
      const description = descMatch ? decodeXmlEntities(descMatch[1].trim()) : 'Imported from YouTube Playlist';

      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      videos.push({
        id: `chap-${Date.now()}-${index}`,
        title: rawTitle,
        description,
        videoUrl,
        thumbnailUrl
      });
    }

    return sendJson(res, 200, {
      success: true,
      count: videos.length,
      videos
    });
  } catch (parseErr: any) {
    return sendJson(res, 500, {
      success: false,
      error: `Error parsing YouTube feed: ${parseErr?.message || 'Unknown error'}`
    });
  }
}
