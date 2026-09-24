import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, FileText, Scale, Lock, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'terms' | 'privacy';
}

export const LegalModal: React.FC<LegalModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'terms'
}) => {
  const [activeTab, setActiveTab] = useState<'terms' | 'privacy'>(initialTab);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow || '';
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-[#121619] text-white border border-zinc-800 shadow-2xl overflow-hidden"
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-zinc-800 bg-[#0d1114] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-950 border border-emerald-700/60 flex items-center justify-center text-emerald-400">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Platform Legal & Compliance
              </h2>
              <p className="text-xs text-zinc-400">
                Wailtail Classic & Collector Automobile Auctions
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-800 bg-[#151a1e] px-5 pt-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'terms'
                ? 'border-emerald-500 text-emerald-400 bg-emerald-950/20'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Terms of Service</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'privacy'
                ? 'border-emerald-500 text-emerald-400 bg-emerald-950/20'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>Privacy Policy (PIPEDA)</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="overflow-y-auto p-5 sm:p-7 space-y-6 text-xs sm:text-sm text-zinc-300 leading-relaxed flex-1">
          {activeTab === 'terms' ? (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/50 text-emerald-200 text-xs flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-emerald-300 font-bold mb-0.5">
                    Canadian Marketplace Protocol (CAD Bidding & 0% Buyer Fees)
                  </strong>
                  Wailtail provides a transparent, peer-to-peer enthusiast platform. Bids are denominated in Canadian Dollars (CAD) and all platform settlements follow verified direct protocols.
                </div>
              </div>

              {/* 1. Legally Binding Bids */}
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base">
                  <span className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-300 font-mono">1</span>
                  <h3>Legally Binding Bids</h3>
                </div>
                <p className="pl-8 text-zinc-300">
                  Every bid placed on Wailtail constitutes an irrevocable, legally binding offer to purchase the vehicle at the specified CAD amount. Once submitted, a bid cannot be retracted, canceled, or reduced under any circumstances. If your bid is the highest bid at the close of the auction and meets or exceeds the seller's reserve price (if applicable), you are legally obligated to complete the vehicle purchase.
                </p>
              </section>

              {/* 2. Zero Buyer Premiums & Direct Offline Settlement */}
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base">
                  <span className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-300 font-mono">2</span>
                  <h3>Zero Buyer Premiums & Direct Offline Settlement</h3>
                </div>
                <p className="pl-8 text-zinc-300">
                  Wailtail charges 0% buyer commission. Unlike traditional auction houses that impose a 5% to 15% surcharge on winning bidders, Wailtail does not levy buyer premiums. Winning bidders settle payment and logistics directly offline with the seller within <strong>3 business days</strong> following auction conclusion. Accepted payment methods typically include wire transfer, bank draft, certified cheque, or in-person escrow arranged mutually between buyer and seller.
                </p>
              </section>

              {/* 3. As-Is Inspection Disclaimer */}
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base">
                  <span className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-300 font-mono">3</span>
                  <h3>As-Is, Where-Is Inspection Disclaimer</h3>
                </div>
                <p className="pl-8 text-zinc-300">
                  All vehicles featured on Wailtail are auctioned strictly <strong>"As-Is, Where-Is"</strong> with all faults, known or unknown. Wailtail does not physically inspect, test-drive, or warrant vehicles. Bidders are solely responsible for reviewing vehicle descriptions, photo galleries, video walk-arounds, historical documentation, and conducting independent pre-purchase inspections (PPI) prior to placing any bid. Wailtail makes no warranties or representations regarding roadworthiness, mechanical condition, originality, or accuracy of odometer readings.
                </p>
              </section>

              {/* 4. Consignor Warranties */}
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base">
                  <span className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-300 font-mono">4</span>
                  <h3>Consignor Warranties & Title Representations</h3>
                </div>
                <p className="pl-8 text-zinc-300">
                  Consignors submitting vehicles for auction represent and warrant that they possess clean, marketable title or certified legal authority to sell the vehicle free and clear of all undisclosed liens, encumbrances, and adverse claims. Consignors must provide truthful, complete, and accurate disclosure of vehicle defects, historical accidents, and registration status. Breach of consignor representations is subject to civil remedy and permanent expulsion from the platform.
                </p>
              </section>

              {/* 5. Soft-Close Anti-Sniping Protocol */}
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base">
                  <span className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-300 font-mono">5</span>
                  <h3>Anti-Sniping Clock Reset Protocol</h3>
                </div>
                <p className="pl-8 text-zinc-300">
                  To preserve fair bidding dynamics, any verified bid submitted within the final two (2) minutes of an auction will reset the remaining timer to two (2) minutes. The auction will conclude only after two consecutive minutes elapse without a competing bid.
                </p>
              </section>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-800/50 text-blue-200 text-xs flex items-start gap-3">
                <Lock className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-blue-300 font-bold mb-0.5">
                    PIPEDA & Canadian Privacy Compliance
                  </strong>
                  Wailtail is committed to safeguarding personal information in full compliance with Canada's <em>Personal Information Protection and Electronic Documents Act (PIPEDA)</em> and applicable provincial privacy statutes.
                </div>
              </div>

              {/* 1. Data Collection */}
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base">
                  <span className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-300 font-mono">1</span>
                  <h3>Information We Collect</h3>
                </div>
                <p className="pl-8 text-zinc-300">
                  Wailtail collects personal information strictly necessary to operate a secure collector vehicle auction platform. This includes contact details (full legal name, email address, telephone number, and municipal location), account verification telemetry, vehicle identification numbers (VINs), consignment documentation, and an immutable log of all bidding actions, timestamps, and public comments.
                </p>
              </section>

              {/* 2. Third-Party Disclosures & Offline Settlement */}
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base">
                  <span className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-300 font-mono">2</span>
                  <h3>Third-Party Disclosures & Winner Contact Sharing</h3>
                </div>
                <p className="pl-8 text-zinc-300">
                  Wailtail does not sell, rent, or trade your personal information to third-party marketers. Upon the successful conclusion of an auction meeting reserve, the winning bidder's verified contact information (full name, phone number, and email) is shared strictly and exclusively with the verified seller to facilitate vehicle settlement, title transfer, and transport logistics.
                </p>
              </section>

              {/* 3. Web Push & FCM Tokens */}
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base">
                  <span className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-300 font-mono">3</span>
                  <h3>Web Push & Firebase Cloud Messaging (FCM) Tokens</h3>
                </div>
                <p className="pl-8 text-zinc-300">
                  When you grant notification permissions, Wailtail generates a unique Firebase Cloud Messaging (FCM) device token. This cryptographic token is used exclusively to dispatch real-time transactional push alerts, such as immediate notifications when your bid has been outbid, when watched lots enter their final closing minutes, or when new official answers are posted by consignors. You may revoke push notification access at any time through your browser or device settings.
                </p>
              </section>

              {/* 4. Data Retention & Access Rights */}
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base">
                  <span className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-300 font-mono">4</span>
                  <h3>Data Retention & User Rights Under PIPEDA</h3>
                </div>
                <p className="pl-8 text-zinc-300">
                  Auction transaction records and historical bids are preserved as public immutable records of provenance. Under PIPEDA, Canadian users have the right to request access to their personal information, request corrections, or request account deactivation by contacting Wailtail administration.
                </p>
              </section>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:px-6 border-t border-zinc-800 bg-[#0d1114] flex items-center justify-between text-xs text-zinc-400 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] text-zinc-400">Effective Date: September 2026</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default LegalModal;
