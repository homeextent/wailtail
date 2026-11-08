import { CANADIAN_LICENSING_JURISDICTIONS, DEALER_DECLARATIONS, INTAKE_DECLARATION_VERSION } from '../config/consignmentIntake';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, 
  Car, 
  CheckCircle, 
  ShieldCheck, 
  DollarSign, 
  Camera, 
  FileText, 
  Send, 
  AlertCircle,
  MapPin,
  ChevronDown,
  HelpCircle,
  ExternalLink
} from 'lucide-react';
import vehicleTaxonomyRaw from '../data/vehicleTaxonomy.json';
import { ConsignmentApplication, UserRole } from '../types';
import { submitConsignmentApplication, checkUserAccountByEmail } from '../services/auctionService';
import { useAuth } from '../context/AuthContext';
import { trackConsignmentSubmitted } from '../utils/analytics';

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

export const GEARBOX_OPTIONS = [
  '4-Speed Manual',
  '5-Speed Manual',
  '6-Speed Manual',
  '3-Speed Automatic',
  '4-Speed Automatic',
  '5-Speed Automatic',
  '6-Speed Automatic',
  '8-Speed Automatic',
  'Dual-Clutch Automatic (DCT)',
  'Sequential / Dog-Leg',
  'Direct-Drive / Single-Speed',
  'Other / Custom Gearbox...'
];

interface ConsignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenLegalModal?: (tab: 'terms' | 'privacy') => void;
  onOpenHowItWorks?: (tab?: 'buying' | 'selling' | 'trust') => void;
}

