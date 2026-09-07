import React, { useState, useRef, useEffect } from 'react';
import { 
  ShowcaseChapter, 
  ShowcaseChapterCategory, 
  PREDEFINED_CHAPTER_TITLES, 
  CHAPTER_SPEC_PRESETS 
} from '../types';
import { SpecCardCombobox } from './SpecCardCombobox';
import { getStarterSpecCardsForCategory } from '../utils/showcaseConverter';
import { 
  BookOpen, 
  Plus, 
  Trash2, 
  ChevronUp, 
  ChevronDown, 
  Lock, 
  CheckCircle, 
  FolderOpen, 
  UploadCloud, 
  ImageIcon, 
  Sliders, 
  Layers, 
  Sparkles,
  Edit3
} from 'lucide-react';

interface ShowcaseChaptersEditorProps {
  chapters: ShowcaseChapter[];
  onChange: (chapters: ShowcaseChapter[]) => void;
  onOpenGalleryPicker?: (chapterIndex: number) => void;
  onTriggerFileUpload?: (chapterIndex: number) => void;
}

const CATEGORY_METADATA: Record<ShowcaseChapterCategory, {
  label: string;
  defaultTitle: string;
  badgeBg: string;
  badgeText: string;
  borderHover: string;
  description: string;
}> = {
  EXTERIOR: {
    label: 'Exterior',
    defaultTitle: PREDEFINED_CHAPTER_TITLES.EXTERIOR,
    badgeBg: 'bg-amber-950/70',
    badgeText: 'text-amber-300 border-amber-800/60',
    borderHover: 'hover:border-amber-700/60',
    description: 'Aero, paint, body styling, wheels & glass'
  },
  POWERTRAIN: {
    label: 'Powertrain',
    defaultTitle: PREDEFINED_CHAPTER_TITLES.POWERTRAIN,
    badgeBg: 'bg-red-950/70',
    badgeText: 'text-red-300 border-red-800/60',
    borderHover: 'hover:border-red-700/60',
    description: 'Engine, transmission, output, exhaust & gearing'
  },
  INTERIOR: {
    label: 'Interior',
    defaultTitle: PREDEFINED_CHAPTER_TITLES.INTERIOR,
    badgeBg: 'bg-emerald-950/70',
    badgeText: 'text-emerald-300 border-emerald-800/60',
    borderHover: 'hover:border-emerald-700/60',
    description: 'Cabin, upholstery, switchgear, audio & gauges'
  },
  CHASSIS: {
    label: 'Chassis',
    defaultTitle: PREDEFINED_CHAPTER_TITLES.CHASSIS,
    badgeBg: 'bg-blue-950/70',
    badgeText: 'text-blue-300 border-blue-800/60',
    borderHover: 'hover:border-blue-700/60',
    description: 'Suspension, brakes, steering, underbody & frame'
  },
  CUSTOM: {
    label: 'Custom',
    defaultTitle: 'Custom Chapter',
    badgeBg: 'bg-purple-950/70',
    badgeText: 'text-purple-300 border-purple-800/60',
    borderHover: 'hover:border-purple-700/60',
    description: 'Bespoke topic, restoration logs, racing history, etc.'
  }
};

