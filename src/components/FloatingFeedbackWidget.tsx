import React from 'react';
import { MessageSquarePlus } from 'lucide-react';

export interface FloatingFeedbackWidgetProps {
  enabled?: boolean;
  label?: string;
  badgeText?: string;
  onOpenFeedback: () => void;
  isSingleLotPage?: boolean;
}

export const FloatingFeedbackWidget: React.FC<FloatingFeedbackWidgetProps> = ({
  enabled = true,
  label,
  badgeText,
  onOpenFeedback,
  isSingleLotPage = false
}) => {
  if (!enabled) {
    return null;
  }

  const displayLabel = label?.trim() || 'Feedback & Bug Report';

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    onOpenFeedback();
  };

  return (
    <div
      className={`fixed z-40 transition-all duration-300 pointer-events-auto ${
        isSingleLotPage
          ? 'bottom-24 right-4 sm:bottom-6 sm:right-6'
          : 'bottom-6 right-4 sm:bottom-6 sm:right-6'
      }`}
    >
      <button
        type="button"
        onClick={handleClick}
        className="group flex items-center gap-2 px-3.5 py-2 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 hover:border-amber-500/60 text-slate-200 hover:text-white shadow-2xl backdrop-blur-md transition-all duration-200 text-xs font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/50"
        aria-label={displayLabel}
      >
        <MessageSquarePlus className="w-4 h-4 text-amber-500 transition-transform duration-200 group-hover:scale-110" />
        <span>{displayLabel}</span>
        {badgeText && (
          <span className="px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
            {badgeText}
          </span>
        )}
      </button>
    </div>
  );
};

export default FloatingFeedbackWidget;
