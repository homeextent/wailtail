import React, { useState, useRef, useEffect } from 'react';
import { ShowcaseChapterCategory, CHAPTER_SPEC_PRESETS } from '../types';
import { 
  ChevronDown, 
  Search, 
  Plus, 
  Check, 
  Sparkles, 
  PenTool, 
  RotateCcw,
  Sliders
} from 'lucide-react';

interface SpecCardComboboxProps {
  value: string;
  isCustomKey: boolean;
  category: ShowcaseChapterCategory;
  onChange: (newKey: string, isCustomKey: boolean) => void;
  className?: string;
  placeholder?: string;
}

export const SpecCardCombobox: React.FC<SpecCardComboboxProps> = ({
  value,
  isCustomKey,
  category,
  onChange,
  className = '',
  placeholder = 'Select or enter key...'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditingCustom, setIsEditingCustom] = useState(isCustomKey);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync internal custom state when prop changes
  useEffect(() => {
    setIsEditingCustom(isCustomKey);
  }, [isCustomKey]);

  // Handle clicking outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter presets based on category and search query
  const presets = CHAPTER_SPEC_PRESETS[category] || CHAPTER_SPEC_PRESETS.CUSTOM;
  const filteredPresets = presets.filter((key) =>
    key.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const handleSelectPreset = (presetKey: string) => {
    onChange(presetKey, false);
    setIsEditingCustom(false);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleEnableCustom = (initialText = '') => {
    const textToSet = initialText.trim() ? initialText.trim() : (value || '');
    onChange(textToSet, true);
    setIsEditingCustom(true);
    setIsOpen(false);
    setSearchQuery('');
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  };

  const handleSwitchToPresets = () => {
    setIsEditingCustom(false);
    setIsOpen(true);
  };

  // If in custom editing mode, render an editable text input with a pill badge and preset return button
  if (isEditingCustom) {
    return (
      <div className={`relative flex items-center gap-1.5 ${className}`}>
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value, true)}
            placeholder="Custom key (e.g. Supercharger)"
            className="w-full pl-2 pr-14 py-1.5 rounded bg-zinc-900 border border-amber-600/60 focus:border-amber-400 text-amber-200 text-xs font-semibold focus:outline-none placeholder:text-zinc-600 shadow-inner"
          />
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800/60 pointer-events-none">
            Custom
          </span>
        </div>
        <button
          type="button"
          onClick={handleSwitchToPresets}
          className="px-2 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[10px] font-medium flex items-center gap-1 border border-zinc-700 transition-colors cursor-pointer flex-shrink-0"
          title="Switch to category presets list"
        >
          <RotateCcw className="w-3 h-3 text-zinc-400" />
          <span className="hidden sm:inline">Presets</span>
        </button>
      </div>
    );
  }

  // Standard Combobox dropdown trigger view
  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setSearchQuery('');
        }}
        className="w-full flex items-center justify-between gap-1 px-2.5 py-1.5 rounded bg-zinc-900 hover:bg-zinc-850 border border-zinc-700 hover:border-zinc-500 text-left text-xs font-semibold text-zinc-200 transition-colors cursor-pointer group"
      >
        <span className="truncate flex items-center gap-1.5">
          <Sliders className="w-3 h-3 text-red-400 flex-shrink-0" />
          <span className={value ? 'text-zinc-100 font-semibold' : 'text-zinc-500'}>
            {value || placeholder}
          </span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Floating Dropdown Panel */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 max-w-[90vw] bg-zinc-950 border border-zinc-700 rounded-lg shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Search Box */}
          <div className="p-2 border-b border-zinc-800 bg-zinc-900/90">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${category.toLowerCase()} presets...`}
                className="w-full pl-8 pr-2 py-1 bg-black border border-zinc-700 rounded text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-red-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (filteredPresets.length > 0) {
                      handleSelectPreset(filteredPresets[0]);
                    } else if (searchQuery.trim()) {
                      handleEnableCustom(searchQuery);
                    }
                  } else if (e.key === 'Escape') {
                    setIsOpen(false);
                  }
                }}
              />
            </div>
          </div>

          {/* Presets List */}
          <div className="max-h-48 overflow-y-auto p-1 text-xs">
            <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-zinc-500 flex items-center justify-between">
              <span>{category} Presets</span>
              <span className="font-mono text-zinc-600">{filteredPresets.length} available</span>
            </div>

            {filteredPresets.length > 0 ? (
              filteredPresets.map((presetKey) => {
                const isSelected = value === presetKey && !isCustomKey;
                return (
                  <button
                    key={presetKey}
                    type="button"
                    onClick={() => handleSelectPreset(presetKey)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left transition-colors cursor-pointer ${
                      isSelected 
                        ? 'bg-red-950/60 text-red-200 font-bold border border-red-800/40' 
                        : 'text-zinc-200 hover:bg-zinc-850 hover:text-white'
                    }`}
                  >
                    <span>{presetKey}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-red-400" />}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-2 text-[11px] text-zinc-400 text-center">
                No preset key matches &ldquo;{searchQuery}&rdquo;
              </div>
            )}
          </div>

          {/* Divider & Custom Option */}
          <div className="p-1 border-t border-zinc-800 bg-zinc-900/60">
            <button
              type="button"
              onClick={() => handleEnableCustom(searchQuery)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-amber-300 hover:bg-amber-950/40 hover:text-amber-200 text-xs font-semibold transition-colors cursor-pointer border border-dashed border-amber-800/50"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {searchQuery.trim() 
                  ? `Add "${searchQuery.trim()}" as Custom Key` 
                  : '+ Add Custom Key...'}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
