import React, { useState, useEffect } from 'react';
import { 
  X, 
  HelpCircle, 
  ShoppingBag, 
  Tag, 
  ShieldCheck, 
  Banknote, 
  Clock, 
  FileCheck, 
  UserCheck, 
  CheckCircle2, 
  AlertCircle, 
  Car, 
  Scale 
} from 'lucide-react';

export type HowItWorksTab = 'buying' | 'selling' | 'trust';

interface HowItWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: HowItWorksTab;
}

export const HowItWorksModal: React.FC<HowItWorksModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'buying'
}) => {
  const [activeTab, setActiveTab] = useState<HowItWorksTab>(initialTab);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);

      return () => {
        document.body.style.overflow = originalOverflow || '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-slate-900 text-white border border-slate-700/60 shadow-2xl overflow-hidden"
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                How Wailtail Works
              </h2>
              <p className="text-xs text-slate-400">
                Transparent Peer-to-Peer Collector Vehicle Auctions
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-900/90 px-5 pt-2 flex-shrink-0 gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('buying')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'buying'
                ? 'border-amber-500 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Buying on Wailtail</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('selling')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'selling'
                ? 'border-amber-500 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <Tag className="w-4 h-4" />
            <span>Selling on Wailtail</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('trust')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'trust'
                ? 'border-amber-500 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Trust & Security</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="overflow-y-auto p-5 sm:p-7 space-y-6 text-xs sm:text-sm text-slate-300 leading-relaxed flex-1">
          {activeTab === 'buying' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-3">
                <Banknote className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-amber-300 font-bold mb-0.5">
                    0% Buyer Fees — True Enthusiast Retail Pricing
                  </strong>
                  Unlike conventional auction sites that quietly bill buyers 5% to 15% on top of the hammer price, Wailtail charges winning bidders exactly zero platform commission.
                </div>
              </div>

              <section className="space-y-2">
                <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base">
                  <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs text-amber-400 font-mono">1</span>
                  <h3>Register & Place Your Bids (CAD)</h3>
                </div>
                <p className="pl-8 text-slate-300">
                  Create a free member account and verify your email. All bids are placed in Canadian Dollars (CAD) in real time. Bid increments adjust dynamically with the current high bid, ensuring a smooth and competitive auction room.
                </p>
              </section>

              <section className="space-y-2">
                <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base">
                  <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs text-amber-400 font-mono">2</span>
                  <h3>Soft-Close Anti-Sniping Protection</h3>
                </div>
                <p className="pl-8 text-slate-300">
                  Every enthusiast gets a fair shot. Any verified bid placed in the final 2 minutes resets the countdown timer back to 2 minutes, preventing automated bots from sniping lots at the last fraction of a second.
                </p>
              </section>

              <section className="space-y-2">
                <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base">
                  <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs text-amber-400 font-mono">3</span>
                  <h3>Direct Private Settlement With Seller</h3>
                </div>
                <p className="pl-8 text-slate-300">
                  When you win, we immediately connect you directly with the verified seller. You coordinate funds transfer (certified cheque, wire transfer, or bank draft) and vehicle pickup/shipping offline within 3 business days. No middleman hold-backs, markups, or handling charges.
                </p>
              </section>
            </div>
          )}

          {activeTab === 'selling' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-700/50 text-emerald-200 text-xs flex items-start gap-3">
                <Tag className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-emerald-300 font-bold mb-0.5">
                    Zero Seller Listing Fees & 100% Proceeds Retention
                  </strong>
                  Consigning on Wailtail is 100% free of hidden consignment cuts. You set your reserve threshold and receive every single dollar of the agreed sale directly from the buyer.
                </div>
              </div>

              <section className="space-y-2">
                <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base">
                  <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs text-amber-400 font-mono">1</span>
                  <h3>Submit Your Consignment Application</h3>
                </div>
                <p className="pl-8 text-slate-300">
                  Submit your vehicle details, VIN, photos, documentation, and reserve expectation through our streamlined consignment drawer. Our curation team reviews submissions within 24–48 hours to ensure provenance and presentation standards.
                </p>
              </section>

              <section className="space-y-2">
                <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base">
                  <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs text-amber-400 font-mono">2</span>
                  <h3>Curated Single-Car Showcase & Community Engagement</h3>
                </div>
                <p className="pl-8 text-slate-300">
                  Your car receives a dedicated, high-impact auction page complete with interactive multi-angle galleries, YouTube walk-arounds, spec breakdowns, and a live Q&A comment section where you can address questions directly from verified bidders.
                </p>
              </section>

              <section className="space-y-2">
                <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base">
                  <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs text-amber-400 font-mono">3</span>
                  <h3>Private Peer-to-Peer Settlement</h3>
                </div>
                <p className="pl-8 text-slate-300">
                  Once your reserve is met and the hammer drops, you receive the winning buyer’s contact details to arrange direct payment and transfer ownership papers (Bill of Sale / title) safely and straightforwardly.
                </p>
              </section>
            </div>
          )}

          {activeTab === 'trust' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-700/50 text-blue-200 text-xs flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-blue-300 font-bold mb-0.5">
                    Private Retail Marketplace — Clear Boundaries & Integrity
                  </strong>
                  Wailtail connects private buyers and sellers directly. We are a retail discovery and auction communications platform, not an intermediary wholesale dealer or wholesale auction house.
                </div>
              </div>

              <section className="space-y-2">
                <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base">
                  <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs text-amber-400 font-mono">1</span>
                  <h3>Private Retail Model (No Wholesale Arbitration)</h3>
                </div>
                <p className="pl-8 text-slate-300">
                  Unlike wholesale dealer auctions (e.g. Manheim, ADESA) that utilize post-sale dealer arbitration boards and condition guarantees, Wailtail operates as a private consumer retail marketplace. All sales are strictly private peer-to-peer transactions between consenting enthusiasts.
                </p>
              </section>

              <section className="space-y-2">
                <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base">
                  <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs text-amber-400 font-mono">2</span>
                  <h3>As-Is Condition & Pre-Purchase Inspections</h3>
                </div>
                <p className="pl-8 text-slate-300">
                  Vehicles are offered "As-Is, Where-Is". We encourage all bidders to review comprehensive high-resolution photography, video walk-arounds, and historical invoices, as well as schedule third-party pre-purchase inspections (PPI) prior to auction conclusion.
                </p>
              </section>

              <section className="space-y-2">
                <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base">
                  <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs text-amber-400 font-mono">3</span>
                  <h3>OMVIC & Regulatory Transparency</h3>
                </div>
                <p className="pl-8 text-slate-300">
                  Wailtail does not take vehicle custody, hold dealer inventory, or act as an automotive dealer under provincial statutes (such as Ontario's OMVIC). Private sales enjoy direct ownership transfer between buyer and seller with complete clarity and zero broker markup.
                </p>
              </section>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:px-6 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-400 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-[11px] text-slate-400">Canadian Collector Automotive Platform</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default HowItWorksModal;