export const ShowcaseChaptersEditor: React.FC<ShowcaseChaptersEditorProps> = ({
  chapters,
  onChange,
  onOpenGalleryPicker,
  onTriggerFileUpload
}) => {
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const pickerDropdownRef = useRef<HTMLDivElement>(null);

  // Close category picker on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (pickerDropdownRef.current && !pickerDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddChapter = (category: ShowcaseChapterCategory) => {
    const chapterId = `chapter-${Date.now()}`;
    const fixedTitle = category === 'CUSTOM' ? '' : PREDEFINED_CHAPTER_TITLES[category];
    const starterSpecs = getStarterSpecCardsForCategory(category, chapterId);

    const newChapter: ShowcaseChapter = {
      id: chapterId,
      category,
      title: fixedTitle,
      subtitle: '',
      narrative: '',
      photoUrl: '',
      photoCaption: '',
      highlights: [],
      specCards: starterSpecs
    };

    onChange([...chapters, newChapter]);
    setIsCategoryPickerOpen(false);
  };

  const handleCategoryChange = (index: number, newCategory: ShowcaseChapterCategory) => {
    const updated = [...chapters];
    const target = updated[index];
    const newTitle = newCategory === 'CUSTOM' 
      ? (target.category === 'CUSTOM' ? target.title : '') 
      : PREDEFINED_CHAPTER_TITLES[newCategory];

    // Adjust spec cards presets if needed or keep existing
    updated[index] = {
      ...target,
      category: newCategory,
      title: newTitle
    };
    onChange(updated);
  };

  const handleUpdateChapterField = <K extends keyof ShowcaseChapter>(
    index: number,
    field: K,
    val: ShowcaseChapter[K]
  ) => {
    const updated = [...chapters];
    updated[index] = {
      ...updated[index],
      [field]: val
    };
    onChange(updated);
  };

  const handleDeleteChapter = (index: number) => {
    onChange(chapters.filter((_, i) => i !== index));
  };

  const handleMoveChapter = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= chapters.length) return;
    const updated = [...chapters];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    onChange(updated);
  };

  // Spec card actions
  const handleAddSpecCard = (chapterIndex: number) => {
    const updated = [...chapters];
    const ch = updated[chapterIndex];
    const category = ch.category;
    const presets = CHAPTER_SPEC_PRESETS[category] || CHAPTER_SPEC_PRESETS.CUSTOM;

    // Pick first unused preset key or fallback to first preset
    const usedKeys = ch.specCards.map(s => s.key.toLowerCase());
    const firstUnused = presets.find(k => !usedKeys.includes(k.toLowerCase())) || presets[0] || 'Attribute';

    const newCard = {
      id: `spec-${ch.id}-${Date.now()}`,
      key: firstUnused,
      value: '',
      isCustomKey: false
    };

    updated[chapterIndex] = {
      ...ch,
      specCards: [...ch.specCards, newCard]
    };
    onChange(updated);
  };

  const handleUpdateSpecCard = (
    chapterIndex: number,
    cardIndex: number,
    updates: Partial<ShowcaseChapter['specCards'][0]>
  ) => {
    const updated = [...chapters];
    const ch = updated[chapterIndex];
    const newCards = [...ch.specCards];
    newCards[cardIndex] = {
      ...newCards[cardIndex],
      ...updates
    };
    updated[chapterIndex] = {
      ...ch,
      specCards: newCards
    };
    onChange(updated);
  };

  const handleDeleteSpecCard = (chapterIndex: number, cardIndex: number) => {
    const updated = [...chapters];
    const ch = updated[chapterIndex];
    updated[chapterIndex] = {
      ...ch,
      specCards: ch.specCards.filter((_, i) => i !== cardIndex)
    };
    onChange(updated);
  };

  // Count active categories to help guide seller
  const activeCategories = chapters.map(c => c.category);

  return (
    <div className="space-y-6">
      {/* Category Overview Bar */}
      <div className="p-3.5 bg-zinc-900/90 rounded-xl border border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-red-500" />
          <span className="font-bold text-zinc-200">Predefined Chapter Taxonomy:</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(['EXTERIOR', 'POWERTRAIN', 'INTERIOR', 'CHASSIS', 'CUSTOM'] as ShowcaseChapterCategory[]).map(cat => {
            const count = activeCategories.filter(c => c === cat).length;
            const meta = CATEGORY_METADATA[cat];
            return (
              <span 
                key={cat}
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border flex items-center gap-1 ${
                  count > 0 
                    ? `${meta.badgeBg} ${meta.badgeText} border-current` 
                    : 'bg-zinc-800/60 text-zinc-500 border-zinc-700/60'
                }`}
              >
                <span>{meta.label}</span>
                {count > 0 && <span className="font-mono font-bold">({count})</span>}
              </span>
            );
          })}
        </div>
      </div>

      {/* Chapters List */}
      <div className="space-y-6">
        {chapters.length === 0 ? (
          <div className="p-8 text-center bg-zinc-900/60 border border-dashed border-zinc-800 rounded-2xl space-y-3">
            <BookOpen className="w-8 h-8 text-zinc-600 mx-auto" />
            <div className="text-zinc-300 font-bold text-sm">No Showcase Chapters Configured</div>
            <p className="text-zinc-500 text-xs max-w-md mx-auto">
              Add curated showcase chapters with locked category taxonomies (Exterior, Powertrain, Interior, Chassis) or custom topics to build a rich interactive vehicle presentation.
            </p>
          </div>
        ) : (
          chapters.map((chapter, idx) => {
            const meta = CATEGORY_METADATA[chapter.category];
            const isCustom = chapter.category === 'CUSTOM';
            const chapterNumberLabel = `Chapter 0${idx + 1}`;

            return (
              <div 
                key={chapter.id} 
                className="p-4 sm:p-6 bg-zinc-900/90 border border-zinc-800 hover:border-zinc-700 rounded-2xl space-y-5 transition-all shadow-md"
              >
                {/* Card Header: Re-indexed Chapter + Category Badge + Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-800">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800/60">
                      {chapterNumberLabel}
                    </span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${meta.badgeBg} ${meta.badgeText}`}>
                      {meta.label}
                    </span>
                    <h4 className="font-bold text-zinc-100 text-sm">
                      {chapter.title || (isCustom ? 'Untitled Custom Chapter' : meta.defaultTitle)}
                    </h4>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Reorder Buttons */}
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveChapter(idx, 'up')}
                      className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      title="Move Chapter Up"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === chapters.length - 1}
                      onClick={() => handleMoveChapter(idx, 'down')}
                      className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      title="Move Chapter Down"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <div className="h-4 w-px bg-zinc-800 mx-1" />
                    <button
                      type="button"
                      onClick={() => handleDeleteChapter(idx)}
                      className="p-1.5 rounded text-zinc-400 hover:text-red-400 hover:bg-red-950/40 transition-colors"
                      title="Delete Chapter"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Chapter Category & Title Row */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
                  {/* Category Selector */}
                  <div className="sm:col-span-4">
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                      Chapter Category
                    </label>
                    <select
                      value={chapter.category}
                      onChange={(e) => handleCategoryChange(idx, e.target.value as ShowcaseChapterCategory)}
                      className="w-full p-2.5 rounded-lg bg-black border border-zinc-700 text-white font-semibold focus:border-red-500 focus:outline-none cursor-pointer"
                    >
                      <option value="EXTERIOR">EXTERIOR (Exterior Highlights)</option>
                      <option value="POWERTRAIN">POWERTRAIN (Powertrain)</option>
                      <option value="INTERIOR">INTERIOR (Cabin & Cockpit)</option>
                      <option value="CHASSIS">CHASSIS (Chassis & Suspension)</option>
                      <option value="CUSTOM">CUSTOM (Free-Text Chapter)</option>
                    </select>
                  </div>

                  {/* Title Field: Locked for Standard Categories, Editable if CUSTOM */}
                  <div className="sm:col-span-8">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span>Chapter Title</span>
                        {!isCustom && <Lock className="w-3 h-3 text-amber-400" />}
                      </label>
                      {!isCustom ? (
                        <span className="text-[10px] text-amber-400 font-mono">
                          Locked by category preset
                        </span>
                      ) : (
                        <span className="text-[10px] text-purple-400 font-mono">
                          Editable free-text
                        </span>
                      )}
                    </div>

                    {!isCustom ? (
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 font-bold">
                        <span className="flex items-center gap-2">
                          <Lock className="w-3.5 h-3.5 text-zinc-500" />
                          <span>{chapter.title || meta.defaultTitle}</span>
                        </span>
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                          Predefined
                        </span>
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={chapter.title}
                        onChange={(e) => handleUpdateChapterField(idx, 'title', e.target.value)}
                        placeholder="e.g. Provenance & Service History, Track Modifications..."
                        className="w-full p-2.5 rounded-lg bg-black border border-purple-700/60 focus:border-purple-400 text-purple-100 font-bold focus:outline-none shadow-inner"
                      />
                    )}
                  </div>
                </div>

                {/* Subtitle / Tagline */}
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                    Chapter Subtitle / Descriptive Tagline
                  </label>
                  <input
                    type="text"
                    value={chapter.subtitle}
                    onChange={(e) => handleUpdateChapterField(idx, 'subtitle', e.target.value)}
                    placeholder="e.g. Steel Turbo flares, period-correct aerodynamics and stance"
                    className="w-full p-2.5 rounded-lg bg-black border border-zinc-700 text-zinc-200 text-xs focus:border-red-500 focus:outline-none"
                  />
                </div>

                {/* Narrative Text */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                      Narrative Prose
                    </label>
                    <span className="text-[10px] text-zinc-500">Separate paragraphs with blank lines</span>
                  </div>
                  <textarea
                    rows={3}
                    value={chapter.narrative}
                    onChange={(e) => handleUpdateChapterField(idx, 'narrative', e.target.value)}
                    placeholder="Detailed narrative describing engineering, condition, craftsmanship, and specifications for this chapter..."
                    className="w-full p-3 rounded-lg bg-black border border-zinc-700 text-zinc-200 text-xs leading-relaxed focus:border-red-500 focus:outline-none"
                  />
                </div>

                {/* Photo & Caption */}
                <div className="pt-3 border-t border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-red-500" />
                      <span>Chapter Photograph & Caption</span>
                    </label>
                    <div className="flex items-center gap-2">
                      {onOpenGalleryPicker && (
                        <button
                          type="button"
                          onClick={() => onOpenGalleryPicker(idx)}
                          className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                          title="Pick photo from existing listing gallery"
                        >
                          <FolderOpen className="w-3 h-3 text-amber-400" />
                          <span>Pick from Gallery</span>
                        </button>
                      )}
                      {onTriggerFileUpload && (
                        <button
                          type="button"
                          onClick={() => onTriggerFileUpload(idx)}
                          className="px-2.5 py-1 rounded-lg bg-red-800/90 hover:bg-red-700 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                          title="Upload direct photo from computer"
                        >
                          <UploadCloud className="w-3 h-3" />
                          <span>Upload Photo</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                    <div className="sm:col-span-4">
                      <div className="w-full h-24 rounded-lg bg-black border border-zinc-700 overflow-hidden relative group shadow-inner">
                        {chapter.photoUrl ? (
                          <>
                            <img 
                              src={chapter.photoUrl} 
                              alt={chapter.photoCaption || chapter.title} 
                              className="w-full h-full object-cover" 
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdateChapterField(idx, 'photoUrl', '')}
                              className="absolute top-1 right-1 p-1 rounded bg-red-600 hover:bg-red-700 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                              title="Remove photo"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 text-center p-2">
                            <ImageIcon className="w-5 h-5 mb-1 opacity-50" />
                            <span className="text-[10px]">No photo set</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="sm:col-span-8 space-y-2">
                      <input
                        type="text"
                        value={chapter.photoUrl}
                        onChange={(e) => handleUpdateChapterField(idx, 'photoUrl', e.target.value)}
                        className="w-full p-2 rounded-lg bg-black border border-zinc-700 text-zinc-200 text-xs font-mono focus:border-red-500 focus:outline-none"
                        placeholder="Photo URL (e.g. https://...)"
                      />
                      <input
                        type="text"
                        value={chapter.photoCaption}
                        onChange={(e) => handleUpdateChapterField(idx, 'photoCaption', e.target.value)}
                        className="w-full p-2 rounded-lg bg-black border border-zinc-700 text-zinc-200 text-xs focus:border-red-500 focus:outline-none"
                        placeholder="Photo caption (e.g. Factory Whale Tail rear spoiler with pristine rubber lip)"
                      />
                    </div>
                  </div>
                </div>

                {/* Highlights (Checkmark Bullets) */}
                <div className="pt-3 border-t border-zinc-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-red-500" />
                      <span>Key Highlights & Specifications (Checkmark Bullets)</span>
                    </label>
                    <span className="text-[10px] text-zinc-400 font-mono font-bold bg-zinc-800 px-2 py-0.5 rounded">
                      {chapter.highlights.filter(h => h.trim()).length} points
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    value={chapter.highlights.join('\n')}
                    onChange={(e) => {
                      const lines = e.target.value.split('\n');
                      handleUpdateChapterField(idx, 'highlights', lines);
                    }}
                    className="w-full p-2.5 rounded-lg bg-black border border-zinc-700 text-zinc-200 text-xs font-mono leading-relaxed focus:border-red-500 focus:outline-none"
                    placeholder="Enter one bullet highlight per line:&#10;Steel front & rear Turbo flares&#10;Bosch H4 European headlights&#10;Staggered 16-inch Fuchs wheels"
                  />
                  <p className="text-[10px] text-zinc-500">
                    Rendered with distinctive red checkmarks in the public showcase section.
                  </p>
                </div>

                {/* Task 5: Context-Aware Hybrid Spec Cards */}
                <div className="pt-3 border-t border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                      <label className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider">
                        Bottom Attribute Spec Cards
                      </label>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                        Context: <strong className="text-zinc-200">{chapter.category}</strong>
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddSpecCard(idx)}
                      className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors border border-zinc-700 hover:border-zinc-600"
                    >
                      <Plus className="w-3 h-3 text-emerald-400" />
                      <span>+ Add Spec Card</span>
                    </button>
                  </div>

                  {chapter.specCards.length === 0 ? (
                    <div className="p-3 rounded-lg bg-black/40 border border-dashed border-zinc-800 text-center text-xs text-zinc-500">
                      No attribute spec cards. Click &ldquo;+ Add Spec Card&rdquo; to insert contextual specs for {chapter.category.toLowerCase()}.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {chapter.specCards.map((card, cIdx) => (
                        <div 
                          key={card.id || cIdx} 
                          className="p-2.5 rounded-lg bg-black/80 border border-zinc-800 flex items-center gap-2"
                        >
                          <span className="text-[9px] font-mono text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded flex-shrink-0">
                            #{cIdx + 1}
                          </span>

                          {/* Hybrid Combobox for Attribute Key */}
                          <div className="w-5/12 min-w-[120px]">
                            <SpecCardCombobox
                              value={card.key}
                              isCustomKey={card.isCustomKey}
                              category={chapter.category}
                              onChange={(newKey, isCustomKey) => {
                                handleUpdateSpecCard(idx, cIdx, {
                                  key: newKey,
                                  isCustomKey
                                });
                              }}
                            />
                          </div>

                          {/* Value Input */}
                          <input
                            type="text"
                            value={card.value}
                            onChange={(e) => {
                              handleUpdateSpecCard(idx, cIdx, { value: e.target.value });
                            }}
                            placeholder="Value (e.g. 180 hp @ 5,500 RPM)"
                            className="flex-1 p-1.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs focus:border-red-500 focus:outline-none placeholder:text-zinc-600"
                          />

                          {/* Delete Card */}
                          <button
                            type="button"
                            onClick={() => handleDeleteSpecCard(idx, cIdx)}
                            className="text-zinc-500 hover:text-red-400 p-1 cursor-pointer transition-colors flex-shrink-0"
                            title="Delete attribute card"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Category Picker Dropdown to Add Chapter */}
      <div className="relative" ref={pickerDropdownRef}>
        <button
          type="button"
          onClick={() => setIsCategoryPickerOpen(!isCategoryPickerOpen)}
          className="w-full py-3 rounded-xl border border-dashed border-red-700/60 hover:border-red-500 bg-red-950/20 hover:bg-red-950/40 text-red-300 hover:text-white font-bold flex items-center justify-center gap-2 transition-all cursor-pointer text-xs shadow-xs"
        >
          <Plus className="w-4 h-4 text-red-400" />
          <span>+ Add Showcase Chapter</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isCategoryPickerOpen ? 'rotate-180' : ''}`} />
        </button>

        {isCategoryPickerOpen && (
          <div className="absolute bottom-full mb-2 left-0 right-0 sm:left-auto sm:right-0 sm:w-96 bg-zinc-950 border border-zinc-700 rounded-xl shadow-2xl z-50 p-2 space-y-1 animate-in fade-in zoom-in-95 duration-100">
            <div className="px-3 py-2 border-b border-zinc-800 text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
              <span>Select Chapter Category Preset</span>
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            </div>

            {(['EXTERIOR', 'POWERTRAIN', 'INTERIOR', 'CHASSIS', 'CUSTOM'] as ShowcaseChapterCategory[]).map(cat => {
              const meta = CATEGORY_METADATA[cat];
              const isAlreadyAdded = activeCategories.includes(cat);

              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleAddChapter(cat)}
                  className={`w-full text-left p-2.5 rounded-lg flex items-start gap-2.5 transition-colors cursor-pointer hover:bg-zinc-850 group ${meta.borderHover}`}
                >
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border mt-0.5 ${meta.badgeBg} ${meta.badgeText}`}>
                    {meta.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-zinc-200 text-xs flex items-center gap-1.5 group-hover:text-white">
                      <span>{meta.defaultTitle}</span>
                      {isAlreadyAdded && cat !== 'CUSTOM' && (
                        <span className="text-[9px] font-mono text-zinc-500">(Already added)</span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                      {meta.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
