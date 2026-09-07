import React from 'react';
import { ShowcaseSection, ShowcaseChapter } from '../types';
import { normalizeSectionToChapter } from '../utils/showcaseConverter';
import { Check, ZoomIn } from 'lucide-react';

interface InlineShowcaseSectionProps {
  sections: (ShowcaseSection | ShowcaseChapter)[];
  onOpenLightboxWithUrl: (imageUrl: string) => void;
}

export const InlineShowcaseSection: React.FC<InlineShowcaseSectionProps> = ({
  sections,
  onOpenLightboxWithUrl
}) => {
  const normalizedChapters = sections.map((sec, idx) => normalizeSectionToChapter(sec, idx));

  return (
    <div id="showcase" className="space-y-12 sm:space-y-16">
      {normalizedChapters.map((ch, idx) => {
        const paragraphs = ch.narrative ? ch.narrative.split('\n\n').filter(p => p.trim()) : [];

        return (
          <article 
            key={ch.id || idx} 
            id={ch.id}
            className="bg-white rounded-xl border border-zinc-200/90 shadow-sm overflow-hidden"
          >
            {/* Section Header */}
            <div className="p-6 sm:p-8 border-b border-zinc-100 bg-zinc-50/50">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs uppercase tracking-widest font-bold text-red-700">
                  Showcase Chapter 0{idx + 1}
                </span>
                {ch.category && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-700">
                    {ch.category}
                  </span>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight font-serif">
                {ch.title}
              </h2>
              {ch.subtitle && (
                <p className="text-sm text-zinc-600 mt-1 italic">
                  {ch.subtitle}
                </p>
              )}
            </div>

            {/* Narrative & In-line Images */}
            <div className="p-6 sm:p-8 space-y-6">
              {/* First paragraph */}
              {paragraphs[0] && (
                <p className="text-zinc-700 leading-relaxed text-sm sm:text-base">
                  {paragraphs[0]}
                </p>
              )}

              {/* In-Line Showcase Image (Primary Feature) */}
              {ch.photoUrl && ch.photoUrl.trim() !== '' && (
                <figure className="my-6">
                  <div 
                    onClick={() => onOpenLightboxWithUrl(ch.photoUrl)}
                    className="relative rounded-lg overflow-hidden border border-zinc-200 cursor-pointer group bg-zinc-100"
                  >
                    <img
                      src={ch.photoUrl}
                      alt={ch.photoCaption || ch.title || 'Showcase detail photo'}
                      className="w-full h-auto max-h-[500px] object-cover transition-transform duration-300 group-hover:scale-[1.01]"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 px-3 py-1.5 rounded-full bg-black/75 text-white text-xs font-semibold backdrop-blur-sm flex items-center gap-1.5 transition-opacity shadow-md">
                        <ZoomIn className="w-3.5 h-3.5" />
                        <span>Click to Enlarge</span>
                      </span>
                    </div>
                  </div>
                  {ch.photoCaption && (
                    <figcaption className="text-xs text-zinc-500 mt-2 px-1 italic">
                      {ch.photoCaption}
                    </figcaption>
                  )}
                </figure>
              )}

              {/* Remaining paragraphs */}
              {paragraphs.slice(1).map((p, pIdx) => (
                <p key={pIdx} className="text-zinc-700 leading-relaxed text-sm sm:text-base">
                  {p}
                </p>
              ))}

              {/* Bullet Points / Highlights */}
              {ch.highlights && ch.highlights.length > 0 && (
                <div className="bg-zinc-50 p-4 sm:p-5 rounded-lg border border-zinc-200/80 my-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 mb-3">
                    Key Specifications & Highlights
                  </h4>
                  <ul className="space-y-2">
                    {ch.highlights.filter(bp => bp && bp.trim()).map((bp, bpIdx) => (
                      <li key={bpIdx} className="text-xs sm:text-sm text-zinc-700 flex items-start gap-2">
                        <Check className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                        <span>{bp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Context-Aware Hybrid Spec Cards */}
              {ch.specCards && ch.specCards.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-xs">
                  {ch.specCards.map((card, sIdx) => (
                    <div key={card.id || sIdx} className="p-2.5 rounded bg-zinc-100 border border-zinc-200">
                      <span className="text-zinc-500 uppercase tracking-wider block text-[10px] font-semibold flex items-center justify-between">
                        <span>{card.key}</span>
                        {card.isCustomKey && (
                          <span className="text-[8px] bg-zinc-200 text-zinc-600 px-1 rounded font-normal">
                            custom
                          </span>
                        )}
                      </span>
                      <span className="font-bold text-zinc-800 block mt-0.5 truncate">
                        {card.value || '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
};
