import React, { useState } from 'react';
import { 
  X, 
  Car, 
  CheckCircle, 
  ShieldCheck, 
  Sparkles, 
  DollarSign, 
  Camera, 
  FileText, 
  ArrowRight,
  Send,
  AlertCircle
} from 'lucide-react';
import { ConsignmentApplication, UserProfile } from '../types';
import { submitConsignmentApplication } from '../services/auctionService';
import { useAuth } from '../context/AuthContext';

interface ConsignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchDirectListing?: () => void;
}

export const ConsignmentModal: React.FC<ConsignmentModalProps> = ({
  isOpen,
  onClose,
  onLaunchDirectListing
}) => {
  const { user } = useAuth();
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [vin, setVin] = useState('');
  const [mileage, setMileage] = useState('');
  const [transmission, setTransmission] = useState('Manual');
  const [location, setLocation] = useState('');
  const [reserveExpectation, setReserveExpectation] = useState('');
  const [sellerName, setSellerName] = useState('');
  const [sellerEmail, setSellerEmail] = useState('');
  const [sellerPhone, setSellerPhone] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!year || !make || !model || !sellerName || !sellerEmail) {
      setErrorMsg('Please complete all required fields (Year, Make, Model, Seller Name, and Email).');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      await submitConsignmentApplication({
        year: year.trim(),
        make: make.trim(),
        model: model.trim(),
        vin: vin.trim(),
        mileage: mileage.trim(),
        transmission,
        location: location.trim(),
        reserveExpectation: reserveExpectation.trim(),
        sellerName: sellerName.trim(),
        sellerEmail: sellerEmail.trim(),
        sellerPhone: sellerPhone.trim(),
        notes: notes.trim()
      });

      setSubmitted(true);
    } catch (err: any) {
      console.error('Error submitting consignment application:', err);
      setErrorMsg(err.message || 'Failed to submit consignment. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSubmitted(false);
    setYear('');
    setMake('');
    setModel('');
    setVin('');
    setMileage('');
    setTransmission('Manual');
    setLocation('');
    setReserveExpectation('');
    setSellerName('');
    setSellerEmail('');
    setSellerPhone('');
    setNotes('');
    setErrorMsg(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Modal Header */}
        <div className="bg-[#121619] text-white px-6 py-5 flex items-center justify-between border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-700 flex items-center justify-center text-white shadow-inner font-bold">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Sell Your Vehicle with Wailtail
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-emerald-950 text-emerald-300 border border-emerald-800">
                  0% Seller Fee
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Curated Canadian classic & enthusiast vehicle consignment
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-zinc-800">
          {submitted ? (
            <div className="py-8 text-center space-y-4 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center shadow-inner">
                <CheckCircle className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-zinc-900">
                  Consignment Request Received!
                </h3>
                <p className="text-sm text-zinc-600 max-w-md mx-auto">
                  Thank you for submitting your <span className="font-semibold text-zinc-900">{year} {make} {model}</span>. Our auction curators will review your vehicle specs and contact you at <span className="font-semibold text-zinc-900">{sellerEmail}</span> within 24 hours.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-left max-w-md mx-auto space-y-2 text-zinc-600">
                <div className="font-bold text-zinc-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  What happens next?
                </div>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Evaluation & historical auction comps analysis</li>
                  <li>Professional listing write-up & chapter curation</li>
                  <li>Complimentary high-resolution photo sequencing</li>
                  <li>Scheduled 7-day live bidding with verified Canadian buyers</li>
                </ul>
              </div>

              <div className="pt-4 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white transition-colors"
                >
                  Close & Return to Catalog
                </button>
                {onLaunchDirectListing && (
                  <button
                    type="button"
                    onClick={() => {
                      handleReset();
                      onLaunchDirectListing();
                    }}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1.5"
                  >
                    <span>Open Listing Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Value Props Row */}
              <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-zinc-50 border border-zinc-200 text-center text-xs">
                <div>
                  <div className="font-black text-emerald-600 text-sm">0%</div>
                  <div className="text-[11px] text-zinc-500 font-medium">Seller Commission</div>
                </div>
                <div className="border-x border-zinc-200">
                  <div className="font-black text-zinc-900 text-sm">CAD $</div>
                  <div className="text-[11px] text-zinc-500 font-medium">Direct Settlement</div>
                </div>
                <div>
                  <div className="font-black text-zinc-900 text-sm">100%</div>
                  <div className="text-[11px] text-zinc-500 font-medium">Verified Bidders</div>
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Vehicle Particulars */}
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5 text-zinc-700" />
                  <span>1. Vehicle Information</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Year <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 1988"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs focus:ring-2 focus:ring-red-600 focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Make <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Porsche"
                      value={make}
                      onChange={(e) => setMake(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs focus:ring-2 focus:ring-red-600 focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Model <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 928 S4"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs focus:ring-2 focus:ring-red-600 focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      VIN / Chassis #
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. WP0JB0928KS840123"
                      value={vin}
                      onChange={(e) => setVin(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs font-mono focus:ring-2 focus:ring-red-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Odometer / Mileage
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 84,200 km"
                      value={mileage}
                      onChange={(e) => setMileage(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs focus:ring-2 focus:ring-red-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Transmission
                    </label>
                    <select
                      value={transmission}
                      onChange={(e) => setTransmission(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs bg-white focus:ring-2 focus:ring-red-600 focus:outline-none"
                    >
                      <option value="Manual">Manual Transmission</option>
                      <option value="Dual-Clutch / PDK">Dual-Clutch / PDK / Sequential</option>
                      <option value="Automatic">Automatic Transmission</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Vehicle Location (City, Province)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Vancouver, BC or Calgary, AB"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs focus:ring-2 focus:ring-red-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Reserve Price Expectation ($ CAD)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. $55,000 CAD or 'No Reserve'"
                      value={reserveExpectation}
                      onChange={(e) => setReserveExpectation(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs focus:ring-2 focus:ring-red-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Seller Contact */}
              <div className="space-y-3 pt-3 border-t border-zinc-200">
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-zinc-700" />
                  <span>2. Seller Contact Information</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Your Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Alex Morgan"
                      value={sellerName}
                      onChange={(e) => setSellerName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs focus:ring-2 focus:ring-red-600 focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. alex@example.com"
                      value={sellerEmail}
                      onChange={(e) => setSellerEmail(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs focus:ring-2 focus:ring-red-600 focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. (604) 555-0192"
                      value={sellerPhone}
                      onChange={(e) => setSellerPhone(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs focus:ring-2 focus:ring-red-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Vehicle Highlights, Service History & Modifications
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Provide notable details: original paint condition, recent engine services, factory options, books/tools included, or any custom modifications..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs leading-relaxed focus:ring-2 focus:ring-red-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Direct Workspace Option Banner */}
              {(onLaunchDirectListing && (user?.role === 'seller' || user?.role === 'admin')) && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3 text-xs text-emerald-950">
                  <div>
                    <div className="font-bold flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      <span>Ready to draft your listing right now?</span>
                    </div>
                    <div className="text-[11px] text-emerald-800">
                      Skip the inquiry and jump directly into the full listing workspace to upload photos and chapters.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onLaunchDirectListing();
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span>Listing Workspace (/dashboard/listings/new)</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-3 border-t border-zinc-200 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-600 hover:bg-zinc-100 transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-white text-xs font-bold shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Submitting Consignment...' : 'Submit Consignment Inquiry'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConsignmentModal;
