import React from 'react';
import { ShieldCheck, Info, Heart } from 'lucide-react';
import { WailtailLogo } from './WailtailLogo';

interface FooterProps {
  vehicleTitle?: string;
  siteLogo?: string;
  siteName?: string;
  siteTagline?: string;
}

export const Footer: React.FC<FooterProps> = ({ 
  vehicleTitle,
  siteLogo,
  siteName,
  siteTagline
}) => {
  const brandName = siteName || 'wailtail';
  const tagline = siteTagline || 'Single-Car Auctions';

  return (
    <footer className="bg-[#121619] text-zinc-400 text-xs border-t border-zinc-800 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Dynamic Brand info synchronized with Firestore Branding */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {siteLogo && siteLogo.trim() !== '' ? (
                <img
                  src={siteLogo}
                  alt={brandName}
                  className="h-8 max-h-8 w-auto object-contain flex-shrink-0"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <WailtailLogo className="h-8 max-h-8 w-auto object-contain flex-shrink-0" theme="dark" variant="icon" />
              )}
              
              <div className="flex flex-col">
                <span className="text-white font-serif font-bold text-base tracking-tight uppercase leading-none">
                  {brandName}
                </span>
                <span className="text-[10px] text-zinc-400 font-medium tracking-wider uppercase mt-1">
                  {tagline}
                </span>
              </div>
            </div>
            
            <p className="text-zinc-400 text-xs leading-relaxed">
              Curated single-car private auction platform honoring iconic air-cooled motorsport classics and the legendary Porsche Whale Tail aerodynamic lineage.
            </p>
            <div className="text-[11px] text-zinc-500">
              Private collector auction direct from seller. Zero buyer commission.
            </div>
          </div>

          {/* Settlement & Bidding Policy */}
          <div className="space-y-2">
            <h4 className="text-zinc-200 font-bold uppercase tracking-wider text-xs flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Private Auction Terms</span>
            </h4>
            <p className="text-zinc-400 text-xs leading-relaxed">
              <strong>No Buyer's Fees:</strong> Unlike commercial auction houses that charge 5% fees, this private auction charges 0% buyer commission. Winning bidder coordinates direct funds transfer and vehicle transport with the seller offline.
            </p>
          </div>

          {/* Anti-Sniping & Integrity */}
          <div className="space-y-2">
            <h4 className="text-zinc-200 font-bold uppercase tracking-wider text-xs flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-amber-400" />
              <span>Fair Bidding Integrity</span>
            </h4>
            <p className="text-zinc-400 text-xs leading-relaxed">
              Equipped with a 2-minute anti-sniping reset timer. Email verification ensures legitimate enthusiast bids. All bids and comments synchronize in real-time across Firestore.
            </p>
          </div>
        </div>

        <div className="pt-8 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-zinc-500">
          <div>
            © {new Date().getFullYear()} {brandName.toUpperCase()}. Featured Vehicle: {vehicleTitle || "1978 Porsche 911 Turbo-Look 'Whale Tail'"}.
          </div>
          <div className="flex items-center gap-4">
            <a href="https://wailtail.com/featured/" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300 underline underline-offset-4">
              wailtail.com/featured
            </a>
            <span>•</span>
            <span>Vancouver / Calgary</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
