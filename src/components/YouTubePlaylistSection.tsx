import React, { useState, useEffect } from 'react';
import { Play, Film, Volume2, ExternalLink, CheckCircle2, ListVideo, Sparkles } from 'lucide-react';
import { VideoChapter } from '../types';

export function extractYouTubeVideoId(urlOrId?: string): string {
  if (!urlOrId) return '';
  const trimmed = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.includes('watch?v=')) {
    return trimmed.split('watch?v=')[1]?.split('&')[0] || '';
  }
  if (trimmed.includes('youtu.be/')) {
    return trimmed.split('youtu.be/')[1]?.split('?')[0]?.split('&')[0] || '';
  }
  if (trimmed.includes('/embed/')) {
    const after = trimmed.split('/embed/')[1] || '';
    if (!after.startsWith('videoseries')) {
      return after.split('?')[0]?.split('&')[0] || '';
    }
  }
  if (trimmed.includes('/v/')) {
    return trimmed.split('/v/')[1]?.split('?')[0]?.split('&')[0] || '';
  }
  if (trimmed.includes('/shorts/')) {
    return trimmed.split('/shorts/')[1]?.split('?')[0]?.split('&')[0] || '';
  }
  return '';
}

export function extractYouTubePlaylistId(url?: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.includes('list=')) {
    return trimmed.split('list=')[1]?.split('&')[0] || '';
  }
  return '';
}

interface YouTubePlaylistSectionProps {
  playlistUrl: string;
  videoTitle?: string;
  videoSubtitle?: string;
  chapters?: VideoChapter[];
}

