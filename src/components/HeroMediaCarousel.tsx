import React, { useState, useEffect } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Maximize2, 
  Play, 
  Image as ImageIcon,
  Camera,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';

interface HeroMediaCarouselProps {
  images: string[];
  onOpenLightbox?: (index: number) => void;
  onScrollToVideo: () => void;
  onScrollToGallery: () => void;
}

export const HeroMediaCarousel: React.FC<HeroMediaCarouselProps> = ({
  images,
  onOpenLightbox,
  onScrollToVideo,
  onScrollToGallery
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isLightboxZoomed, setIsLightboxZoomed] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const validImages = (images || []).filter(img => Boolean(img && typeof img === 'string' && img.trim() !== ''));

  // Keyboard navigation for hero lightbox
  useEffect(() => {
    if (!isLightboxOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsLightboxOpen(false);
      } else if (e.key === 'ArrowRight' && validImages.length > 0) {
        setLightboxIndex((prev) => (prev + 1) % validImages.length);
      } else if (e.key === 'ArrowLeft' && validImages.length > 0) {
        setLightboxIndex((prev) => (prev - 1 + validImages.length) % validImages.length);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLightboxOpen, validImages.length]);

  if (validImages.length === 0) {
    return (
      <section className="bg-zinc-950 text-white border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="relative aspect-[16/10] sm:aspect-[16/9] lg:aspect-[21/10] w-full rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 flex flex-col items-center justify-center p-6 text-center select-none">
            <div className="w-16 h-16 rounded-2xl bg-zinc-800/80 border border-zinc-700/80 flex items-center justify-center mb-4 text-zinc-400">
              <Camera className="w-8 h-8 text-zinc-400" />
            </div>
            <h3 className="text-xl font-bold text-zinc-200 mb-1 font-serif tracking-wide">
              Media Pending
            </h3>
            <p className="text-sm text-zinc-400 max-w-sm">
              Photo gallery currently being curated
            </p>
          </div>
        </div>
      </section>
    );
  }

  const safeImages = validImages;
  const safeIndex = currentIndex >= safeImages.length ? 0 : currentIndex;
  const currentImage = safeImages[safeIndex];

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev === 0 ? safeImages.length - 1 : prev - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev === safeImages.length - 1 ? 0 : prev + 1));
  };

  const openHeroLightbox = (index: number) => {
    setLightboxIndex(index);
    setIsLightboxZoomed(false);
    setIsLightboxOpen(true);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    if (diff > 50 && safeImages.length > 0) {
      setLightboxIndex((prev) => (prev + 1) % safeImages.length);
    } else if (diff < -50 && safeImages.length > 0) {
      setLightboxIndex((prev) => (prev - 1 + safeImages.length) % safeImages.length);
    }
    setTouchStartX(null);
  };

  return (
    <section className="bg-zinc-950 text-white border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* Main Hero Viewer Container */}
        <div 
          onClick={() => openHeroLightbox(safeIndex)}
          className="relative aspect-[16/10] sm:aspect-[16/9] lg:aspect-[21/10] w-full rounded-xl overflow-hidden cursor-pointer group bg-zinc-900 border border-zinc-800 select-none"
        >
          {/* Main Showcase Image */}
          {currentImage ? (
            <img
              src={currentImage}
              alt={`Porsche 911 Whale Tail Photo ${safeIndex + 1}`}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.01]"
              referrerPolicy="no-referrer"
            />
          ) : null}

          {/* Vignette Gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

          {/* Navigation Arrows (Hidden if <= 1 photo) */}
          {safeImages.length > 1 && (
            <>
              <button
                onClick={handlePrev}
                className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-sm border border-white/20 transition-all opacity-80 group-hover:opacity-100 hover:scale-105"
                aria-label="Previous Photo"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={handleNext}
                className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-sm border border-white/20 transition-all opacity-80 group-hover:opacity-100 hover:scale-105"
                aria-label="Next Photo"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          {/* Top Info overlay (Hidden if <= 1 photo) */}
          {safeImages.length > 1 && (
            <div className="absolute top-4 left-4 flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-black/70 backdrop-blur-md text-xs font-semibold text-zinc-200 border border-white/10 flex items-center gap-1.5 shadow-sm">
                <Camera className="w-3.5 h-3.5 text-zinc-300" />
                <span>{safeIndex + 1} of {safeImages.length} Featured</span>
              </span>
            </div>
          )}

          {/* Bottom Action bar overlay */}
          <div className="absolute bottom-3 sm:bottom-4 left-3 sm:left-4 right-3 sm:right-4 flex items-center justify-between gap-2 pointer-events-none">
            <div className="hidden sm:flex items-center gap-2 pointer-events-auto">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openHeroLightbox(safeIndex);
                }}
                className="px-3.5 py-2 rounded-lg bg-black/75 hover:bg-black text-white text-xs font-bold backdrop-blur-md border border-white/20 flex items-center justify-center gap-1.5 transition-all hover:scale-105"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Fullscreen Lightbox</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onScrollToVideo();
                }}
                className="px-3.5 py-2 rounded-lg bg-red-700/90 hover:bg-red-700 text-white text-xs font-bold backdrop-blur-md border border-red-500/40 flex items-center justify-center gap-1.5 transition-all hover:scale-105"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Watch Video Playlist</span>
              </button>
            </div>

            <div className="hidden sm:block pointer-events-auto">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onScrollToGallery();
                }}
                className="px-3.5 py-2 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold backdrop-blur-md border border-zinc-700 flex items-center justify-center gap-1.5 transition-all"
              >
                <ImageIcon className="w-3.5 h-3.5 text-zinc-400" />
                <span>Browse Full Gallery ({safeImages.length})</span>
              </button>
            </div>
          </div>
        </div>

        {/* Thumbnail Filmstrip (Hidden if <= 1 photo) */}
        {safeImages.length > 1 && (
          <div className="flex items-center gap-2.5 mt-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
            {safeImages.map((img, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`relative flex-shrink-0 w-20 sm:w-28 aspect-[16/10] rounded-lg overflow-hidden border-2 transition-all ${
                  safeIndex === idx
                    ? 'border-red-500 shadow-md ring-2 ring-red-500/30 scale-100'
                    : 'border-zinc-800 opacity-60 hover:opacity-100 hover:border-zinc-600'
                }`}
              >
                <img
                  src={img}
                  alt={`Thumbnail ${idx + 1}`}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </button>
            ))}
          </div>
        )}

        {/* Mobile Dedicated Video Playlist Action Button situated beneath thumbnail strip */}
        <div className="mt-3 sm:hidden">
          <button
            onClick={onScrollToVideo}
            className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-colors"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Watch Video Playlist</span>
          </button>
        </div>
      </div>

      {/* Dedicated Hero Lightbox Modal (strictly heroImages) */}
      {isLightboxOpen && safeImages[lightboxIndex] && (
        <div 
          onClick={() => {
            setIsLightboxOpen(false);
            setCurrentIndex(lightboxIndex);
          }}
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6 animate-in fade-in duration-200 select-none"
        >
          {/* Top Bar */}
          <div className="flex items-center justify-between text-white z-10">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-full bg-zinc-800 text-xs font-bold border border-zinc-700">
                Featured Photo {lightboxIndex + 1} of {safeImages.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsLightboxZoomed(!isLightboxZoomed);
                }}
                className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                title="Toggle Zoom"
              >
                {isLightboxZoomed ? <ZoomOut className="w-5 h-5" /> : <ZoomIn className="w-5 h-5" />}
              </button>

              <button
                onClick={() => {
                  setIsLightboxOpen(false);
                  setCurrentIndex(lightboxIndex);
                }}
                className="p-2 rounded-lg bg-zinc-800 hover:bg-red-700 text-zinc-200 hover:text-white transition-colors"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Main Image Container */}
          <div 
            onClick={(e) => e.stopPropagation()} 
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="relative flex-1 flex items-center justify-center overflow-hidden my-2"
          >
            {safeImages.length > 1 && (
              <>
                <button
                  onClick={() => setLightboxIndex((prev) => (prev === 0 ? safeImages.length - 1 : prev - 1))}
                  className="absolute left-2 sm:left-6 z-20 w-12 h-12 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center border border-white/20 transition-all hover:scale-110 shadow-lg"
                  title="Previous Photo (Left Arrow)"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>

                <button
                  onClick={() => setLightboxIndex((prev) => (prev === safeImages.length - 1 ? 0 : prev + 1))}
                  className="absolute right-2 sm:right-6 z-20 w-12 h-12 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center border border-white/20 transition-all hover:scale-110 shadow-lg"
                  title="Next Photo (Right Arrow)"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}

            <img
              src={safeImages[lightboxIndex]}
              alt={`Featured Photo ${lightboxIndex + 1}`}
              className={`max-h-[75vh] max-w-full object-contain transition-all select-none rounded-lg shadow-2xl ${
                isLightboxZoomed ? 'scale-150 cursor-zoom-out' : 'cursor-zoom-in'
              }`}
              onClick={() => setIsLightboxZoomed(!isLightboxZoomed)}
              referrerPolicy="no-referrer"
            />
          </div>

          {/* Bottom Micro Thumbnail Filmstrip */}
          {safeImages.length > 1 && (
            <div 
              onClick={(e) => e.stopPropagation()}
              className="z-10 bg-zinc-900/90 rounded-xl p-3 sm:p-4 border border-zinc-800 max-w-4xl mx-auto w-full text-center"
            >
              <div className="flex items-center justify-center gap-1.5 overflow-x-auto pb-1">
                {safeImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setIsLightboxZoomed(false);
                      setLightboxIndex(idx);
                    }}
                    className={`w-10 sm:w-14 aspect-[16/10] rounded overflow-hidden border-2 transition-all flex-shrink-0 ${
                      lightboxIndex === idx
                        ? 'border-red-500 scale-105 shadow'
                        : 'border-zinc-700 opacity-40 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={img}
                      alt={`Hero Thumbnail ${idx + 1}`}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
