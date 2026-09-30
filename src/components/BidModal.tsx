import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Auction } from '../types';
import { placeBid } from '../services/auctionService';
import { formatCurrency } from '../utils/formatters';
import confetti from 'canvas-confetti';
import { 
  X, 
  Gavel, 
  ShieldAlert, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  LogIn, 
  Mail, 
  ArrowRight,
  Flame,
  Info
} from 'lucide-react';

interface BidModalProps {
  isOpen: boolean;
  onClose: () => void;
  auction: Auction;
  onOpenAuth: () => void;
  onOpenLegalModal?: (tab: 'terms' | 'privacy') => void;
}

export const BidModal: React.FC<BidModalProps> = ({
  isOpen,
  onClose,
  auction,
  onOpenAuth,
  onOpenLegalModal
}) => {
  const { user, userProfile, isEmailVerified, manualVerifyForDemo } = useAuth();
  
  const hasZeroBids = (auction.bidCount ?? 0) === 0;
  const minRequired = hasZeroBids
    ? (auction.startingBid || 1000)
    : (auction.currentBid + auction.minimumIncrement);

  const [step, setStep] = useState<'input' | 'submitting' | 'success'>('input');
  const [bidAmount, setBidAmount] = useState<number>(minRequired);
  const [hasAgreedToTerms, setHasAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    amount: number;
    antiSniped?: boolean;
    reserveMet?: boolean;
  } | null>(null);

  const prevIsOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      // Clean modal opening: initialize state to input
      setStep('input');
      setBidAmount(minRequired);
      setHasAgreedToTerms(false);
      setError(null);
      setSuccessResult(null);
      setLoading(false);
    } else if (isOpen) {
      // Modal is already open
      // Block real-time Firestore onSnapshot background updates from auto-resetting
      // or closing the modal while in 'success' or 'submitting' state!
      if (step === 'input') {
        setBidAmount((prev) => (prev < minRequired ? minRequired : prev));
      }
    } else {
      // Clean dismissal: reset step back to input
      setStep('input');
      setError(null);
      setSuccessResult(null);
      setLoading(false);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, minRequired, step]);

  if (!isOpen) return null;

  const handleIncrement = (inc: number) => {
    setBidAmount((prev) => {
      const base = prev < minRequired ? minRequired : prev;
      return base + inc;
    });
  };

  const handleSetDirect = (amount: number) => {
    setBidAmount(amount);
  };

  const handleSubmitBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userProfile) {
      setError('You must be signed in to bid.');
      return;
    }
    if (!isEmailVerified) {
      setError('Email verification required before placing a bid.');
      return;
    }
    if (bidAmount < minRequired) {
      setError(`Minimum bid required is ${formatCurrency(minRequired)}.`);
      return;
    }
    if (!hasAgreedToTerms) {
      setError('Please agree to Wailtail\'s Terms of Service and Privacy Policy.');
      return;
    }

    setError(null);
    setLoading(true);
    setStep('submitting');

    try {
      const result = await placeBid(auction.id, bidAmount, {
        uid: user.uid,
        displayName: userProfile.displayName || user.displayName || 'Verified Bidder',
        email: user.email || ''
      });

      setLoading(false);

      // Trigger active Confetti burst
      try {
        confetti({
          particleCount: 100,
          spread: 80,
          origin: { y: 0.6 }
        });
      } catch (e) {
        // ignore
      }

      setSuccessResult({
        amount: bidAmount,
        antiSniped: result.antiSniped,
        reserveMet: bidAmount >= auction.reserveAmount || auction.isReserveMet
      });
      setStep('success');
    } catch (err: any) {
      setLoading(false);
      setStep('input');
      setError(err.message || 'Failed to place bid. Please try again.');
    }
  };

  const handleResetAndClose = () => {
    setStep('input');
    setSuccessResult(null);
    setError(null);
    setHasAgreedToTerms(false);
    setLoading(false);
    onClose();
  };

  return (
    <div 
      onClick={handleResetAndClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden"
      >
        {/* Header */}
        <div className="bg-[#121619] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-emerald-600 flex items-center justify-center font-black text-sm">
              <Gavel className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">
                {step === 'success' ? 'Bid Confirmed' : `Place a Bid on ${auction.title || 'Vehicle Listing'}`}
              </h2>
              <p className="text-xs text-zinc-400">Live Single-Car Auction</p>
            </div>
          </div>
          <button
            onClick={handleResetAndClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Close Bid Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* STEP 1: SUCCESS CONFIRMATION VIEW */}
          {step === 'success' && successResult ? (
            <div className="text-center py-3 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center shadow-inner ring-4 ring-emerald-500/20">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <span className="text-xs uppercase font-extrabold tracking-wider text-emerald-600">
                  Transaction Confirmed
                </span>
                <h3 className="text-2xl sm:text-3xl font-black text-zinc-900 mt-0.5">
                  Bid Placed Successfully!
                </h3>
                <div className="text-3xl sm:text-4xl font-black text-emerald-600 font-mono mt-2">
                  {formatCurrency(successResult.amount)} CAD
                </div>
              </div>

              <div className="flex items-center justify-center">
                <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-black uppercase tracking-wider shadow-xs">
                  <span>★ LEADING BIDDER</span>
                </div>
              </div>

              {/* Anti-Snipe Countdown Status */}
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-left text-xs text-amber-950 flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-bold text-amber-900">
                    {successResult.antiSniped
                      ? '⚡ Anti-Sniping Protection Triggered (+2:00)'
                      : '⚡ 2-Minute Anti-Sniping Protection Active'}
                  </div>
                  <p className="text-amber-800/90 text-[11px] leading-relaxed">
                    {successResult.antiSniped
                      ? 'Your bid was recorded in the closing window. The auction countdown timer has been extended back to 2 full minutes.'
                      : 'Any counter-bids placed in the final 2 minutes will automatically reset the countdown clock to 2 minutes.'}
                  </p>
                </div>
              </div>

              {successResult.reserveMet && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 font-bold flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>RESERVE HAS BEEN MET — VEHICLE WILL SELL TO HIGH BIDDER</span>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleResetAndClose}
                  className="w-full py-3.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-black uppercase tracking-wider shadow-lg shadow-emerald-700/20 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Done / Return to Auction</span>
                </button>
              </div>
            </div>
          ) : !user ? (
            /* CASE 2: NOT SIGNED IN */
            <div className="text-center py-4 space-y-4">
              <div className="w-12 h-12 rounded-full bg-zinc-100 text-zinc-700 mx-auto flex items-center justify-center">
                <LogIn className="w-6 h-6" />
              </div>

              <div>
                <h3 className="text-base font-bold text-zinc-900">
                  Registered Account Required
                </h3>
                <p className="text-xs text-zinc-600 mt-1 max-w-sm mx-auto">
                  To place a bid, you must sign in with your verified bidder account or register in under 30 seconds.
                </p>
              </div>

              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg text-left text-xs text-zinc-600 space-y-1">
                <div className="font-semibold text-zinc-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Private Single-Car Auction Protocol</span>
                </div>
                <p>• Zero buyer or platform fees.</p>
                <p>• Email verification prevents fraudulent bids.</p>
                <p>• Offline settlement directly with the seller.</p>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAuth();
                  }}
                  className="w-full py-2.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-bold shadow flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Sign In / Register to Bid</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2 rounded-lg text-zinc-500 hover:text-zinc-800 text-xs font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : !isEmailVerified ? (
            /* CASE 3: SIGNED IN BUT NOT VERIFIED */
            <div className="text-center py-4 space-y-4">
              <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 mx-auto flex items-center justify-center">
                <Mail className="w-6 h-6" />
              </div>

              <div>
                <h3 className="text-base font-bold text-zinc-900">
                  Email Verification Required
                </h3>
                <p className="text-xs text-zinc-600 mt-1 max-w-sm mx-auto">
                  Your account (<span className="font-bold text-zinc-800">{user.email}</span>) must be email verified before placing bids on this vehicle.
                </p>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 text-left">
                Check your inbox for the verification email sent during signup, or verify instantly below.
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    await manualVerifyForDemo();
                  }}
                  className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verify Email for This Session</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAuth();
                  }}
                  className="w-full py-2 rounded-lg border border-zinc-300 hover:bg-zinc-50 text-zinc-700 text-xs font-semibold"
                >
                  Open Verification Screen
                </button>
              </div>
            </div>
          ) : (
            /* CASE 4: VERIFIED BIDDER — BID FORM */
            <form onSubmit={handleSubmitBid} className="space-y-5">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Auction Status Highlights */}
              <div className="grid grid-cols-2 gap-3 bg-zinc-50 p-3.5 rounded-xl border border-zinc-200 text-xs">
                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase font-semibold">
                    {hasZeroBids ? 'Opening Bid' : 'Current High Bid'}
                  </span>
                  <span className="text-xl font-extrabold text-zinc-900 font-mono">
                    {formatCurrency(hasZeroBids ? (auction.startingBid || minRequired) : auction.currentBid)}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Minimum Required</span>
                  <span className="text-xl font-extrabold text-emerald-700 font-mono">
                    {formatCurrency(minRequired)}
                  </span>
                </div>
              </div>

              {/* Bid Amount Input */}
              <div>
                <label className="block text-xs font-bold text-zinc-800 uppercase tracking-wider mb-1.5">
                  Your Bid Amount ({auction.currency || 'CAD'})
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold text-zinc-500">$</span>
                  <input
                    type="number"
                    min={minRequired}
                    step={auction.minimumIncrement}
                    required
                    value={bidAmount}
                    onChange={(e) => setBidAmount(Number(e.target.value))}
                    className="w-full pl-8 pr-4 py-2.5 text-xl font-bold font-mono text-zinc-900 border-2 border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                  />
                </div>
                <div className="text-[11px] text-zinc-500 mt-1 flex items-center justify-between">
                  <span>Minimum Increment: +{formatCurrency(auction.minimumIncrement)}</span>
                  <span>Bidding as: <strong className="text-zinc-700">{userProfile?.displayName}</strong></span>
                </div>
              </div>

              {/* Quick Increment Buttons */}
              <div>
                <span className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">
                  Quick Add Increments
                </span>
                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSetDirect(minRequired)}
                    className="py-1.5 px-2 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold border border-zinc-300 transition-colors"
                  >
                    Min ({formatCurrency(minRequired)})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleIncrement(500)}
                    className="py-1.5 px-2 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold border border-zinc-300 transition-colors"
                  >
                    +$500
                  </button>
                  <button
                    type="button"
                    onClick={() => handleIncrement(1000)}
                    className="py-1.5 px-2 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold border border-zinc-300 transition-colors"
                  >
                    +$1,000
                  </button>
                  <button
                    type="button"
                    onClick={() => handleIncrement(2500)}
                    className="py-1.5 px-2 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold border border-zinc-300 transition-colors"
                  >
                    +$2,500
                  </button>
                </div>
              </div>

              {/* Anti-Sniping Policy Box */}
              <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-lg text-[11px] text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-900">
                  <Clock className="w-3.5 h-3.5 text-amber-700" />
                  <span>2-Minute Anti-Sniping Protection</span>
                </div>
                <p>
                  Any bid placed in the final 2 minutes will automatically reset the remaining clock back to 2 minutes. The auction will not end until 2 full minutes pass without a bid.
                </p>
              </div>

              {/* Terms Agreement */}
              <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800">
                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={hasAgreedToTerms}
                    onChange={(e) => setHasAgreedToTerms(e.target.checked)}
                    className="mt-0.5 rounded border-zinc-700 bg-zinc-900 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span>
                    I agree to Wailtail's <button type="button" onClick={() => onOpenLegalModal?.('terms')} className="underline text-emerald-400 cursor-pointer">Terms of Service</button> and <button type="button" onClick={() => onOpenLegalModal?.('privacy')} className="underline text-emerald-400 cursor-pointer">Privacy Policy</button>, and acknowledge that this bid of <strong>{formatCurrency(bidAmount)} CAD</strong> is a legally binding commitment.
                  </span>
                </label>
              </div>

              {/* Submit Bid Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading || !hasAgreedToTerms || bidAmount < minRequired}
                  className={`w-full py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all ${
                    loading || !hasAgreedToTerms || bidAmount < minRequired
                      ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white hover:scale-[1.01] active:scale-[0.99] cursor-pointer'
                  }`}
                >
                  <Gavel className="w-4 h-4" />
                  <span>
                    {loading ? 'Submitting Bid...' : `Confirm Bid: ${formatCurrency(bidAmount)}`}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
