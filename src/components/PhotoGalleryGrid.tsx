import React, { useState, useEffect } from 'react';
import { GalleryImage } from '../types';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Maximize2, 
  Grid, 
  Camera,
  ZoomIn,
  ZoomOut,
  FileText,
  Download,
  ExternalLink
} from 'lucide-react';

interface PhotoGalleryGridProps {
  images: GalleryImage[];
  selectedImageIndex: number | null;
  onOpenLightbox: (index: number) => void;
  onCloseLightbox: () => void;
}

export const PhotoGalleryGrid: React.FC<PhotoGalleryGridProps> = ({
  images,
  selectedImageIndex,
  onOpenLightbox,
  onCloseLightbox
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [isZoomed, setIsZoomed] = useState(false);

  const isPdfDocument = (img: GalleryImage) => {
    return (
      img.isPdf ||
      img.url?.toLowerCase().endsWith('.pdf') ||
      img.url?.startsWith('data:application/pdf') ||
      img.title?.toLowerCase().includes('.pdf')
    );
  };

  const validImages = (images || []).filter(
    (img) => Boolean(img && img.url && typeof img.url === 'string' && img.url.trim() !== '')
  );

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (selectedImageIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseLightbox();
      } else if (e.key === 'ArrowRight' && validImages.length > 0) {
        const next = (selectedImageIndex + 1) % validImages.length;
        onOpenLightbox(next);
      } else if (e.key === 'ArrowLeft' && validImages.length > 0) {
        const prev = (selectedImageIndex - 1 + validImages.length) % validImages.length;
        onOpenLightbox(prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImageIndex, validImages.length, onCloseLightbox, onOpenLightbox]);

  const categories = [
    { id: 'all', label: 'All Photos', count: validImages.length },
    { id: 'exterior', label: 'Exterior & Aero', count: validImages.filter(i => i.category === 'exterior').length },
    { id: 'interior', label: 'Interior & Cabin', count: validImages.filter(i => i.category === 'interior').length },
    { id: 'engine', label: 'Engine Bay', count: validImages.filter(i => i.category === 'engine').length },
    { id: 'underside', label: 'Underside & Chassis', count: validImages.filter(i => i.category === 'underside').length },
    { id: 'detail', label: 'Details & Wheels', count: validImages.filter(i => i.category === 'detail').length },
    { id: 'documentation', label: 'Records & Title', count: validImages.filter(i => i.category === 'documentation').length }
  ].filter(c => c.count > 0 || c.id === 'all');

  const filteredImages = activeCategory === 'all'
    ? validImages
    : validImages.filter(img => img.category === activeCategory);

  const activeImage = selectedImageIndex !== null && validImages[selectedImageIndex] ? validImages[selectedImageIndex] : null;

  return (
    <section id="gallery" className="bg-white rounded-xl border border-zinc-200/90 shadow-sm overflow-hidden scroll-mt-24">
      {/* Header */}
      <div className="p-6 sm:p-8 border-b border-zinc-100 bg-zinc-50/50 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest font-bold text-red-700 mb-1 flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5" />
            <span>Complete Image Archive</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight font-serif">
            Full High-Resolution Photo Gallery ({images.length} Photos)
          </h2>
          <p className="text-sm text-zinc-600 mt-1">
            Click any photo to open full-screen lightbox with high-resolution inspection.
          </p>
        </div>

        <div className="text-xs font-semibold text-zinc-500 bg-white px-3 py-1.5 rounded-lg border border-zinc-200 shadow-sm">
          {filteredImages.length} images shown
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-6 py-3 border-b border-zinc-200 bg-zinc-100/60 overflow-x-auto flex items-center gap-2">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
              activeCategory === cat.id
                ? 'bg-zinc-900 text-white shadow-sm'
                : 'bg-white text-zinc-600 hover:bg-zinc-200/80 border border-zinc-200'
            }`}
          >
            <span>{cat.label}</span>
            <span className="ml-1.5 text-[10px] opacity-75 font-normal">({cat.count})</span>
          </button>
        ))}
      </div>

      {/* Photo Grid */}
      <div className="p-4 sm:p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {filteredImages.map((img) => {
          const globalIndex = images.findIndex(i => i.id === img.id);
          const isPdf = isPdfDocument(img);

          if (isPdf) {
            return (
              <div
                key={img.id}
                onClick={() => onOpenLightbox(globalIndex >= 0 ? globalIndex : 0)}
                className="group relative aspect-[4/3] rounded-lg overflow-hidden bg-gradient-to-b from-zinc-50 to-zinc-100 border-2 border-red-200/80 hover:border-red-500 cursor-pointer shadow-sm hover:shadow-md transition-all p-3.5 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 border border-red-200">
                    <FileText className="w-3 h-3 text-red-600" />
                    PDF Doc
                  </span>
                  <span className="text-[10px] uppercase font-bold text-zinc-400">
                    {img.category}
                  </span>
                </div>

                <div className="text-center py-2">
                  <div className="w-12 h-12 mx-auto rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-center justify-center shadow-xs group-hover:scale-110 transition-transform">
                    <FileText className="w-6 h-6" />
                  </div>
                  <h4 className="text-xs font-bold text-zinc-900 mt-2 line-clamp-2 px-1">
                    {img.title}
                  </h4>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    Inspection & Documentation
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-zinc-200/80 text-[11px] font-bold text-red-700 group-hover:text-red-800">
                  <span className="flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" />
                    Inspect PDF
                  </span>
                  <a
                    href={img.url}
                    download={img.title.endsWith('.pdf') ? img.title : `${img.title}.pdf`}
                    onClick={(e) => e.stopPropagation()}
                    className="p-1 rounded hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900 transition-colors"
                    title="Download PDF"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            );
          }

          return (
            <div
              key={img.id}
              onClick={() => onOpenLightbox(globalIndex >= 0 ? globalIndex : 0)}
              className="group relative aspect-[4/3] rounded-lg overflow-hidden bg-zinc-100 border border-zinc-200 cursor-pointer shadow-sm hover:shadow-md transition-all"
            >
              {img.url && img.url.trim() !== '' ? (
                <img
                  src={img.url}
                  alt={img.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                />
              ) : null}

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-between">
                <span className="self-end px-2 py-0.5 rounded bg-black/60 backdrop-blur-sm text-[10px] uppercase font-bold text-zinc-200">
                  {img.category}
                </span>

                <div>
                  <h4 className="text-xs font-bold text-white truncate">
                    {img.title}
                  </h4>
                  <p className="text-[10px] text-zinc-300 truncate">
                    Click to view high-res
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lightbox Modal */}
      {selectedImageIndex !== null && activeImage && (
        <div 
          onClick={onCloseLightbox}
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6 animate-in fade-in duration-200"
        >
          {/* Top Bar */}
          <div className="flex items-center justify-between text-white z-10">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-full bg-zinc-800 text-xs font-bold border border-zinc-700">
                Photo {selectedImageIndex + 1} of {images.length}
              </span>
              <span className="text-sm font-semibold text-zinc-300 hidden sm:inline">
                {activeImage.title}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsZoomed(!isZoomed);
                }}
                className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                title="Toggle Zoom"
              >
                {isZoomed ? <ZoomOut className="w-5 h-5" /> : <ZoomIn className="w-5 h-5" />}
              </button>

              <button
                onClick={onCloseLightbox}
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
            className="relative flex-1 flex items-center justify-center overflow-hidden my-2"
          >
            {/* Prev Arrow */}
            <button
              onClick={() => {
                const prev = (selectedImageIndex - 1 + images.length) % images.length;
                onOpenLightbox(prev);
              }}
              className="absolute left-2 sm:left-6 z-20 w-12 h-12 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center border border-white/20 transition-all hover:scale-110 shadow-lg"
              title="Previous Photo (Left Arrow)"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            {/* Next Arrow */}
            <button
              onClick={() => {
                const next = (selectedImageIndex + 1) % images.length;
                onOpenLightbox(next);
              }}
              className="absolute right-2 sm:right-6 z-20 w-12 h-12 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center border border-white/20 transition-all hover:scale-110 shadow-lg"
              title="Next Photo (Right Arrow)"
            >
              <ChevronRight className="w-6 h-6" />
            </button>

            {isPdfDocument(activeImage) ? (
              <div className="w-full max-w-3xl bg-zinc-900 border border-zinc-700 rounded-2xl p-6 sm:p-8 flex flex-col items-center text-center shadow-2xl space-y-5">
                <div className="w-16 h-16 rounded-2xl bg-red-950/80 border border-red-700 text-red-400 flex items-center justify-center shadow-inner">
                  <FileText className="w-8 h-8" />
                </div>

                <div>
                  <span className="px-2.5 py-1 rounded bg-red-900/60 text-red-200 text-xs font-bold uppercase tracking-wider border border-red-700/60 inline-block mb-2">
                    PDF Document Archive
                  </span>
                  <h3 className="text-lg sm:text-xl font-bold text-white font-serif">
                    {activeImage.title}
                  </h3>
                  {activeImage.caption && (
                    <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-md mx-auto">
                      {activeImage.caption}
                    </p>
                  )}
                </div>

                {/* PDF Object preview if supported */}
                <div className="w-full h-64 sm:h-96 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700 relative flex items-center justify-center">
                  {activeImage.url && activeImage.url.trim() !== '' ? (
                    <iframe
                      src={`${activeImage.url}#toolbar=0`}
                      title={activeImage.title}
                      className="w-full h-full border-0"
                    />
                  ) : null}
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <a
                    href={activeImage.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Open in New Tab</span>
                  </a>

                  <a
                    href={activeImage.url}
                    download={activeImage.title.endsWith('.pdf') ? activeImage.title : `${activeImage.title}.pdf`}
                    className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download PDF Document</span>
                  </a>
                </div>
              </div>
            ) : (
              activeImage.url && activeImage.url.trim() !== '' ? (
                <img
                  src={activeImage.url}
                  alt={activeImage.title}
                  className={`max-h-[75vh] max-w-full object-contain transition-all select-none rounded-lg shadow-2xl ${
                    isZoomed ? 'scale-150 cursor-zoom-out' : 'cursor-zoom-in'
                  }`}
                  onClick={() => setIsZoomed(!isZoomed)}
                  referrerPolicy="no-referrer"
                />
              ) : null
            )}
          </div>

          {/* Bottom Info & Thumbnail Strip */}
          <div 
            onClick={(e) => e.stopPropagation()}
            className="z-10 bg-zinc-900/90 rounded-xl p-3 sm:p-4 border border-zinc-800 max-w-4xl mx-auto w-full text-center"
          >
            {activeImage.caption && (
              <p className="text-xs sm:text-sm text-zinc-300 mb-3">
                {activeImage.caption}
              </p>
            )}

            {/* Micro thumbnail strip */}
            <div className="flex items-center justify-center gap-1.5 overflow-x-auto pb-1">
              {validImages.map((img, idx) => (
                <button
                  key={img.id}
                  onClick={() => {
                    setIsZoomed(false);
                    onOpenLightbox(idx);
                  }}
                  className={`w-10 sm:w-14 aspect-[4/3] rounded overflow-hidden border-2 transition-all flex-shrink-0 ${
                    selectedImageIndex === idx
                      ? 'border-red-500 scale-105 shadow'
                      : 'border-zinc-700 opacity-40 hover:opacity-100'
                  }`}
                >
                  {img.url && img.url.trim() !== '' ? (
                    <img
                      src={img.url}
                      alt={img.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
