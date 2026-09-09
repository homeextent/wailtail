import React, { useState, useEffect, useMemo } from 'react';
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
  AlertCircle,
  MapPin
} from 'lucide-react';
import vehicleTaxonomyRaw from '../data/vehicleTaxonomy.json';
import { ConsignmentApplication, UserRole } from '../types';
import { submitConsignmentApplication, checkUserAccountByEmail } from '../services/auctionService';
import { useAuth } from '../context/AuthContext';

interface TaxonomyModel {
  name: string;
  generations?: string[];
}

interface TaxonomyMake {
  models: TaxonomyModel[];
}

const vehicleTaxonomy: Record<string, TaxonomyMake> = vehicleTaxonomyRaw as Record<string, TaxonomyMake>;
export const TAXONOMY_OTHER_CUSTOM = 'OTHER_CUSTOM';
export const AVAILABLE_MAKES = Object.keys(vehicleTaxonomy).sort((a, b) => a.localeCompare(b));
export const YEAR_OPTIONS = Array.from({ length: 2026 - 1900 + 1 }, (_, i) => 2026 - i);

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

  // 3-tier vehicle taxonomy state
  const [year, setYear] = useState('');
  const [selectedMakeDropdown, setSelectedMakeDropdown] = useState('');
  const [customMake, setCustomMake] = useState('');
  const [selectedModelDropdown, setSelectedModelDropdown] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [selectedGenerationDropdown, setSelectedGenerationDropdown] = useState('');
  const [customGeneration, setCustomGeneration] = useState('');

  // Specs
  const [vin, setVin] = useState('');
  const [mileage, setMileage] = useState('');
  const [transmission, setTransmission] = useState('Manual');

  // 3-column structured location fields
  const [locationCity, setLocationCity] = useState('');
  const [locationProvince, setLocationProvince] = useState('');
  const [locationCountry, setLocationCountry] = useState('Canada');

  // Value expectation & seller contact
  const [reserveExpectation, setReserveExpectation] = useState('');
  const [sellerName, setSellerName] = useState('');
  const [sellerEmail, setSellerEmail] = useState('');
  const [sellerPhone, setSellerPhone] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [detectedAccount, setDetectedAccount] = useState<{ exists: boolean; role?: UserRole; name?: string } | null>(null);

  // Lock underlying viewport scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow || '';
      };
    }
  }, [isOpen]);

  // Non-blocking Member Email Lookup onBlur
  const handleEmailBlur = async () => {
    const cleanEmail = (sellerEmail || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setDetectedAccount(null);
      return;
    }
    try {
      const account = await checkUserAccountByEmail(cleanEmail);
      if (account && account.exists) {
        setDetectedAccount(account);
      } else {
        setDetectedAccount(null);
      }
    } catch (err) {
      // Silent handling so network hiccups do not interrupt form typing or submission
      console.warn('Silent failure during consignment email lookup:', err);
    }
  };

  // Pre-fill user profile info when available
  useEffect(() => {
    if (user) {
      if (!sellerName && user.displayName) setSellerName(user.displayName);
      if (!sellerEmail && user.email) {
        setSellerEmail(user.email);
        (async () => {
          try {
            const account = await checkUserAccountByEmail(user.email);
            if (account && account.exists) {
              setDetectedAccount(account);
            }
          } catch (err) {
            console.warn('Silent failure checking initial user email:', err);
          }
        })();
      }
      if (!sellerPhone && user.phone) setSellerPhone(user.phone);
    }
  }, [user]);

  // Derived effective values
  const effectiveMake = selectedMakeDropdown === TAXONOMY_OTHER_CUSTOM ? customMake.trim() : selectedMakeDropdown.trim();
  const effectiveModel = selectedModelDropdown === TAXONOMY_OTHER_CUSTOM ? customModel.trim() : selectedModelDropdown.trim();
  const effectiveGeneration = selectedGenerationDropdown === TAXONOMY_OTHER_CUSTOM ? customGeneration.trim() : selectedGenerationDropdown.trim();

  // Dependent models list
  const availableModels = useMemo(() => {
    if (!selectedMakeDropdown || selectedMakeDropdown === TAXONOMY_OTHER_CUSTOM) return [];
    return vehicleTaxonomy[selectedMakeDropdown]?.models?.map((m) => m.name) || [];
  }, [selectedMakeDropdown]);

  // Dependent generations list
  const availableGenerations = useMemo(() => {
    if (
      !selectedMakeDropdown ||
      !selectedModelDropdown ||
      selectedMakeDropdown === TAXONOMY_OTHER_CUSTOM ||
      selectedModelDropdown === TAXONOMY_OTHER_CUSTOM
    ) {
      return [];
    }
    const makeData = vehicleTaxonomy[selectedMakeDropdown];
    if (!makeData?.models) return [];
    const modelObj = makeData.models.find(
      (m) => m.name.toLowerCase() === selectedModelDropdown.toLowerCase()
    );
    return modelObj?.generations || [];
  }, [selectedMakeDropdown, selectedModelDropdown]);

  // Taxonomy selection handlers
  const handleMakeSelect = (newMake: string) => {
    setSelectedMakeDropdown(newMake);
    if (newMake === TAXONOMY_OTHER_CUSTOM) {
      setSelectedModelDropdown(TAXONOMY_OTHER_CUSTOM);
      setSelectedGenerationDropdown(TAXONOMY_OTHER_CUSTOM);
    } else {
      setCustomMake('');
      setSelectedModelDropdown('');
      setCustomModel('');
      setSelectedGenerationDropdown('');
      setCustomGeneration('');
    }
  };

  const handleModelSelect = (newModel: string) => {
    setSelectedModelDropdown(newModel);
    if (newModel === TAXONOMY_OTHER_CUSTOM) {
      setSelectedGenerationDropdown(TAXONOMY_OTHER_CUSTOM);
    } else {
      setCustomModel('');
      setSelectedGenerationDropdown('');
      setCustomGeneration('');
    }
  };

  const handleGenerationSelect = (newGen: string) => {
    setSelectedGenerationDropdown(newGen);
    if (newGen !== TAXONOMY_OTHER_CUSTOM) {
      setCustomGeneration('');
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!year || !effectiveMake || !effectiveModel || !sellerName.trim() || !sellerEmail.trim()) {
      setErrorMsg('Please complete all required fields (Year, Make, Model, Seller Name, and Email).');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    // Assemble structured location into a clean fallback string ("City, Province, Country")
    const formattedLocation = [locationCity.trim(), locationProvince.trim(), locationCountry.trim()]
      .filter(Boolean)
      .join(', ');

    try {
      await submitConsignmentApplication({
        year: year.trim(),
        make: effectiveMake,
        model: effectiveModel,
        generation: effectiveGeneration,
        vin: vin.trim().toUpperCase(),
        mileage: mileage.trim(),
        transmission,
        location: formattedLocation,
        locationCity: locationCity.trim(),
        locationProvince: locationProvince.trim(),
        locationCountry: locationCountry.trim(),
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
    setSelectedMakeDropdown('');
    setCustomMake('');
    setSelectedModelDropdown('');
    setCustomModel('');
    setSelectedGenerationDropdown('');
    setCustomGeneration('');
    setVin('');
    setMileage('');
    setTransmission('Manual');
    setLocationCity('');
    setLocationProvince('');
    setLocationCountry('Canada');
    setReserveExpectation('');
    setSellerName(user?.displayName || '');
    setSellerEmail(user?.email || '');
    setSellerPhone(user?.phone || '');
    setNotes('');
    setDetectedAccount(null);
    setErrorMsg(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-slate-900 text-white border border-slate-800 overflow-hidden shadow-2xl"
      >
        {/* Modal Header */}
        <div className="bg-slate-950 text-white px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-700 flex items-center justify-center text-white shadow-inner font-bold flex-shrink-0">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Sell Your Vehicle with Wailtail
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-emerald-950 text-emerald-300 border border-emerald-800 flex-shrink-0">
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
            className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        {submitted ? (
          <div className="overflow-y-auto p-4 sm:p-6 space-y-4 flex-1 text-white">
            <div className="py-6 text-center space-y-4 animate-in zoom-in-95 duration-200">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-emerald-950 border border-emerald-600/50 text-emerald-400 mx-auto flex items-center justify-center shadow-inner">
                <CheckCircle className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg sm:text-xl font-bold text-white">
                  Consignment Request Received!
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 max-w-lg mx-auto">
                  Thank you for submitting your <span className="font-semibold text-white">{year} {effectiveMake} {effectiveModel}{effectiveGeneration ? ` (${effectiveGeneration})` : ''}</span>. Our auction curators will review your vehicle specs and contact you at <span className="font-semibold text-white">{sellerEmail}</span> within 24 hours.
                </p>
              </div>

              {/* Wailtail Curation Workflow Content */}
              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs text-left max-w-lg mx-auto space-y-2.5 text-slate-300">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>What happens next?</span>
                </div>
                <ul className="space-y-2 text-slate-300">
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                    <div>
                      <strong className="text-white">Curator Review:</strong> Admin evaluation of vehicle specifications, VIN, and location details.
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                    <div>
                      <strong className="text-white">Consignment Approval:</strong> Verification of seller contact details and consignment request.
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                    <div>
                      <strong className="text-white">Seller Workspace Access:</strong> Approved consignors receive listing workspace access to draft and launch their vehicle lot.
                    </div>
                  </li>
                </ul>
              </div>

              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white transition-colors cursor-pointer"
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
                    className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Open Listing Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Scrollable Form Content */}
            <div className="overflow-y-auto p-4 sm:p-6 space-y-4 flex-1 text-white">
              {/* Value Props Row */}
              <div className="grid grid-cols-3 gap-2 p-2.5 sm:p-3 rounded-xl bg-slate-800/60 border border-slate-700/80 text-center text-xs text-slate-300">
                <div>
                  <div className="font-black text-emerald-400 text-sm">0%</div>
                  <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium">Seller Commission</div>
                </div>
                <div className="border-x border-slate-700/80">
                  <div className="font-black text-white text-sm">CAD $</div>
                  <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium">Direct Settlement</div>
                </div>
                <div>
                  <div className="font-black text-white text-sm">100%</div>
                  <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium">Verified Bidders</div>
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-lg bg-red-950/70 border border-red-800 text-red-200 text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Section 1: Vehicle Information & 3-Tier Taxonomy */}
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5 text-slate-300" />
                  <span>1. Vehicle Information</span>
                </div>

                {/* Stacked 2-Column Responsive Grid: Year, Make, Model, Generation / Chassis Code */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Year <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-800/90 text-white text-base sm:text-sm focus:ring-2 focus:ring-red-600 focus:outline-none cursor-pointer"
                      required
                    >
                      <option value="">Select Year...</option>
                      {YEAR_OPTIONS.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Make <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedMakeDropdown}
                      onChange={(e) => handleMakeSelect(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-800/90 text-white text-base sm:text-sm focus:ring-2 focus:ring-red-600 focus:outline-none cursor-pointer"
                      required
                    >
                      <option value="">Select Make...</option>
                      {AVAILABLE_MAKES.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                      <option value={TAXONOMY_OTHER_CUSTOM}>Other / Custom...</option>
                    </select>
                    {selectedMakeDropdown === TAXONOMY_OTHER_CUSTOM && (
                      <input
                        type="text"
                        placeholder="Enter custom make..."
                        value={customMake}
                        onChange={(e) => setCustomMake(e.target.value)}
                        className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 text-base sm:text-sm focus:ring-2 focus:ring-red-600 focus:outline-none"
                        required
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Model <span className="text-red-500">*</span>
                    </label>
                    {(!selectedMakeDropdown || selectedMakeDropdown === TAXONOMY_OTHER_CUSTOM) ? (
                      selectedMakeDropdown === TAXONOMY_OTHER_CUSTOM ? (
                        <input
                          type="text"
                          placeholder="Enter custom model..."
                          value={customModel}
                          onChange={(e) => setCustomModel(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 text-base sm:text-sm focus:ring-2 focus:ring-red-600 focus:outline-none"
                          required
                        />
                      ) : (
                        <select
                          disabled
                          className="w-full px-3 py-2.5 rounded-lg border border-slate-800 bg-slate-800/40 text-slate-500 text-base sm:text-sm cursor-not-allowed focus:outline-none"
                        >
                          <option value="">Select Make first...</option>
                        </select>
                      )
                    ) : (
                      <div>
                        <select
                          value={selectedModelDropdown}
                          onChange={(e) => handleModelSelect(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-800/90 text-white text-base sm:text-sm focus:ring-2 focus:ring-red-600 focus:outline-none cursor-pointer"
                          required
                        >
                          <option value="">Select Model...</option>
                          {availableModels.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                          <option value={TAXONOMY_OTHER_CUSTOM}>Other / Custom...</option>
                        </select>
                        {selectedModelDropdown === TAXONOMY_OTHER_CUSTOM && (
                          <input
                            type="text"
                            placeholder="Enter custom model..."
                            value={customModel}
                            onChange={(e) => setCustomModel(e.target.value)}
                            className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 text-base sm:text-sm focus:ring-2 focus:ring-red-600 focus:outline-none"
                            required
                          />
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Generation / Chassis Code
                    </label>
                    {(!selectedMakeDropdown || !selectedModelDropdown || selectedMakeDropdown === TAXONOMY_OTHER_CUSTOM || selectedModelDropdown === TAXONOMY_OTHER_CUSTOM) ? (
                      selectedMakeDropdown === TAXONOMY_OTHER_CUSTOM || selectedModelDropdown === TAXONOMY_OTHER_CUSTOM ? (
                        <input
                          type="text"
                          placeholder="Enter generation / chassis..."
                          value={customGeneration}
                          onChange={(e) => setCustomGeneration(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 text-base sm:text-sm focus:ring-2 focus:ring-red-600 focus:outline-none"
                        />
                      ) : (
                        <select
                          disabled
                          className="w-full px-3 py-2.5 rounded-lg border border-slate-800 bg-slate-800/40 text-slate-500 text-base sm:text-sm cursor-not-allowed focus:outline-none"
                        >
                          <option value="">Select Model first...</option>
                        </select>
                      )
                    ) : availableGenerations.length === 0 ? (
                      <input
                        type="text"
                        placeholder="Enter generation / chassis..."
                        value={customGeneration}
                        onChange={(e) => setCustomGeneration(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 text-base sm:text-sm focus:ring-2 focus:ring-red-600 focus:outline-none"
                      />
                    ) : (
                      <div>
                        <select
                          value={selectedGenerationDropdown}
                          onChange={(e) => handleGenerationSelect(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-800/90 text-white text-base sm:text-sm focus:ring-2 focus:ring-red-600 focus:outline-none cursor-pointer"
                        >
                          <option value="">Select Generation...</option>
                          {availableGenerations.map((g) => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                          <option value={TAXONOMY_OTHER_CUSTOM}>Other / Custom...</option>
                        </select>
                        {selectedGenerationDropdown === TAXONOMY_OTHER_CUSTOM && (
                          <input
                            type="text"
                            placeholder="Enter custom generation..."
                            value={customGeneration}
                            onChange={(e) => setCustomGeneration(e.target.value)}
                            className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 text-base sm:text-sm focus:ring-2 focus:ring-red-600 focus:outline-none"
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Additional Specs: VIN, Mileage, Transmission */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      VIN / Chassis #
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. WP0JB0928KS840123"
                      value={vin}
                      onChange={(e) => setVin(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 text-base sm:text-sm font-mono uppercase focus:ring-2 focus:ring-red-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Odometer / Mileage
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 84,200 km"
                      value={mileage}
                      onChange={(e) => setMileage(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 text-base sm:text-sm focus:ring-2 focus:ring-red-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Transmission
                    </label>
                    <select
                      value={transmission}
                      onChange={(e) => setTransmission(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-800/90 text-white text-base sm:text-sm focus:ring-2 focus:ring-red-600 focus:outline-none cursor-pointer"
                    >
                      <option value="Manual">Manual Transmission</option>
                      <option value="Dual-Clutch / PDK">Dual-Clutch / PDK / Sequential</option>
                      <option value="Automatic">Automatic Transmission</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                {/* 3-Column Structured Location Fields */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-300 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>Vehicle Location</span>
                    </label>
                    <span className="text-[11px] text-slate-400 font-medium">
                      Preview: {[locationCity.trim(), locationProvince.trim(), locationCountry.trim()].filter(Boolean).join(', ') || 'Not set'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">City</label>
                      <input
                        type="text"
                        placeholder="e.g. Vancouver"
                        value={locationCity}
                        onChange={(e) => setLocationCity(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 text-base sm:text-sm focus:ring-2 focus:ring-red-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Province / State</label>
                      <input
                        type="text"
                        placeholder="e.g. BC"
                        value={locationProvince}
                        onChange={(e) => setLocationProvince(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 text-base sm:text-sm focus:ring-2 focus:ring-red-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Country</label>
                      <input
                        type="text"
                        placeholder="e.g. Canada"
                        value={locationCountry}
                        onChange={(e) => setLocationCountry(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 text-base sm:text-sm focus:ring-2 focus:ring-red-600 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Reserve Price Expectation */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Reserve Price Expectation ($ CAD)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. $55,000 CAD or 'No Reserve'"
                    value={reserveExpectation}
                    onChange={(e) => setReserveExpectation(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 text-base sm:text-sm focus:ring-2 focus:ring-red-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Section 2: Seller Contact Information */}
              <div className="space-y-3 pt-3 border-t border-slate-800">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-300" />
                  <span>2. Seller Contact Information</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Your Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Alex Morgan"
                      value={sellerName}
                      onChange={(e) => setSellerName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 text-base sm:text-sm focus:ring-2 focus:ring-red-600 focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. alex@example.com"
                      value={sellerEmail}
                      onChange={(e) => setSellerEmail(e.target.value)}
                      onBlur={handleEmailBlur}
                      className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 text-base sm:text-sm focus:ring-2 focus:ring-red-600 focus:outline-none"
                      required
                    />
                    {detectedAccount && detectedAccount.exists && (
                      <div className="mt-2 p-2.5 rounded-lg bg-emerald-950/70 border border-emerald-700 text-emerald-200 text-[11px] font-medium flex items-start gap-2 animate-in fade-in">
                        <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span className="leading-snug">
                          ✓ Registered member account detected ({detectedAccount.role || 'BIDDER'}). Submitting will automatically link this consignment request to your member profile and grant SELLER listing access upon approval.
                        </span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. (604) 555-0192"
                      value={sellerPhone}
                      onChange={(e) => setSellerPhone(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 text-base sm:text-sm focus:ring-2 focus:ring-red-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Vehicle Highlights, Service History & Modifications
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Provide notable details: original paint condition, recent engine services, factory options, books/tools included, or any custom modifications..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 text-base sm:text-sm leading-relaxed focus:ring-2 focus:ring-red-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Direct Workspace Option Banner */}
              {(onLaunchDirectListing && (user?.role === 'seller' || user?.role === 'admin')) && (
                <div className="p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-200">
                  <div>
                    <div className="font-bold flex items-center gap-1.5 text-emerald-300">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      <span>Ready to draft your listing right now?</span>
                    </div>
                    <div className="text-[11px] text-emerald-400/90 mt-0.5">
                      Skip the inquiry and jump directly into the full listing workspace to upload photos and chapters.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onLaunchDirectListing();
                    }}
                    className="min-h-[44px] px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs whitespace-nowrap transition-colors flex items-center justify-center gap-1 cursor-pointer flex-shrink-0"
                  >
                    <span>Listing Workspace (/dashboard/listings/new)</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Modal Sticky/Fixed Footer Action Buttons */}
            <div className="p-4 sm:px-6 sm:py-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={handleReset}
                className="min-h-[44px] px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="min-h-[44px] px-5 sm:px-6 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-white text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{submitting ? 'Submitting Consignment...' : 'Submit Consignment Inquiry'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ConsignmentModal;
