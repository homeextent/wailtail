import { 
  ShowcaseChapter, 
  ShowcaseSection, 
  ShowcaseChapterCategory, 
  PREDEFINED_CHAPTER_TITLES,
  CHAPTER_SPEC_PRESETS 
} from '../types';

/**
 * Normalizes any section or chapter object into the strict ShowcaseChapter interface
 */
export function normalizeSectionToChapter(sec: any, index: number): ShowcaseChapter {
  if (!sec) {
    return {
      id: `chapter-${Date.now()}-${index}`,
      category: 'CUSTOM',
      title: 'Custom Chapter',
      subtitle: '',
      narrative: '',
      photoUrl: '',
      photoCaption: '',
      highlights: [],
      specCards: []
    };
  }

  // If already structured as ShowcaseChapter with valid category
  if (sec.category && ['EXTERIOR', 'POWERTRAIN', 'INTERIOR', 'CHASSIS', 'CUSTOM'].includes(sec.category)) {
    const cat = sec.category as ShowcaseChapterCategory;
    const title = cat === 'CUSTOM' ? (sec.title || 'Custom Chapter') : PREDEFINED_CHAPTER_TITLES[cat];
    return {
      id: sec.id || `chapter-${Date.now()}-${index}`,
      category: cat,
      title: title,
      subtitle: sec.subtitle || sec.tagline || '',
      narrative: sec.narrative || (Array.isArray(sec.paragraphs) ? sec.paragraphs.join('\n\n') : ''),
      photoUrl: sec.photoUrl || sec.images?.[0]?.url || '',
      photoCaption: sec.photoCaption || sec.images?.[0]?.caption || '',
      highlights: Array.isArray(sec.highlights) 
        ? sec.highlights 
        : (Array.isArray(sec.bulletPoints) ? sec.bulletPoints : (Array.isArray(sec.features) ? sec.features : [])),
      specCards: (sec.specCards || sec.specs || []).map((s: any, sIdx: number) => {
        const key = s.key || s.label || 'Attribute';
        return {
          id: s.id || `spec-${index}-${sIdx}`,
          key: key,
          value: s.value || '',
          isCustomKey: typeof s.isCustomKey === 'boolean' 
            ? s.isCustomKey 
            : !CHAPTER_SPEC_PRESETS[cat].includes(key)
        };
      })
    };
  }

  // Infer category from section id or title
  const idLower = (sec.id || '').toLowerCase();
  const titleLower = (sec.title || '').toLowerCase();

  let category: ShowcaseChapterCategory = 'CUSTOM';
  if (idLower.includes('exterior') || titleLower.includes('exterior') || titleLower.includes('aero')) {
    category = 'EXTERIOR';
  } else if (idLower.includes('powertrain') || idLower.includes('engine') || titleLower.includes('powertrain') || titleLower.includes('mechanical')) {
    category = 'POWERTRAIN';
  } else if (idLower.includes('interior') || idLower.includes('cabin') || titleLower.includes('interior') || titleLower.includes('cabin') || titleLower.includes('cockpit')) {
    category = 'INTERIOR';
  } else if (idLower.includes('chassis') || idLower.includes('underside') || idLower.includes('suspension') || titleLower.includes('chassis') || titleLower.includes('suspension')) {
    category = 'CHASSIS';
  }

  const title = category === 'CUSTOM' ? (sec.title || `Chapter 0${index + 1}`) : PREDEFINED_CHAPTER_TITLES[category];

  return {
    id: sec.id || `chapter-${Date.now()}-${index}`,
    category,
    title,
    subtitle: sec.tagline || sec.subtitle || '',
    narrative: Array.isArray(sec.paragraphs) ? sec.paragraphs.join('\n\n') : (sec.narrative || ''),
    photoUrl: sec.images?.[0]?.url || sec.photoUrl || '',
    photoCaption: sec.images?.[0]?.caption || sec.photoCaption || '',
    highlights: Array.isArray(sec.bulletPoints) 
      ? sec.bulletPoints 
      : (Array.isArray(sec.features) ? sec.features : (Array.isArray(sec.highlights) ? sec.highlights : [])),
    specCards: (sec.specs || sec.specCards || []).map((s: any, sIdx: number) => {
      const k = s.key || s.label || 'Attribute';
      return {
        id: s.id || `spec-${index}-${sIdx}`,
        key: k,
        value: s.value || '',
        isCustomKey: typeof s.isCustomKey === 'boolean' 
          ? s.isCustomKey 
          : !CHAPTER_SPEC_PRESETS[category].includes(k)
      };
    })
  };
}

/**
 * Converts a ShowcaseChapter back to ShowcaseSection for backward compatibility
 */
export function chapterToSection(ch: ShowcaseChapter): ShowcaseSection {
  return {
    id: ch.id,
    title: ch.title,
    tagline: ch.subtitle,
    paragraphs: ch.narrative ? ch.narrative.split('\n\n').filter(p => p.trim()) : [],
    bulletPoints: ch.highlights || [],
    specs: (ch.specCards || []).map(sc => ({ label: sc.key, value: sc.value })),
    images: ch.photoUrl ? [{
      url: ch.photoUrl,
      caption: ch.photoCaption || ch.title,
      alt: ch.title
    }] : []
  };
}

/**
 * Generate default starter spec cards for a given category
 */
export function getStarterSpecCardsForCategory(category: ShowcaseChapterCategory, chapterId: string) {
  const presets = CHAPTER_SPEC_PRESETS[category];
  const count = category === 'CUSTOM' ? 3 : Math.min(presets.length, 4);
  return presets.slice(0, count).map((key, idx) => ({
    id: `spec-${chapterId}-${idx}-${Date.now()}`,
    key,
    value: '',
    isCustomKey: false
  }));
}
