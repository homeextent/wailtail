import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Sliders, 
  Layers, 
  Camera, 
  Film, 
  MessageSquare
} from 'lucide-react';

interface ListingSubNavProps {
  photoCount?: number;
  videoCount?: number;
  commentCount?: number;
}

export const ListingSubNav: React.FC<ListingSubNavProps> = ({
  photoCount = 0,
  videoCount = 0,
  commentCount = 0
}) => {
  const [activeSection, setActiveSection] = useState<string>('overview');

  const navItems = [
    { id: 'overview', label: 'Overview', icon: FileText },
    { id: 'specs', label: 'Specifications', icon: Sliders },
    { id: 'showcase', label: 'Showcase Chapters', icon: Layers },
    { id: 'gallery', label: 'Photo Gallery', icon: Camera, badge: photoCount > 0 ? `${photoCount}` : undefined },
    { id: 'videos', label: 'Video Series', icon: Film, badge: videoCount > 0 ? `${videoCount}` : undefined },
    { id: 'qa', label: 'Community & Q&A', icon: MessageSquare, badge: commentCount > 0 ? `${commentCount}` : undefined },
  ];

  // Scroll listener to update active section smoothly
  useEffect(() => {
    const handleScroll = () => {
      const scrollPos = window.scrollY + 170; // offset for sticky headers

      for (let i = navItems.length - 1; i >= 0; i--) {
        const item = navItems[i];
        const el = document.getElementById(item.id);
        if (el) {
          const top = el.offsetTop;
          if (scrollPos >= top) {
            setActiveSection(item.id);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [navItems]);

  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    const el = document.getElementById(sectionId);
    if (el) {
      const yOffset = -148; // 94px main navbar + 48px subnav + 6px breathing room
      const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  return (
    <nav 
      aria-label="Listing Navigation" 
      className="sticky top-[86px] sm:top-[94px] z-30 bg-[#151a1e]/98 backdrop-blur-md border-b border-zinc-800 shadow-md transition-all"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between overflow-x-auto scrollbar-none py-2 gap-1.5 sm:gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToSection(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex-shrink-0 select-none ${
                  isActive
                    ? 'bg-red-700 text-white shadow-sm ring-1 ring-red-500/50'
                    : 'text-zinc-300 hover:text-white hover:bg-zinc-800/70'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono leading-none ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-zinc-800 text-zinc-400 border border-zinc-700/60'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
