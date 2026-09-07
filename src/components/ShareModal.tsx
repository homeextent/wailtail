import React, { useState } from 'react';
import { X, Copy, Check, Share2, MessageCircle, Mail } from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  title
}) => {
  const [copied, setCopied] = useState(false);
  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden"
      >
        <div className="bg-[#121619] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-red-500" />
            <h3 className="text-base font-bold">Share This Auction</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-zinc-600">
            Share the live auction link for <strong>{title}</strong> with Porsche enthusiasts and collectors.
          </p>

          <div>
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
              Auction Link
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={currentUrl}
                className="flex-1 px-3 py-2 text-xs border border-zinc-300 rounded-lg bg-zinc-50 font-mono text-zinc-700 select-all"
              />
              <button
                onClick={handleCopy}
                className="px-3.5 py-2 bg-zinc-900 hover:bg-black text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-zinc-200 flex items-center justify-between text-xs text-zinc-500">
            <span>Private Vehicle Listing</span>
            <span>wailtail.com</span>
          </div>
        </div>
      </div>
    </div>
  );
};
