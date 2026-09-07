import React from 'react';

interface WailtailLogoProps {
  className?: string;
  variant?: 'full' | 'icon-only';
  theme?: 'light' | 'dark' | 'color';
}

export const WailtailLogo: React.FC<WailtailLogoProps> = ({
  className = 'h-10 max-h-10 w-auto',
  variant = 'full',
  theme = 'dark'
}) => {
  // Colors based on theme
  const markColor = theme === 'dark' ? '#ffffff' : theme === 'color' ? '#42327d' : '#18181b';
  const textColor = theme === 'dark' ? '#ffffff' : theme === 'color' ? '#3c2b78' : '#18181b';
  const accentLine = theme === 'dark' ? 'rgba(255,255,255,0.45)' : 'rgba(60,43,120,0.45)';

  if (variant === 'icon-only') {
    return (
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`max-h-10 w-auto aspect-square flex-shrink-0 object-contain ${className}`}
      >
        {/* Flukes & Curved Body */}
        <path
          d="M18 12C28 12 40 22 45 32C50 22 62 12 72 12C78 12 84 15 84 22C84 34 68 45 54 46C53 58 60 67 71 67C79 67 85 61 86 54C88 54 90 56 90 59C88 72 78 82 65 82C48 82 40 68 42 50C43 41 46 34 49 28C43 23 34 18 24 18C18 18 12 21 12 25C12 32 20 40 30 44C28 47 24 51 20 54C11 47 4 37 4 27C4 18 10 12 18 12Z"
          fill={markColor}
        />
        {/* Lower Concentric Ring */}
        <circle cx="66" cy="67" r="14" stroke={markColor} strokeWidth="6" fill="none" />
        <circle cx="66" cy="67" r="6" fill={markColor} />
      </svg>
    );
  }

  return (
    <div className={`flex items-center gap-2.5 select-none max-h-10 flex-shrink-0 ${className}`}>
      {/* Whale Tail Icon Emblem */}
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-9 sm:h-10 max-h-10 w-auto aspect-square flex-shrink-0 object-contain"
      >
        {/* Fluke Tail */}
        <path
          d="M16 10C27 10 39 20 45 30C51 20 63 10 74 10C81 10 87 14 87 21C87 33 71 43 56 45C55 56 61 66 73 66C81 66 87 60 88 53C91 53 92 56 92 59C90 73 79 84 65 84C48 84 39 70 41 51C42 41 46 33 49 27C43 22 34 17 23 17C17 17 11 20 11 24C11 31 18 39 28 43C26 46 22 50 18 53C9 46 3 36 3 26C3 17 9 10 16 10Z"
          fill={markColor}
        />
        {/* Inner Hub/Wheel Ring */}
        <circle cx="67" cy="68" r="15" stroke={markColor} strokeWidth="6.5" fill="none" />
        <circle cx="67" cy="68" r="6" fill={markColor} />
      </svg>

      {/* Horizontal Speedline Connector & Wordmark */}
      <div className="flex flex-col justify-center flex-shrink-0">
        <div className="flex items-center relative">
          <span 
            className="font-black italic tracking-tight text-xl sm:text-2xl leading-none font-sans whitespace-nowrap"
            style={{ 
              color: textColor,
              letterSpacing: '-0.04em'
            }}
          >
            wailtail
          </span>
        </div>
        <span 
          className="text-[9px] uppercase tracking-[0.22em] font-semibold -mt-0.5 whitespace-nowrap"
          style={{ color: theme === 'dark' ? '#a1a1aa' : '#71717a' }}
        >
          Single-Car Auctions
        </span>
      </div>
    </div>
  );
};