export const YouTubePlaylistSection: React.FC<YouTubePlaylistSectionProps> = ({
  playlistUrl,
  videoTitle = "Cold Start, Driving Footage & 360 Walkaround",
  videoSubtitle = "Complete high-definition video playlist showcasing the air-cooled flat-six acoustics, 915 gearbox operation, and exterior walkaround.",
  chapters
}) => {
  const defaultChapters: VideoChapter[] = [
    {
      id: "vid-1",
      title: "1. Cold Start & 3.0L CIS Idle",
      description: "Cold engine start showing immediate oil pressure rise, smooth CIS idle warm-up, and Dansk exhaust note.",
      videoUrl: "https://www.youtube.com/watch?v=v9qF5yQfW9g",
      duration: "03:45"
    },
    {
      id: "vid-2",
      title: "2. In-Cabin Driving & 915 Shifts",
      description: "Spirited road run demonstrating crisp 1st-through-5th gear shifts, Bilstein damping, and brake firmness.",
      videoUrl: "https://www.youtube.com/watch?v=eXb28X4vFv4",
      duration: "06:12"
    },
    {
      id: "vid-3",
      title: "3. 360° Exterior Walkaround & Gaps",
      description: "Detailed 360-degree exterior walkaround highlighting Whale Tail aerodynamics, paint depth, and panel gaps.",
      videoUrl: "https://www.youtube.com/watch?v=7VvQO2s9K30",
      duration: "04:30"
    },
    {
      id: "vid-4",
      title: "4. Underside & Chassis Lift Inspection",
      description: "Underbody hoist inspection displaying rust-free floor pans, SSI heat exchangers, and leak-free transaxle case.",
      videoUrl: "https://www.youtube.com/watch?v=8A8c_N7jMvY",
      duration: "05:18"
    },
    {
      id: "vid-5",
      title: "5. Acceleration Acoustics & Flybys",
      description: "External drive-by acoustic capture illustrating the mechanical rasp of the air-cooled flat-six under full throttle.",
      videoUrl: "https://www.youtube.com/watch?v=yq4J1vV8v3E",
      duration: "02:50"
    },
    {
      id: "vid-6",
      title: "6. Cabin Switchgear & Sunroof Demo",
      description: "Full demonstration of electric sunroof, VDO gauges, PCCM audio, power windows, and heating controls.",
      videoUrl: "https://www.youtube.com/watch?v=kYjXk8P3i4c",
      duration: "03:15"
    }
  ];

  const activeChapters = chapters && chapters.length > 0 ? chapters : defaultChapters;
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [hasUserInteracted, setHasUserInteracted] = useState<boolean>(false);

  // Helper to format clean embed URL prioritizing specific video IDs
  const formatEmbedUrl = (targetChapter?: VideoChapter, index: number = 0, isUserClick: boolean = false): string => {
    const autoplayFlag = isUserClick ? 'autoplay=1' : 'autoplay=0';
    
    // 1. Check chapter specific video URL / ID first
    const chapterVideoId = extractYouTubeVideoId(targetChapter?.videoUrl);
    if (chapterVideoId) {
      return `https://www.youtube.com/embed/${chapterVideoId}?${autoplayFlag}&rel=0&enablejsapi=1&modestbranding=1`;
    }

    // 2. Check if the playlistUrl has a video ID
    const masterVideoId = extractYouTubeVideoId(playlistUrl);
    const masterPlaylistId = extractYouTubePlaylistId(playlistUrl);

    if (masterVideoId) {
      if (masterPlaylistId) {
        return `https://www.youtube.com/embed/${masterVideoId}?list=${masterPlaylistId}&index=${index}&${autoplayFlag}&rel=0&enablejsapi=1`;
      }
      return `https://www.youtube.com/embed/${masterVideoId}?${autoplayFlag}&rel=0&enablejsapi=1`;
    }

    // 3. Check if list ID exists
    if (masterPlaylistId) {
      return `https://www.youtube.com/embed/videoseries?list=${masterPlaylistId}&index=${index}&${autoplayFlag}&rel=0&enablejsapi=1`;
    }

    if (targetChapter?.videoUrl && targetChapter.videoUrl.startsWith('http')) {
      return targetChapter.videoUrl;
    }

    if (playlistUrl && playlistUrl.startsWith('http')) {
      return playlistUrl;
    }

    return 'https://www.youtube.com/embed/v9qF5yQfW9g?autoplay=0&rel=0';
  };

  const [activeIframeSrc, setActiveIframeSrc] = useState<string>(() => {
    const initialChapter = (chapters && chapters.length > 0) ? chapters[0] : defaultChapters[0];
    return formatEmbedUrl(initialChapter, 0, false);
  });

  // Synchronize player when component mounts or active chapter changes
  useEffect(() => {
    const targetChap = activeChapters[selectedIndex] || activeChapters[0];
    const src = formatEmbedUrl(targetChap, selectedIndex, hasUserInteracted);
    setActiveIframeSrc(src);
  }, [selectedIndex, playlistUrl, chapters]);

  const handleSelectVideo = (idx: number) => {
    setSelectedIndex(idx);
    setHasUserInteracted(true);
    const targetChapter = activeChapters[idx];
    const newSrc = formatEmbedUrl(targetChapter, idx, true);
    setActiveIframeSrc(newSrc);
  };

  const selectedChapter = activeChapters[selectedIndex] || activeChapters[0];

  return (
    <section id="videos" className="bg-white rounded-xl border border-zinc-200/90 shadow-sm overflow-hidden scroll-mt-24">
      {/* Header */}
      <div className="p-6 sm:p-8 border-b border-zinc-100 bg-zinc-50/50 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest font-bold text-red-700 mb-1 flex items-center gap-1.5">
            <Film className="w-3.5 h-3.5" />
            <span>Video Documentation Series</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight font-serif">
            {videoTitle}
          </h2>
          <p className="text-sm text-zinc-600 mt-1">
            {videoSubtitle}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 border border-zinc-200 text-xs font-semibold text-zinc-600">
            <ListVideo className="w-4 h-4 text-zinc-700" />
            <span>{activeChapters.length} Total Videos</span>
          </div>

          <a
            href={playlistUrl.includes('playlist?list=') ? playlistUrl.replace('/embed/videoseries', '/playlist') : playlistUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
          >
            <span>Open on YouTube</span>
            <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
          </a>
        </div>
      </div>

      {/* Embedded Iframe Container */}
      <div className="p-4 sm:p-8 space-y-6">
        <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black shadow-lg border border-zinc-300">
          {activeIframeSrc ? (
            <iframe
              key={activeIframeSrc}
              src={activeIframeSrc}
              title={selectedChapter?.title || "Vehicle Video Series"}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : null}
        </div>

        {/* Selected Video Status Bar */}
        <div className="flex items-center justify-between bg-zinc-100/80 px-4 py-2.5 rounded-lg border border-zinc-200 text-xs">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span>
            </span>
            <span className="font-bold text-zinc-800">
              Active Video: <span className="text-red-700">{selectedChapter?.title || `Video ${selectedIndex + 1}`}</span>
            </span>
          </div>

          <span className="text-zinc-500 text-[11px] font-medium hidden sm:inline">
            Click any chapter below to switch and play that specific video
          </span>
        </div>

        {/* Full Dynamic Playlist / Chapter Switcher List */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs uppercase tracking-wider font-bold text-zinc-700 flex items-center gap-1.5">
              <ListVideo className="w-4 h-4 text-red-600" />
              <span>Full Video Playlist & Chapters ({activeChapters.length})</span>
            </h3>
            <span className="text-xs text-zinc-500">
              Select chapter to load footage
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 max-h-[600px] overflow-y-auto pr-1">
            {activeChapters.map((ch, idx) => {
              const isSelected = selectedIndex === idx;
              const videoId = extractYouTubeVideoId(ch.videoUrl);
              const thumb = ch.thumbnailUrl || (videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null);

              return (
                <button
                  type="button"
                  key={ch.id || idx}
                  onClick={() => handleSelectVideo(idx)}
                  className={`text-left p-3 sm:p-3.5 rounded-xl border transition-all flex flex-col justify-between group ${
                    isSelected
                      ? 'bg-zinc-900 text-white border-zinc-900 shadow-md ring-2 ring-red-600'
                      : 'bg-zinc-50 hover:bg-white text-zinc-800 border-zinc-200 hover:border-zinc-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex flex-col gap-2 w-full">
                    {/* Chapter Video Thumbnail */}
                    {thumb && (
                      <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black border border-zinc-700/40 flex-shrink-0">
                        <img
                          src={thumb}
                          alt={ch.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          referrerPolicy="no-referrer"
                        />
                        {ch.duration && (
                          <span className="absolute bottom-1.5 right-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/80 text-white font-bold">
                            {ch.duration}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Chapter Info Header: Number, Title, Duration */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1.5">
                      <div className="flex items-start gap-1.5 min-w-0">
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5 ${
                            isSelected
                              ? 'bg-red-600 text-white'
                              : 'bg-zinc-200 group-hover:bg-red-100 group-hover:text-red-700 text-zinc-700'
                          }`}
                        >
                          {isSelected ? <Play className="w-2.5 h-2.5 fill-current" /> : (idx + 1)}
                        </div>
                        <span className={`font-bold text-xs line-clamp-2 ${isSelected ? 'text-white' : 'text-zinc-900 group-hover:text-red-700'}`}>
                          {ch.title}
                        </span>
                      </div>

                      {!thumb && ch.duration && (
                        <span className={`self-start sm:self-auto text-[10px] font-mono px-1.5 py-0.5 rounded flex-shrink-0 ${
                          isSelected ? 'bg-zinc-800 text-zinc-300' : 'bg-zinc-200/70 text-zinc-600'
                        }`}>
                          {ch.duration}
                        </span>
                      )}
                    </div>

                    {ch.description && (
                      <p className={`text-[11px] leading-relaxed line-clamp-2 ${
                        isSelected ? 'text-zinc-300' : 'text-zinc-600'
                      }`}>
                        {ch.description}
                      </p>
                    )}
                  </div>

                  {/* Status Strip: Stacks vertically on narrow frames */}
                  <div className={`mt-3 pt-2 border-t border-dashed flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 text-[10px] font-semibold w-full ${
                    isSelected ? 'border-zinc-700 text-red-400' : 'border-zinc-200 text-zinc-400 group-hover:text-zinc-600'
                  }`}>
                    <span className={`inline-flex items-center gap-1 ${isSelected ? 'font-bold' : ''}`}>
                      {isSelected ? '● Currently Playing' : '▶ Click to play'}
                    </span>
                    <span className="font-mono text-[10px] opacity-75">
                      {videoId ? `ID: ${videoId}` : `#0${idx + 1}`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