export const ConsignmentModal: React.FC<ConsignmentModalProps> = ({
  isOpen,
  onClose,
  onOpenLegalModal,
  onOpenHowItWorks
}) => {
  const { user } = useAuth();

  // Seller FAQ Accordion State (closed by default to avoid layout shifts)
  const [isFaqOpen, setIsFaqOpen] = useState(false);

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
  const [transmission, setTransmission] = useState('5-Speed Manual');
  const [customTransmission, setCustomTransmission] = useState('');

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

  const [applicantType, setApplicantType] = useState<'private' | 'dealer'>('private');
  const [dealer, setDealer] = useState({ submittedDealershipName: '', submittedDbaName: '', submittedDealerLicenseNumber: '', submittedLicensingJurisdiction: '' });
  const [declarations, setDeclarations] = useState<Record<string, boolean>>({});
  const submission = useRef<{ key: string; id: string } | null>(null);
  const [hasAgreedToTerms, setHasAgreedToTerms] = useState(false);
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
    if (!hasAgreedToTerms) {
      setErrorMsg('Please confirm legal vehicle ownership authority and agree to Wailtail\'s Terms of Service and Privacy Policy.');
      return;
    }

    if (applicantType === 'dealer' && (!dealer.submittedDealershipName.trim() || !dealer.submittedDealerLicenseNumber.trim() ||
        !CANADIAN_LICENSING_JURISDICTIONS.some(([code]) => code === dealer.submittedLicensingJurisdiction) ||
        sellerPhone.replace(/\D/g, '').length < 7 || DEALER_DECLARATIONS.some(([key]) => declarations[key] !== true))) {
      setErrorMsg('Complete the dealer business details, representative phone and all three declarations.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);

    // Assemble structured location into a clean fallback string ("City, Province, Country")
    const formattedLocation = [locationCity.trim(), locationProvince.trim(), locationCountry.trim()]
      .filter(Boolean)
      .join(', ');

    const effectiveTransmission = transmission === 'Other / Custom Gearbox...'
      ? (customTransmission.trim() || 'Other / Custom Gearbox...')
      : transmission;

    try {
      const payload = {
        applicantType,
        termsAccepted: true,
        declarationVersion: INTAKE_DECLARATION_VERSION,
        ...(applicantType === 'dealer' ? { ...dealer, submittedLicensingJurisdiction: dealer.submittedLicensingJurisdiction as ConsignmentApplication['submittedLicensingJurisdiction'], ...Object.fromEntries(DEALER_DECLARATIONS.map(([key]) => [key, declarations[key] === true])) } : {}),
        year: year.trim(),
        make: effectiveMake,
        model: effectiveModel,
        generation: effectiveGeneration,
        vin: vin.trim().toUpperCase(),
        mileage: mileage.trim(),
        transmission: effectiveTransmission,
        location: formattedLocation,
        locationCity: locationCity.trim(),
        locationProvince: locationProvince.trim(),
        locationCountry: locationCountry.trim(),
        reserveExpectation: reserveExpectation.trim(),
        sellerName: sellerName.trim(),
        sellerEmail: sellerEmail.trim(),
        sellerPhone: sellerPhone.trim(),
        notes: notes.trim()
      };
      const key = JSON.stringify(payload);
      if (submission.current?.key !== key) submission.current = { key, id: crypto.randomUUID() };
      await submitConsignmentApplication(payload, submission.current.id);

      setSubmitted(true);
      trackConsignmentSubmitted(year.trim(), effectiveMake, effectiveModel);
    } catch (err: any) {
      if (err.status === 409) submission.current = null;
      console.error('Error submitting consignment application:', err);
      setErrorMsg(err.message || 'Failed to submit consignment. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSubmitted(false);
    setApplicantType('private');
    setDealer({ submittedDealershipName: '', submittedDbaName: '', submittedDealerLicenseNumber: '', submittedLicensingJurisdiction: '' });
    setDeclarations({});
    submission.current = null;
    setYear('');
    setSelectedMakeDropdown('');
    setCustomMake('');
    setSelectedModelDropdown('');
    setCustomModel('');
    setSelectedGenerationDropdown('');
    setCustomGeneration('');
    setVin('');
    setMileage('');
    setTransmission('5-Speed Manual');
    setCustomTransmission('');
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
    setHasAgreedToTerms(false);
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
                  Vehicle Submission & Listing Application
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
            disabled={submitting}
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

              <div className="pt-4 flex items-center justify-center">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleReset}
                  className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white transition-colors cursor-pointer"
                >
                  Close & Return to Catalog
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form aria-label="Vehicle consignment application" onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Scrollable Form Content */}
            <fieldset disabled={submitting} className="min-w-0 overflow-y-auto p-4 sm:p-6 space-y-4 flex-1 text-white">
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
                <div role="alert" className="p-3 rounded-lg bg-red-950/70 border border-red-800 text-red-200 text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <fieldset disabled={submitting} className="space-y-3 p-4 rounded-xl border border-slate-700 bg-slate-800/40">
                <legend className="text-sm font-bold px-1">Who is submitting this vehicle?</legend>
                <div className="flex flex-wrap gap-4">{(['private', 'dealer'] as const).map(type => <label key={type} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="applicantType" value={type} checked={applicantType === type}
                    onChange={() => { setApplicantType(type); setDeclarations({}); setErrorMsg(null); }} />
                  {type === 'private' ? 'Private seller' : 'Dealer'}
                </label>)}</div>
                {applicantType === 'dealer' && <p className="text-xs text-slate-300">Apply on behalf of a Canadian dealership that owns this vehicle. All business details and declarations are subject to manual review. Submission does not grant verified dealer status.</p>}
              </fieldset>
              {applicantType === 'dealer' && <fieldset disabled={submitting} className="space-y-4 p-4 rounded-xl border border-emerald-800/60 bg-emerald-950/20">
                <legend className="text-sm font-bold px-1">Dealership details</legend>
                <div className="grid sm:grid-cols-2 gap-3">
                  {([['submittedDealershipName', 'Legal business name', 200], ['submittedDbaName', 'Trade name / DBA (optional)', 200], ['submittedDealerLicenseNumber', 'Dealer licence number', 100]] as const).map(([key, label, max]) => <label key={key} className="text-xs font-semibold text-slate-300">{label}
                    <input type="text" aria-label={label} value={dealer[key]} maxLength={max} required={key !== 'submittedDbaName'} onChange={event => setDealer({ ...dealer, [key]: event.target.value })} className="block mt-1 w-full px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-800 text-white text-sm" />
                  </label>)}
                  <label className="text-xs font-semibold text-slate-300">Licensing province or territory
                    <select aria-label="Licensing province or territory" value={dealer.submittedLicensingJurisdiction} required onChange={event => setDealer({ ...dealer, submittedLicensingJurisdiction: event.target.value })} className="block mt-1 w-full px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-800 text-white text-sm">
                      <option value="">Select jurisdiction…</option>{CANADIAN_LICENSING_JURISDICTIONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                    </select>
                  </label>
                </div>
                <p className="text-xs text-slate-400">Licence details are collected privately for administrative review.</p>
                <fieldset className="space-y-3"><legend className="font-semibold text-sm mb-2">Required dealer declarations</legend>
                  {DEALER_DECLARATIONS.map(([key, wording]) => <label key={key} className="flex gap-2 text-xs text-slate-300 cursor-pointer"><input className="mt-0.5" type="checkbox" aria-label={wording} required checked={declarations[key] === true} onChange={event => setDeclarations({ ...declarations, [key]: event.target.checked })} /><span>{wording}</span></label>)}
                </fieldset>
              </fieldset>}
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
                      aria-label="Vehicle year"
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
                      aria-label="Vehicle make"
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
                          aria-label="Vehicle model"
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
                      onChange={(e) => {
                        const cleanVal = e.target.value.replace(/[^0-9]/g, '');
                        setMileage(cleanVal);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 text-base sm:text-sm focus:ring-2 focus:ring-red-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Transmission
                    </label>
                    <select
                      value={transmission}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTransmission(val);
                        if (val !== 'Other / Custom Gearbox...') {
                          setCustomTransmission('');
                        }
                      }}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-800/90 text-white text-base sm:text-sm focus:ring-2 focus:ring-red-600 focus:outline-none cursor-pointer"
                    >
                      {GEARBOX_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    {transmission === 'Other / Custom Gearbox...' && (
                      <input
                        type="text"
                        placeholder="Specify custom gearbox / transaxle..."
                        value={customTransmission}
                        onChange={(e) => setCustomTransmission(e.target.value)}
                        className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 text-base sm:text-sm focus:ring-2 focus:ring-red-600 focus:outline-none"
                        required
                      />
                    )}
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
                  <span>{applicantType === 'dealer' ? '2. Primary Authorized Representative' : '2. Seller Contact Information'}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {applicantType === 'dealer' ? 'Representative Name' : 'Your Name'} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Alex Morgan"
                      aria-label={applicantType === 'dealer' ? 'Representative name' : 'Your name'}
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
                      aria-label={applicantType === 'dealer' ? 'Representative email' : 'Email address'}
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
                          ✓ Registered member account detected ({detectedAccount.role || 'BIDDER'}). Submitting will use your contact email. Any seller access requires a separate approved onboarding process.
                        </span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {applicantType === 'dealer' ? 'Representative Phone (required)' : 'Phone Number'}
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. (604) 555-0192"
                      required={applicantType === 'dealer'}
                      aria-label={applicantType === 'dealer' ? 'Representative phone' : 'Phone number'}
                      value={sellerPhone}
                      onChange={(e) => {
                        const cleanPhone = e.target.value.replace(/[^0-9+\-() ]/g, '');
                        setSellerPhone(cleanPhone);
                      }}
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

              {/* Contextual Collapsible FAQ Accordion */}
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <button
                  type="button"
                  onClick={() => setIsFaqOpen(!isFaqOpen)}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 transition-colors text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-white tracking-wide">
                      Seller FAQ &amp; Settlement Details
                    </span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isFaqOpen ? 'rotate-180 text-amber-400' : ''}`} />
                </button>

                {isFaqOpen && (
                  <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-xs space-y-3.5 text-slate-300 animate-in fade-in duration-150">
                    <div>
                      <h4 className="font-bold text-amber-400 mb-1 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                        <span>How are applications reviewed?</span>
                      </h4>
                      <p className="text-[11px] sm:text-xs text-slate-300 pl-5 leading-relaxed">
                        Our curators review each vehicle individually. Dealer business verification is a separate manual process and does not automatically approve a vehicle for auction.
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80">
                      <h4 className="font-bold text-amber-400 mb-1 flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                        <span>How and when do I receive payment?</span>
                      </h4>
                      <p className="text-[11px] sm:text-xs text-slate-300 pl-5 leading-relaxed">
                        Upon auction conclusion meeting your reserve, Wailtail securely connects you with the winning bidder. Payment (wire transfer, bank draft, or certified cheque) is settled directly offline between you and the buyer within 3 business days, with 0% deducted by Wailtail.
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80">
                      <h4 className="font-bold text-amber-400 mb-1 flex items-center gap-1.5">
                        <Car className="w-3.5 h-3.5 text-amber-400" />
                        <span>How are inspections handled?</span>
                      </h4>
                      <p className="text-[11px] sm:text-xs text-slate-300 pl-5 leading-relaxed">
                        All lots are listed "As-Is, Where-Is". Prospective buyers are encouraged to review your documentation and arrange independent pre-purchase inspections (PPI) prior to bidding while the auction remains live.
                      </p>
                    </div>

                    {onOpenHowItWorks && (
                      <div className="pt-2 border-t border-slate-800 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => onOpenHowItWorks('selling')}
                          className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <span>Have more questions? Read our full Selling &amp; Settlement Guide</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </fieldset>

            {/* Modal Sticky/Fixed Footer Action Buttons */}
            <div className="p-4 sm:px-6 sm:py-4 border-t border-slate-800 bg-slate-950 flex flex-col gap-3.5 flex-shrink-0">
              <label className="flex items-start gap-2.5 cursor-pointer text-xs text-zinc-300">
                <input
                  type="checkbox"
                  aria-label="Ownership and terms agreement"
                  disabled={submitting}
                  checked={hasAgreedToTerms}
                  onChange={(e) => setHasAgreedToTerms(e.target.checked)}
                  className="mt-0.5 rounded border-zinc-700 bg-zinc-900 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <span>
                  I confirm I am the legal owner or authorized representative of this vehicle and agree to Wailtail's <button type="button" onClick={() => onOpenLegalModal?.('terms')} className="underline text-emerald-400 cursor-pointer">Terms of Service</button> and <button type="button" onClick={() => onOpenLegalModal?.('privacy')} className="underline text-emerald-400 cursor-pointer">Privacy Policy</button>.
                </span>
              </label>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleReset}
                  className="min-h-[44px] px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submitting || !hasAgreedToTerms}
                  className="min-h-[44px] px-5 sm:px-6 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-white text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Submitting Application...' : 'Submit Vehicle Application'}</span>
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ConsignmentModal;
