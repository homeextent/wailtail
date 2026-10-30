import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  X,
  UploadCloud,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  ChevronRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  HelpCircle,
  Car,
  FileSpreadsheet,
  Check,
  RefreshCw
} from 'lucide-react';
import { ListingDraftSchema } from '../types';
import {
  encodeFileToBase64,
  generateChassisInterview,
  synthesizeListingDraft
} from '../services/aiService';

export interface AiAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (
    synthesizedDraft: ListingDraftSchema,
    selectedSections: {
      identity: boolean;
      narrative: boolean;
      showcase: boolean;
      financials: boolean;
    }
  ) => void;
  currentDraftContext?: Partial<ListingDraftSchema>;
}

interface UploadedFileItem {
  file: File;
  name: string;
  size: number;
  mimeType: string;
  dataBase64?: string;
}

const MAX_PDF_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_IMG_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

const GUIDANCE_CHIPS = [
  { label: '+ Ownership History', text: '\n\nOwnership History:\n- Previous owners:\n- Current ownership duration:\n- Location history / climate exposure:' },
  { label: '+ Major Services & Invoices', text: '\n\nMajor Services & Invoices:\n- Date / Mileage:\n- Key maintenance items performed:\n- Replacement parts / fluids used:' },
  { label: '+ Paint Meter & Flaws', text: '\n\nPaint Meter & Flaws:\n- Paint meter readings (mils/microns):\n- Imperfections, stone chips, or repainted panels:\n- Glass, trim, and weatherstripping condition:' },
  { label: '+ Factory Options & Modifications', text: '\n\nFactory Options & Modifications:\n- Factory build sheet / optional equipment:\n- Aftermarket modifications / upgrades:\n- Included original OEM parts:' }
];

const LOADING_TICKER_MESSAGES = [
  'Extracting provenance from uploaded invoices & records...',
  'Synthesizing Wailtail curated editorial narrative...',
  'Structuring showcase chapters and technical spec cards...'
];

export const AiAssistantModal: React.FC<AiAssistantModalProps> = ({
  isOpen,
  onClose,
  onApply,
  currentDraftContext
}) => {
  // Wizard active step: 1 | 2 | 3
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Ingestion State
  const [notes, setNotes] = useState<string>('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileItem[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isConvertingFiles, setIsConvertingFiles] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2: Chassis Interview State
  const [interviewQuestions, setInterviewQuestions] = useState<string[]>([]);
  const [interviewAnswers, setInterviewAnswers] = useState<Record<string, string>>({});
  const [isLoadingInterview, setIsLoadingInterview] = useState<boolean>(false);
  const [interviewError, setInterviewError] = useState<string | null>(null);

  // Fallback vehicle taxonomy if currentDraftContext lacks it
  const [fallbackYear, setFallbackYear] = useState<string>(
    currentDraftContext?.year ? String(currentDraftContext.year) : ''
  );
  const [fallbackMake, setFallbackMake] = useState<string>(
    currentDraftContext?.make || ''
  );
  const [fallbackModel, setFallbackModel] = useState<string>(
    currentDraftContext?.model || ''
  );
  const [fallbackGeneration, setFallbackGeneration] = useState<string>(
    currentDraftContext?.generation || ''
  );

  // Step 3: Synthesis & Hydration State
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [tickerIndex, setTickerIndex] = useState<number>(0);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);
  const [synthesizedDraft, setSynthesizedDraft] = useState<ListingDraftSchema | null>(null);
  const [selectedSections, setSelectedSections] = useState<{
    identity: boolean;
    narrative: boolean;
    showcase: boolean;
    financials: boolean;
  }>({
    identity: true,
    narrative: true,
    showcase: true,
    financials: true
  });

  // Reset or initialize when modal opens
  useEffect(() => {
    if (isOpen) {
      if (currentDraftContext) {
        if (currentDraftContext.year) setFallbackYear(String(currentDraftContext.year));
        if (currentDraftContext.make) setFallbackMake(currentDraftContext.make);
        if (currentDraftContext.model) setFallbackModel(currentDraftContext.model);
        if (currentDraftContext.generation) setFallbackGeneration(currentDraftContext.generation);
      }
    } else {
      // Clean state on modal close
      setStep(1);
      setFileError(null);
      setInterviewError(null);
      setSynthesisError(null);
    }
  }, [isOpen, currentDraftContext]);

  // Loading ticker rotation
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isSynthesizing) {
      interval = setInterval(() => {
        setTickerIndex((prev) => (prev + 1) % LOADING_TICKER_MESSAGES.length);
      }, 2400);
    } else {
      setTickerIndex(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isSynthesizing]);

  // Keyboard navigation: Escape key closes modal (disabled while AI is in-flight)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (!isSynthesizing && !isLoadingInterview && !isConvertingFiles) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSynthesizing, isLoadingInterview, isConvertingFiles, onClose]);

  if (!isOpen) return null;

  // File size formatter
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Handle file uploads with validation and asynchronous Base64 conversion
  const processFiles = async (files: FileList | File[]) => {
    setFileError(null);
    const newItems: UploadedFileItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const isImage = file.type.startsWith('image/') || /\.(png|jpe?g)$/i.test(file.name);

      if (!isPdf && !isImage) {
        setFileError(`Unsupported file format for "${file.name}". Please attach PDF documents or PNG/JPEG images.`);
        continue;
      }

      if (isPdf && file.size > MAX_PDF_SIZE_BYTES) {
        setFileError(`File "${file.name}" exceeds the 25MB limit for PDF inspection documents.`);
        continue;
      }

      if (isImage && file.size > MAX_IMG_SIZE_BYTES) {
        setFileError(`Image "${file.name}" exceeds the 20MB limit for photo uploads.`);
        continue;
      }

      newItems.push({
        file,
        name: file.name,
        size: file.size,
        mimeType: file.type || (isPdf ? 'application/pdf' : 'image/jpeg')
      });
    }

    if (newItems.length === 0) return;

    setIsConvertingFiles(true);
    try {
      const convertedItems = await Promise.all(
        newItems.map(async (item) => {
          try {
            const encoded = await encodeFileToBase64(item.file);
            return {
              ...item,
              dataBase64: encoded.dataBase64,
              mimeType: encoded.mimeType
            };
          } catch (err) {
            console.error(`Failed to encode file ${item.name}`, err);
            return item;
          }
        })
      );

      setUploadedFiles((prev) => [...prev, ...convertedItems]);
    } catch (err) {
      setFileError('Failed to process one or more files. Please try again.');
    } finally {
      setIsConvertingFiles(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleRemoveFile = (indexToRemove: number) => {
    setUploadedFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const appendGuidanceChip = (promptText: string) => {
    setNotes((prev) => (prev ? `${prev.trim()}${promptText}\n` : promptText.trim() + '\n'));
  };

  // Determine effective vehicle context
  const effectiveYear = fallbackYear || currentDraftContext?.year || '';
  const effectiveMake = fallbackMake || currentDraftContext?.make || '';
  const effectiveModel = fallbackModel || currentDraftContext?.model || '';
  const effectiveGeneration = fallbackGeneration || currentDraftContext?.generation || '';

  // Trigger Chassis Interview generation
  const handleProceedToInterview = async () => {
    setInterviewError(null);
    setStep(2);

    if (interviewQuestions.length > 0) {
      return;
    }

    setIsLoadingInterview(true);
    try {
      const questions = await generateChassisInterview({
        year: effectiveYear || 'Classic',
        make: effectiveMake || 'Collector',
        model: effectiveModel || 'Sports Car',
        generation: effectiveGeneration || undefined
      });
      setInterviewQuestions(questions && questions.length > 0 ? questions : [
        'What major mechanical or cosmetic services have been completed during your ownership?',
        'Are there any known blemishes, modifications, or deviations from factory specification?',
        'What documented records, spare keys, or original equipment accompany the vehicle?'
      ]);
    } catch (err) {
      console.error('Chassis interview generation failed:', err);
      setInterviewError(
        err instanceof Error
          ? err.message
          : 'Unable to generate targeted chassis questions. You can enter answers or proceed directly to synthesis.'
      );
      // Fallback questions if error occurs
      setInterviewQuestions([
        'What major mechanical or cosmetic services have been completed during your ownership?',
        'Are there any known blemishes, modifications, or deviations from factory specification?',
        'What documented records, spare keys, or original equipment accompany the vehicle?'
      ]);
    } finally {
      setIsLoadingInterview(false);
    }
  };

  const handleAnswerChange = (index: number, value: string) => {
    setInterviewAnswers((prev) => ({
      ...prev,
      [String(index)]: value
    }));
  };

  const handleSkipQuestion = (index: number) => {
    setInterviewAnswers((prev) => ({
      ...prev,
      [String(index)]: ''
    }));
  };

  // Trigger Editorial Synthesis
  const handleSynthesizeDraft = async () => {
    setSynthesisError(null);
    setIsSynthesizing(true);
    setStep(3);

    try {
      // Prepare documents with base64 data
      const documentsPayload = uploadedFiles
        .filter((f) => !!f.dataBase64)
        .map((f) => ({
          name: f.name,
          mimeType: f.mimeType,
          dataBase64: f.dataBase64!
        }));

      // Augment base draft with any fallback taxonomy inputs if needed
      const baseDraft: Partial<ListingDraftSchema> = {
        ...(currentDraftContext || {}),
        year: effectiveYear || currentDraftContext?.year || '',
        make: effectiveMake || currentDraftContext?.make || '',
        model: effectiveModel || currentDraftContext?.model || '',
        generation: effectiveGeneration || currentDraftContext?.generation || ''
      };

      const result = await synthesizeListingDraft({
        notes,
        documents: documentsPayload.length > 0 ? documentsPayload : undefined,
        interviewAnswers,
        baseDraft
      });

      setSynthesizedDraft(result);
    } catch (err) {
      console.error('Editorial synthesis failed:', err);
      setSynthesisError(
        err instanceof Error
          ? err.message
          : 'Editorial synthesis encountered an unexpected issue. Please retry.'
      );
    } finally {
      setIsSynthesizing(false);
    }
  };

  // Apply selected sections to listing
  const handleApply = () => {
    if (!synthesizedDraft) return;
    onApply(synthesizedDraft, selectedSections);
    onClose();
  };

  const selectedCount = Object.values(selectedSections).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">AI Listing Writing Assistant</h2>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                  Intake Wizard
                </span>
              </div>
              <p className="text-xs text-slate-400">Guided Consignment Intake & Vehicle Storytelling</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSynthesizing || isLoadingInterview || isConvertingFiles}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Close Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Progress Bar */}
        <div className="px-6 py-3 bg-slate-950/50 border-b border-slate-800/80 flex items-center justify-between text-xs font-medium">
          <div className="flex items-center gap-2 sm:gap-4 w-full">
            {/* Step 1 Pill */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition ${
                step === 1
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                  : step > 1
                  ? 'bg-slate-800/60 border-slate-700 text-emerald-400'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === 1
                    ? 'bg-amber-500 text-slate-950'
                    : step > 1
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {step > 1 ? <Check className="w-3 h-3 stroke-[3]" /> : '1'}
              </span>
              <span>1. Ingestion</span>
            </div>

            <div className="flex-1 h-[2px] bg-slate-800">
              <div
                className="h-full bg-amber-500 transition-all duration-300"
                style={{ width: step === 1 ? '0%' : step === 2 ? '50%' : '100%' }}
              />
            </div>

            {/* Step 2 Pill */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition ${
                step === 2
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                  : step > 2
                  ? 'bg-slate-800/60 border-slate-700 text-emerald-400'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === 2
                    ? 'bg-amber-500 text-slate-950'
                    : step > 2
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {step > 2 ? <Check className="w-3 h-3 stroke-[3]" /> : '2'}
              </span>
              <span>2. Chassis Interview</span>
            </div>

            <div className="flex-1 h-[2px] bg-slate-800">
              <div
                className="h-full bg-amber-500 transition-all duration-300"
                style={{ width: step < 3 ? '0%' : '100%' }}
              />
            </div>

            {/* Step 3 Pill */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition ${
                step === 3
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === 3 ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                }`}
              >
                3
              </span>
              <span>3. Editorial Preview</span>
            </div>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* STEP 1: Ingestion */}
          {step === 1 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h3 className="text-base font-semibold text-white mb-1">
                  Step 1: Provenance Records & Raw Seller Notes
                </h3>
                <p className="text-xs text-slate-400">
                  Upload PDF inspection logs, maintenance invoices, or high-res photos. Paste in your maintenance journal or click guidance headers to structure your intake notes.
                </p>
              </div>

              {/* Error banner */}
              {fileError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-400 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{fileError}</span>
                  <button
                    onClick={() => setFileError(null)}
                    className="p-1 hover:text-white rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* File Dropzone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-amber-500/60 rounded-xl p-6 bg-slate-950/40 hover:bg-slate-950/70 transition cursor-pointer flex flex-col items-center justify-center text-center group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    if (e.target.files) processFiles(e.target.files);
                  }}
                  multiple
                  accept=".pdf,image/png,image/jpeg,image/jpg"
                  className="hidden"
                />
                <div className="p-3 rounded-full bg-slate-900 border border-slate-800 text-slate-400 group-hover:text-amber-400 group-hover:border-amber-500/30 transition mb-3">
                  {isConvertingFiles ? (
                    <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                  ) : (
                    <UploadCloud className="w-6 h-6" />
                  )}
                </div>
                <p className="text-sm font-medium text-slate-200 mb-1">
                  Drag & drop inspection documents, invoices, or photos
                </p>
                <p className="text-xs text-slate-400 mb-3">
                  or <span className="text-amber-400 underline decoration-amber-500/40 underline-offset-2">browse files</span> from your computer
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                    PDFs ≤ 25MB
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                    Images ≤ 20MB
                  </span>
                </div>
              </div>

              {/* Uploaded File Chip List */}
              {uploadedFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Attached Provenance Documents ({uploadedFiles.length})</span>
                    {isConvertingFiles && (
                      <span className="text-amber-400 flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" /> Processing base64 attachments...
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {uploadedFiles.map((item, idx) => {
                      const isPdf = item.mimeType === 'application/pdf';
                      return (
                        <div
                          key={`${item.name}-${idx}`}
                          className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-700/80 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0 mr-2">
                            {isPdf ? (
                              <FileText className="w-4 h-4 text-red-400 shrink-0" />
                            ) : (
                              <ImageIcon className="w-4 h-4 text-sky-400 shrink-0" />
                            )}
                            <div className="truncate">
                              <p className="text-slate-200 font-medium truncate">{item.name}</p>
                              <p className="text-[10px] text-slate-400">{formatFileSize(item.size)}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveFile(idx);
                            }}
                            className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700 transition"
                            title="Remove file"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Guidance Prompt Chips */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">
                    Seller Notes & Maintenance Logs
                  </label>
                  <span className="text-[11px] text-slate-500">Insert guided provenance headers:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {GUIDANCE_CHIPS.map((chip, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => appendGuidanceChip(chip.text)}
                      className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800 hover:bg-amber-500/10 hover:text-amber-300 border border-slate-700 hover:border-amber-500/40 text-slate-300 transition"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={6}
                  placeholder="Paste raw maintenance invoices, ownership narrative, collector provenance, paint meter readings, modifications, or mechanic summaries here..."
                  className="w-full px-3.5 py-3 rounded-xl bg-slate-950/70 border border-slate-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 text-slate-200 text-xs sm:text-sm font-mono placeholder:font-sans placeholder:text-slate-500 transition resize-y"
                />
              </div>

              {/* Vehicle Context Preview / Fallback taxonomy */}
              {(!effectiveYear || !effectiveMake || !effectiveModel) && (
                <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                    <Car className="w-4 h-4" />
                    <span>Chassis Taxonomy Context</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Specify vehicle details to calibrate targeted provenance interview questions:
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase font-semibold">Year</label>
                      <input
                        type="text"
                        value={fallbackYear}
                        onChange={(e) => setFallbackYear(e.target.value)}
                        placeholder="1998"
                        className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase font-semibold">Make</label>
                      <input
                        type="text"
                        value={fallbackMake}
                        onChange={(e) => setFallbackMake(e.target.value)}
                        placeholder="Porsche"
                        className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase font-semibold">Model</label>
                      <input
                        type="text"
                        value={fallbackModel}
                        onChange={(e) => setFallbackModel(e.target.value)}
                        placeholder="911 Carrera"
                        className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase font-semibold">Generation</label>
                      <input
                        type="text"
                        value={fallbackGeneration}
                        onChange={(e) => setFallbackGeneration(e.target.value)}
                        placeholder="993"
                        className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Chassis Interview */}
          {step === 2 && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Step 2: Chassis Interview
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Targeted provenance questions tailored for{' '}
                    <span className="text-amber-400 font-medium">
                      {[effectiveYear, effectiveMake, effectiveModel, effectiveGeneration ? `(${effectiveGeneration})` : '']
                        .filter(Boolean)
                        .join(' ') || 'Collector Vehicle'}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleProceedToInterview}
                  disabled={isLoadingInterview}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-400 transition"
                  title="Regenerate questions"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingInterview ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Refresh Questions</span>
                </button>
              </div>

              {interviewError && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-3 text-amber-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{interviewError}</span>
                </div>
              )}

              {isLoadingInterview ? (
                <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                  <p className="text-sm font-medium text-slate-200">
                    Formulating chassis-specific provenance questions...
                  </p>
                  <p className="text-xs text-slate-400 max-w-sm">
                    Analyzing model history, vulnerable components, and collector nuances for {effectiveMake} {effectiveModel}.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {interviewQuestions.map((question, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <p className="text-xs sm:text-sm font-medium text-slate-200">{question}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSkipQuestion(idx)}
                          className="text-[11px] text-slate-400 hover:text-slate-200 underline underline-offset-2 shrink-0 transition"
                        >
                          Skip
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        value={interviewAnswers[String(idx)] || ''}
                        onChange={(e) => handleAnswerChange(idx, e.target.value)}
                        placeholder="Provide details or service documentation notes (optional)..."
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 text-xs sm:text-sm text-slate-200 placeholder:text-slate-500 transition resize-y"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Editorial Preview & Selective Hydration */}
          {step === 3 && (
            <div className="space-y-6 animate-fade-in">
              {/* High-visibility loading overlay while AI synthesizes */}
              {isSynthesizing && (
                <div className="py-16 flex flex-col items-center justify-center text-center space-y-5">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-2 border-amber-500/20 border-t-amber-500 animate-spin" />
                    <Sparkles className="w-6 h-6 text-amber-400 absolute inset-0 m-auto" />
                  </div>
                  <div className="space-y-2 max-w-md">
                    <p className="text-sm font-semibold text-white tracking-wide">
                      Generating Collector-Grade Editorial Draft
                    </p>
                    <div className="h-6 flex items-center justify-center">
                      <p className="text-xs text-amber-400/90 font-mono transition-opacity duration-300">
                        {LOADING_TICKER_MESSAGES[tickerIndex]}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Error banner with retry button */}
              {synthesisError && !isSynthesizing && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl space-y-3 text-xs text-red-400">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="font-semibold">Synthesis Error</span>
                  </div>
                  <p>{synthesisError}</p>
                  <div className="pt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSynthesizeDraft}
                      className="px-3 py-1.5 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600 transition flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Retry Synthesis
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
                    >
                      Back to Interview
                    </button>
                  </div>
                </div>
              )}

              {/* Synthesized Draft Preview Cards */}
              {!isSynthesizing && synthesizedDraft && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div>
                      <h3 className="text-base font-semibold text-white">
                        Curated Editorial Review & Selective Hydration
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Select which curated sections to apply into your auction listing workspace.
                      </p>
                    </div>
                    <div className="text-xs text-slate-400 font-mono">
                      {selectedCount} / 4 sections selected
                    </div>
                  </div>

                  {/* Card 1: Identity & Specs */}
                  <div
                    className={`rounded-xl border transition p-4 ${
                      selectedSections.identity
                        ? 'bg-slate-950/80 border-amber-500/40 shadow-sm'
                        : 'bg-slate-950/30 border-slate-800/80 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedSections.identity}
                          onChange={(e) =>
                            setSelectedSections((prev) => ({ ...prev, identity: e.target.checked }))
                          }
                          className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500/50 bg-slate-900 border-slate-700 cursor-pointer"
                        />
                        <span className="text-sm font-semibold text-white">
                          Identity & Specifications
                        </span>
                      </label>
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                        Section 1
                      </span>
                    </div>

                    <div className="pt-3 space-y-3 text-xs">
                      <div>
                        <p className="text-base font-bold text-white tracking-wide">
                          {synthesizedDraft.title || 'Untitled Vehicle'}
                        </p>
                        <p className="text-xs text-amber-400/90 font-medium mt-0.5">
                          {synthesizedDraft.subtitle}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                        <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                          <span className="text-slate-500 block text-[9px] uppercase">VIN</span>
                          <span className="text-slate-200">{synthesizedDraft.vin || '—'}</span>
                        </div>
                        <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                          <span className="text-slate-500 block text-[9px] uppercase">Mileage</span>
                          <span className="text-slate-200">
                            {synthesizedDraft.mileage ? `${Number(synthesizedDraft.mileage).toLocaleString()} ${synthesizedDraft.distanceUnit || 'km'}` : '—'}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                          <span className="text-slate-500 block text-[9px] uppercase">Powertrain</span>
                          <span className="text-slate-200 truncate block" title={synthesizedDraft.engine}>
                            {synthesizedDraft.engine || '—'}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                          <span className="text-slate-500 block text-[9px] uppercase">Gearbox</span>
                          <span className="text-slate-200 truncate block" title={synthesizedDraft.gearbox}>
                            {synthesizedDraft.gearbox || '—'}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                          <span className="text-slate-500 block text-[9px] uppercase">Exterior</span>
                          <span className="text-slate-200">{synthesizedDraft.exteriorColor || '—'}</span>
                        </div>
                        <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                          <span className="text-slate-500 block text-[9px] uppercase">Interior</span>
                          <span className="text-slate-200">{synthesizedDraft.interior || '—'}</span>
                        </div>
                        <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                          <span className="text-slate-500 block text-[9px] uppercase">Title Status</span>
                          <span className="text-slate-200">{synthesizedDraft.titleStatus || '—'}</span>
                        </div>
                        <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                          <span className="text-slate-500 block text-[9px] uppercase">Location</span>
                          <span className="text-slate-200 truncate block">{synthesizedDraft.location || '—'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Overview Narrative */}
                  <div
                    className={`rounded-xl border transition p-4 ${
                      selectedSections.narrative
                        ? 'bg-slate-950/80 border-amber-500/40 shadow-sm'
                        : 'bg-slate-950/30 border-slate-800/80 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedSections.narrative}
                          onChange={(e) =>
                            setSelectedSections((prev) => ({ ...prev, narrative: e.target.checked }))
                          }
                          className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500/50 bg-slate-900 border-slate-700 cursor-pointer"
                        />
                        <span className="text-sm font-semibold text-white">
                          Wailtail Curated Editorial Narrative
                        </span>
                      </label>
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                        Section 2
                      </span>
                    </div>

                    <div className="pt-3 space-y-2.5 text-xs text-slate-300 leading-relaxed">
                      {synthesizedDraft.overviewHeading && (
                        <h4 className="text-sm font-semibold text-slate-100">
                          {synthesizedDraft.overviewHeading}
                        </h4>
                      )}
                      {Array.isArray(synthesizedDraft.overviewNarrative) &&
                      synthesizedDraft.overviewNarrative.length > 0 ? (
                        synthesizedDraft.overviewNarrative.map((paragraph, pIdx) => (
                          <p key={pIdx} className="text-slate-300">
                            {paragraph}
                          </p>
                        ))
                      ) : (
                        <p className="text-slate-500 italic">No overview paragraphs generated.</p>
                      )}
                    </div>
                  </div>

                  {/* Card 3: Curated Showcase Chapters */}
                  <div
                    className={`rounded-xl border transition p-4 ${
                      selectedSections.showcase
                        ? 'bg-slate-950/80 border-amber-500/40 shadow-sm'
                        : 'bg-slate-950/30 border-slate-800/80 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedSections.showcase}
                          onChange={(e) =>
                            setSelectedSections((prev) => ({ ...prev, showcase: e.target.checked }))
                          }
                          className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500/50 bg-slate-900 border-slate-700 cursor-pointer"
                        />
                        <span className="text-sm font-semibold text-white">
                          Curated Showcase Chapters & Technical Spec Cards
                        </span>
                      </label>
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                        Section 4
                      </span>
                    </div>

                    <div className="pt-3 space-y-3">
                      {Array.isArray(synthesizedDraft.showcaseChapters) &&
                      synthesizedDraft.showcaseChapters.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {synthesizedDraft.showcaseChapters.map((chapter, cIdx) => (
                            <div
                              key={cIdx}
                              className="p-3 rounded-lg bg-slate-900/70 border border-slate-800/90 space-y-2 text-xs"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-amber-400 uppercase tracking-wider text-[11px]">
                                  {chapter.category || `Chapter ${cIdx + 1}`}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {chapter.title}
                                </span>
                              </div>
                              {chapter.subtitle && (
                                <p className="text-slate-300 font-medium text-[11px]">
                                  {chapter.subtitle}
                                </p>
                              )}
                              {chapter.highlights && chapter.highlights.length > 0 && (
                                <ul className="space-y-1 pt-1">
                                  {chapter.highlights.slice(0, 3).map((hl, hIdx) => (
                                    <li key={hIdx} className="flex items-center gap-1.5 text-slate-300 text-[11px]">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                                      <span className="truncate">{hl}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {chapter.specCards && chapter.specCards.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-1">
                                  {chapter.specCards.map((sc, scIdx) => (
                                    <span
                                      key={scIdx}
                                      className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 font-mono border border-slate-700/60"
                                    >
                                      {sc.key}: {sc.value}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-500 italic text-xs">No showcase chapters generated.</p>
                      )}
                    </div>
                  </div>

                  {/* Card 4: CAD Financials */}
                  <div
                    className={`rounded-xl border transition p-4 ${
                      selectedSections.financials
                        ? 'bg-slate-950/80 border-amber-500/40 shadow-sm'
                        : 'bg-slate-950/30 border-slate-800/80 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedSections.financials}
                          onChange={(e) =>
                            setSelectedSections((prev) => ({ ...prev, financials: e.target.checked }))
                          }
                          className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500/50 bg-slate-900 border-slate-700 cursor-pointer"
                        />
                        <span className="text-sm font-semibold text-white">
                          CAD Financials & Auction Rules
                        </span>
                      </label>
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                        Section 7
                      </span>
                    </div>

                    <div className="pt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                      <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                        <span className="text-slate-500 block text-[9px] uppercase font-sans">
                          Starting Bid
                        </span>
                        <span className="text-sm font-semibold text-slate-100">
                          ${Number(synthesizedDraft.financials?.startingBid || 0).toLocaleString()} CAD
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                        <span className="text-slate-500 block text-[9px] uppercase font-sans">
                          Reserve Expectation
                        </span>
                        <span className="text-sm font-semibold text-slate-100">
                          {Number(synthesizedDraft.financials?.reserveAmount || 0) === 0
                            ? 'No Reserve ($0 CAD)'
                            : `$${Number(synthesizedDraft.financials?.reserveAmount).toLocaleString()} CAD`}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                        <span className="text-slate-500 block text-[9px] uppercase font-sans">
                          Min Increment
                        </span>
                        <span className="text-sm font-semibold text-slate-100">
                          ${Number(synthesizedDraft.financials?.minimumIncrement || 100).toLocaleString()} CAD
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                        <span className="text-slate-500 block text-[9px] uppercase font-sans">
                          Auction Duration
                        </span>
                        <span className="text-sm font-semibold text-slate-100">
                          {synthesizedDraft.financials?.durationDays || 7} Days
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Bottom Actions */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/80 backdrop-blur flex items-center justify-between">
          {step === 1 && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProceedToInterview}
                disabled={isConvertingFiles}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center gap-2 shadow-lg shadow-amber-500/10 disabled:opacity-50"
              >
                <span>Proceed to Chassis Interview</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Notes</span>
              </button>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleSynthesizeDraft}
                  disabled={isLoadingInterview}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
                >
                  Skip Interview
                </button>
                <button
                  type="button"
                  onClick={handleSynthesizeDraft}
                  disabled={isLoadingInterview}
                  className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center gap-2 shadow-lg shadow-amber-500/10 disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Synthesize Editorial Draft</span>
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <button
                type="button"
                disabled={isSynthesizing}
                onClick={() => setStep(2)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                disabled={isSynthesizing || !synthesizedDraft || selectedCount === 0}
                onClick={handleApply}
                className="px-6 py-2.5 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition flex items-center gap-2 shadow-lg shadow-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Apply to Listing ({selectedCount} Sections Selected)</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AiAssistantModal;
