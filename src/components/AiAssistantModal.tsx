import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Sparkles,
  X,
  UploadCloud,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
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
import vehicleTaxonomyRaw from '../data/vehicleTaxonomy.json';

interface TaxonomyModel {
  name: string;
  generations?: string[];
}

interface TaxonomyMake {
  models: TaxonomyModel[];
}

const vehicleTaxonomy: Record<string, TaxonomyMake> = vehicleTaxonomyRaw as Record<string, TaxonomyMake>;
export const TAXONOMY_OTHER_CUSTOM = '__OTHER_CUSTOM__';
export const AVAILABLE_MAKES = Object.keys(vehicleTaxonomy).sort((a, b) => a.localeCompare(b));
export const YEARS = Array.from({ length: 2026 - 1930 + 1 }, (_, i) => String(2026 - i));

const isCustomValue = (val: string | undefined | null) =>
  val === TAXONOMY_OTHER_CUSTOM || val === 'OTHER_CUSTOM';

const getAvailableModels = (makeKey: string): string[] => {
  if (!makeKey || isCustomValue(makeKey)) return [];
  const entry = vehicleTaxonomy[makeKey];
  if (!entry) return [];
  if (Array.isArray(entry.models)) {
    return entry.models.map((m: any) => (typeof m === 'string' ? m : m.name));
  }
  if (typeof entry === 'object') {
    return Object.keys(entry);
  }
  return [];
};

const getAvailableGenerations = (makeKey: string, modelKey: string): string[] => {
  if (!makeKey || isCustomValue(makeKey) || !modelKey || isCustomValue(modelKey)) return [];
  const entry = vehicleTaxonomy[makeKey];
  if (!entry) return [];
  if (Array.isArray(entry.models)) {
    const modelObj = entry.models.find(
      (m: any) => (typeof m === 'string' ? m : m.name).toLowerCase() === modelKey.toLowerCase()
    );
    if (modelObj && Array.isArray(modelObj.generations)) {
      return modelObj.generations;
    }
  }
  if ((entry as any)[modelKey] && Array.isArray((entry as any)[modelKey])) {
    return (entry as any)[modelKey];
  }
  return [];
};

export const resolveMakeState = (rawMake: string | undefined | null) => {
  const trimmed = (rawMake ?? '').trim();
  if (!trimmed || isCustomValue(trimmed)) {
    return { dropdown: trimmed ? TAXONOMY_OTHER_CUSTOM : '', custom: '' };
  }
  if (vehicleTaxonomy[trimmed]) {
    return { dropdown: trimmed, custom: '' };
  }
  const matchedKey = Object.keys(vehicleTaxonomy).find(
    (k) => k.toLowerCase() === trimmed.toLowerCase()
  );
  if (matchedKey) {
    return { dropdown: matchedKey, custom: '' };
  }
  return { dropdown: TAXONOMY_OTHER_CUSTOM, custom: trimmed };
};

export const resolveModelState = (
  selectedMakeDropdown: string,
  rawModel: string | undefined | null
) => {
  const trimmed = (rawModel ?? '').trim();
  if (!trimmed || isCustomValue(trimmed)) {
    return { dropdown: trimmed ? TAXONOMY_OTHER_CUSTOM : '', custom: '' };
  }
  if (selectedMakeDropdown && !isCustomValue(selectedMakeDropdown)) {
    const models = getAvailableModels(selectedMakeDropdown);
    const match = models.find((m) => m.toLowerCase() === trimmed.toLowerCase());
    if (match) {
      return { dropdown: match, custom: '' };
    }
  }
  return { dropdown: TAXONOMY_OTHER_CUSTOM, custom: trimmed };
};

export const resolveGenerationState = (
  selectedMakeDropdown: string,
  selectedModelDropdown: string,
  rawGeneration: string | undefined | null
) => {
  const trimmed = (rawGeneration ?? '').trim();
  if (!trimmed || isCustomValue(trimmed)) {
    return { dropdown: trimmed ? TAXONOMY_OTHER_CUSTOM : '', custom: '' };
  }
  if (
    selectedMakeDropdown &&
    !isCustomValue(selectedMakeDropdown) &&
    selectedModelDropdown &&
    !isCustomValue(selectedModelDropdown)
  ) {
    const generations = getAvailableGenerations(selectedMakeDropdown, selectedModelDropdown);
    const match = generations.find((g) => g.toLowerCase() === trimmed.toLowerCase());
    if (match) {
      return { dropdown: match, custom: '' };
    }
  }
  return { dropdown: TAXONOMY_OTHER_CUSTOM, custom: trimmed };
};

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

const MAX_CUMULATIVE_SIZE_BYTES = 3.0 * 1024 * 1024; // 3.0 MB cumulative attachment ceiling
const MAX_PDF_SIZE_BYTES = 3.0 * 1024 * 1024; // 3 MB max for individual PDF
const MAX_IMG_RAW_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB raw input limit before micro-compression

/**
 * Micro-compresses an uploaded image using an HTML5 Canvas scaled to a max dimension
 * of 1200px (preserving aspect ratio) and exported via canvas.toDataURL('image/jpeg', 0.75).
 */
function compressImage(file: File): Promise<{ dataBase64: string; mimeType: string; size: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read image file "${file.name}".`));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error(`Failed to load image "${file.name}". The image may be corrupted or unsupported.`));
      img.onload = () => {
        try {
          const maxDim = 1200;
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to acquire canvas context for image micro-compression.'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
          const commaIdx = dataUrl.indexOf(',');
          const dataBase64 = commaIdx !== -1 ? dataUrl.substring(commaIdx + 1) : dataUrl;
          const approxSizeBytes = Math.round((dataBase64.length * 3) / 4);

          resolve({
            dataBase64,
            mimeType: 'image/jpeg',
            size: approxSizeBytes
          });
        } catch (canvasErr) {
          reject(canvasErr);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export type ProvenanceCategoryKey = 'ownership' | 'services' | 'flaws' | 'modifications';

export interface StructuredProvenance {
  ownership: {
    previousOwners: string;
    ownershipDuration: string;
    climateStorage: string;
    odometerIntegrity: string;
  };
  services: {
    recentSummary: string;
    serviceFacility: string;
    timingMileage: string;
    mechanicalNeeds: string;
  };
  flaws: {
    paintReadings: string;
    knownFlaws: string;
    imperfectionDisclosures: string;
    accidentHistory: string;
  };
  modifications: {
    factoryOptions: string;
    modifications: string;
  };
}

const PROVENANCE_CATEGORIES: {
  key: ProvenanceCategoryKey;
  label: string;
}[] = [
  { key: 'ownership', label: 'Ownership & Mileage History' },
  { key: 'services', label: 'Major Services & Invoices' },
  { key: 'flaws', label: 'Paint Meter, Flaws & Accidents' },
  { key: 'modifications', label: 'Factory Options & Modifications' }
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

  // Step 1: Ingestion State (Structured Provenance Drawers & Freeform Notes)
  const [structuredProvenance, setStructuredProvenance] = useState<StructuredProvenance>({
    ownership: {
      previousOwners: '',
      ownershipDuration: '',
      climateStorage: '',
      odometerIntegrity: ''
    },
    services: {
      recentSummary: '',
      serviceFacility: '',
      timingMileage: '',
      mechanicalNeeds: ''
    },
    flaws: {
      paintReadings: '',
      knownFlaws: '',
      imperfectionDisclosures: '',
      accidentHistory: ''
    },
    modifications: {
      factoryOptions: '',
      modifications: ''
    }
  });

  const [activeDrawers, setActiveDrawers] = useState<Record<ProvenanceCategoryKey, boolean>>({
    ownership: false,
    services: false,
    flaws: false,
    modifications: false
  });

  const [freeformNotes, setFreeformNotes] = useState<string>('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileItem[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isConvertingFiles, setIsConvertingFiles] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Step 2: Chassis Interview State
  const [interviewQuestions, setInterviewQuestions] = useState<string[]>([]);
  const [interviewAnswers, setInterviewAnswers] = useState<Record<string, string>>({});
  const [isLoadingInterview, setIsLoadingInterview] = useState<boolean>(false);
  const [interviewError, setInterviewError] = useState<string | null>(null);

  // Dedicated Vehicle Context Cascading Dropdown State & Custom Fallbacks
  const initialMake = resolveMakeState(currentDraftContext?.make);
  const initialModel = resolveModelState(initialMake.dropdown, currentDraftContext?.model);
  const initialGen = resolveGenerationState(initialMake.dropdown, initialModel.dropdown, currentDraftContext?.generation);

  const [selectedYear, setSelectedYear] = useState<string>(() =>
    currentDraftContext?.year ? String(currentDraftContext.year).trim() : ''
  );
  const [selectedMake, setSelectedMake] = useState<string>(initialMake.dropdown);
  const [customMake, setCustomMake] = useState<string>(initialMake.custom);
  const [selectedModel, setSelectedModel] = useState<string>(initialModel.dropdown);
  const [customModel, setCustomModel] = useState<string>(initialModel.custom);
  const [selectedGeneration, setSelectedGeneration] = useState<string>(initialGen.dropdown);
  const [customGeneration, setCustomGeneration] = useState<string>(initialGen.custom);
  const [vehicleContextError, setVehicleContextError] = useState<string | null>(null);

  // Available options derived dynamically from vehicleTaxonomy
  const availableModels = useMemo(() => {
    return getAvailableModels(selectedMake);
  }, [selectedMake]);

  const availableGenerations = useMemo(() => {
    return getAvailableGenerations(selectedMake, selectedModel);
  }, [selectedMake, selectedModel]);

  // Derived canonical effective vehicle context
  const effectiveVehicleContext = useMemo(() => {
    const year = selectedYear.trim();
    const make = selectedMake === TAXONOMY_OTHER_CUSTOM ? customMake.trim() : selectedMake.trim();
    const model = selectedModel === TAXONOMY_OTHER_CUSTOM ? customModel.trim() : selectedModel.trim();
    const generation = selectedGeneration === TAXONOMY_OTHER_CUSTOM ? customGeneration.trim() : selectedGeneration.trim();
    return {
      year,
      make,
      model,
      generation
    };
  }, [selectedYear, selectedMake, customMake, selectedModel, customModel, selectedGeneration, customGeneration]);

  const handleMakeChange = (newMake: string) => {
    setSelectedMake(newMake);
    if (vehicleContextError) setVehicleContextError(null);
    if (newMake === TAXONOMY_OTHER_CUSTOM) {
      setCustomMake('');
      setSelectedModel(TAXONOMY_OTHER_CUSTOM);
      setCustomModel('');
      setSelectedGeneration(TAXONOMY_OTHER_CUSTOM);
      setCustomGeneration('');
    } else {
      setCustomMake('');
      setSelectedModel('');
      setCustomModel('');
      setSelectedGeneration('');
      setCustomGeneration('');
    }
  };

  const handleModelChange = (newModel: string) => {
    setSelectedModel(newModel);
    if (vehicleContextError) setVehicleContextError(null);
    if (newModel !== TAXONOMY_OTHER_CUSTOM) {
      setCustomModel('');
    }
    setSelectedGeneration(newModel === TAXONOMY_OTHER_CUSTOM ? TAXONOMY_OTHER_CUSTOM : '');
    setCustomGeneration('');
  };

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
      const yearVal = currentDraftContext?.year ? String(currentDraftContext.year).trim() : '';
      const makeVal = resolveMakeState(currentDraftContext?.make);
      const modelVal = resolveModelState(makeVal.dropdown, currentDraftContext?.model);
      const genVal = resolveGenerationState(makeVal.dropdown, modelVal.dropdown, currentDraftContext?.generation);

      setSelectedYear(yearVal);
      setSelectedMake(makeVal.dropdown);
      setCustomMake(makeVal.custom);
      setSelectedModel(modelVal.dropdown);
      setCustomModel(modelVal.custom);
      setSelectedGeneration(genVal.dropdown);
      setCustomGeneration(genVal.custom);
    } else {
      // Clean state on modal close
      setStep(1);
      setFileError(null);
      setInterviewError(null);
      setSynthesisError(null);
      setVehicleContextError(null);
      setActiveDrawers({
        ownership: false,
        services: false,
        flaws: false,
        modifications: false
      });
      setStructuredProvenance({
        ownership: { previousOwners: '', ownershipDuration: '', climateStorage: '', odometerIntegrity: '' },
        services: { recentSummary: '', serviceFacility: '', timingMileage: '', mechanicalNeeds: '' },
        flaws: { paintReadings: '', knownFlaws: '', imperfectionDisclosures: '', accidentHistory: '' },
        modifications: { factoryOptions: '', modifications: '' }
      });
      setFreeformNotes('');
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

  // Ensure modal scroll container defaults to scrollTop = 0 when opening or transitioning between steps
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [isOpen, step]);

  if (!isOpen) return null;

  // File size formatter
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Handle file uploads with micro-compression, cumulative budget check, and Base64 encoding
  const processFiles = async (files: FileList | File[]) => {
    setFileError(null);
    if (!files || files.length === 0) return;

    setIsConvertingFiles(true);
    try {
      const currentTotalBytes = uploadedFiles.reduce((acc, f) => acc + f.size, 0);
      let runningTotalBytes = currentTotalBytes;
      const newItems: UploadedFileItem[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);

        if (!isPdf && !isImage) {
          setFileError(`Unsupported file format for "${file.name}". Please attach PDF documents or PNG/JPEG images.`);
          continue;
        }

        if (isPdf && file.size > MAX_PDF_SIZE_BYTES) {
          setFileError(`File "${file.name}" exceeds the 3MB limit for PDF inspection documents.`);
          continue;
        }

        if (isImage && file.size > MAX_IMG_RAW_SIZE_BYTES) {
          setFileError(`Image "${file.name}" exceeds the 20MB limit for source document photos.`);
          continue;
        }

        try {
          if (isImage) {
            const compressed = await compressImage(file);
            if (runningTotalBytes + compressed.size > MAX_CUMULATIVE_SIZE_BYTES) {
              setFileError(
                'Total attachment size for AI extraction cannot exceed 3MB. Please attach only key service records or invoices.'
              );
              return;
            }
            runningTotalBytes += compressed.size;
            newItems.push({
              file,
              name: file.name,
              size: compressed.size,
              mimeType: compressed.mimeType,
              dataBase64: compressed.dataBase64
            });
          } else {
            // PDF
            if (runningTotalBytes + file.size > MAX_CUMULATIVE_SIZE_BYTES) {
              setFileError(
                'Total attachment size for AI extraction cannot exceed 3MB. Please attach only key service records or invoices.'
              );
              return;
            }
            const encoded = await encodeFileToBase64(file);
            runningTotalBytes += file.size;
            newItems.push({
              file,
              name: file.name,
              size: file.size,
              mimeType: encoded.mimeType || 'application/pdf',
              dataBase64: encoded.dataBase64
            });
          }
        } catch (itemErr) {
          console.error(`Error processing file "${file.name}":`, itemErr);
          setFileError(
            itemErr instanceof Error
              ? itemErr.message
              : `Unable to process file "${file.name}". The file may be invalid or corrupted.`
          );
        }
      }

      if (newItems.length > 0) {
        setUploadedFiles((prev) => [...prev, ...newItems]);
      }
    } catch (err) {
      console.error('File processing error:', err);
      setFileError('Failed to process one or more files. Please try again.');
    } finally {
      setIsConvertingFiles(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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

  const toggleDrawer = (category: ProvenanceCategoryKey) => {
    setActiveDrawers((prev) => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const updateProvenance = <K extends ProvenanceCategoryKey>(
    category: K,
    field: keyof StructuredProvenance[K],
    value: string
  ) => {
    setStructuredProvenance((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: value
      }
    }));
  };

  const hasDrawerContent = (key: ProvenanceCategoryKey): boolean => {
    switch (key) {
      case 'ownership':
        return Boolean(
          structuredProvenance.ownership.previousOwners.trim() ||
          structuredProvenance.ownership.ownershipDuration.trim() ||
          structuredProvenance.ownership.climateStorage.trim() ||
          structuredProvenance.ownership.odometerIntegrity.trim()
        );
      case 'services':
        return Boolean(
          structuredProvenance.services.recentSummary.trim() ||
          structuredProvenance.services.serviceFacility.trim() ||
          structuredProvenance.services.timingMileage.trim() ||
          structuredProvenance.services.mechanicalNeeds.trim()
        );
      case 'flaws':
        return Boolean(
          structuredProvenance.flaws.paintReadings.trim() ||
          structuredProvenance.flaws.knownFlaws.trim() ||
          structuredProvenance.flaws.imperfectionDisclosures.trim() ||
          structuredProvenance.flaws.accidentHistory.trim()
        );
      case 'modifications':
        return Boolean(
          structuredProvenance.modifications.factoryOptions.trim() ||
          structuredProvenance.modifications.modifications.trim()
        );
      default:
        return false;
    }
  };

  const compileSellerNotes = (): string => {
    const sections: string[] = [];

    // 1. Ownership History
    const ownershipLines: string[] = [];
    if (structuredProvenance.ownership.previousOwners.trim()) {
      ownershipLines.push(`- Previous owners: ${structuredProvenance.ownership.previousOwners.trim()}`);
    }
    if (structuredProvenance.ownership.ownershipDuration.trim()) {
      ownershipLines.push(`- Current ownership duration: ${structuredProvenance.ownership.ownershipDuration.trim()}`);
    }
    if (structuredProvenance.ownership.climateStorage.trim()) {
      ownershipLines.push(`- Storage / climate exposure: ${structuredProvenance.ownership.climateStorage.trim()}`);
    }
    if (structuredProvenance.ownership.odometerIntegrity.trim()) {
      ownershipLines.push(`- Odometer & cluster integrity: ${structuredProvenance.ownership.odometerIntegrity.trim()}`);
    }
    if (ownershipLines.length > 0) {
      sections.push(`### Ownership History\n${ownershipLines.join('\n')}`);
    }

    // 2. Major Services & Invoices
    const serviceLines: string[] = [];
    if (structuredProvenance.services.recentSummary.trim()) {
      serviceLines.push(`- Recent work summary: ${structuredProvenance.services.recentSummary.trim()}`);
    }
    if (structuredProvenance.services.serviceFacility.trim()) {
      serviceLines.push(`- Service facility: ${structuredProvenance.services.serviceFacility.trim()}`);
    }
    if (structuredProvenance.services.timingMileage.trim()) {
      serviceLines.push(`- Date & mileage: ${structuredProvenance.services.timingMileage.trim()}`);
    }
    if (structuredProvenance.services.mechanicalNeeds.trim()) {
      serviceLines.push(`- Known mechanical needs / pending servicing: ${structuredProvenance.services.mechanicalNeeds.trim()}`);
    }
    if (serviceLines.length > 0) {
      sections.push(`### Major Services & Invoices\n${serviceLines.join('\n')}`);
    }

    // 3. Paint Meter & Flaws
    const flawLines: string[] = [];
    if (structuredProvenance.flaws.paintReadings.trim()) {
      flawLines.push(`- Paint meter readings: ${structuredProvenance.flaws.paintReadings.trim()}`);
    }
    if (structuredProvenance.flaws.knownFlaws.trim()) {
      flawLines.push(`- Known flaws / cosmetic imperfections: ${structuredProvenance.flaws.knownFlaws.trim()}`);
    }
    if (structuredProvenance.flaws.imperfectionDisclosures.trim()) {
      flawLines.push(`- Imperfection disclosures: ${structuredProvenance.flaws.imperfectionDisclosures.trim()}`);
    }
    if (structuredProvenance.flaws.accidentHistory.trim()) {
      flawLines.push(`- Accident & insurance claim history: ${structuredProvenance.flaws.accidentHistory.trim()}`);
    }
    if (flawLines.length > 0) {
      sections.push(`### Paint Meter & Flaws\n${flawLines.join('\n')}`);
    }

    // 4. Factory Options & Modifications
    const modLines: string[] = [];
    if (structuredProvenance.modifications.factoryOptions.trim()) {
      modLines.push(`- Notable factory options: ${structuredProvenance.modifications.factoryOptions.trim()}`);
    }
    if (structuredProvenance.modifications.modifications.trim()) {
      modLines.push(`- Aftermarket modifications: ${structuredProvenance.modifications.modifications.trim()}`);
    }
    if (modLines.length > 0) {
      sections.push(`### Factory Options & Modifications\n${modLines.join('\n')}`);
    }

    // 5. Additional Notes & Maintenance Logs
    if (freeformNotes.trim()) {
      sections.push(`### Additional Notes & Maintenance Logs\n${freeformNotes.trim()}`);
    }

    return sections.join('\n\n').trim();
  };

  // Trigger Chassis Interview generation
  const handleProceedToInterview = async () => {
    const trimmedYear = effectiveVehicleContext.year;
    const trimmedMake = effectiveVehicleContext.make;
    const trimmedModel = effectiveVehicleContext.model;

    if (!trimmedYear || !trimmedMake || !trimmedModel) {
      setVehicleContextError('Year, Make, and Model are required to proceed to the interview.');
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
      return;
    }

    setVehicleContextError(null);
    setInterviewError(null);
    setStep(2);

    if (interviewQuestions.length > 0) {
      return;
    }

    setIsLoadingInterview(true);
    try {
      const questions = await generateChassisInterview({
        year: trimmedYear,
        make: trimmedMake,
        model: trimmedModel,
        generation: effectiveVehicleContext.generation || undefined
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

      // Augment base draft with finalized effectiveVehicleContext
      const baseDraft: Partial<ListingDraftSchema> = {
        ...(currentDraftContext || {}),
        year: effectiveVehicleContext.year || currentDraftContext?.year || '',
        make: effectiveVehicleContext.make || currentDraftContext?.make || '',
        model: effectiveVehicleContext.model || currentDraftContext?.model || '',
        generation: effectiveVehicleContext.generation || currentDraftContext?.generation || ''
      };

      const compiledSellerNotes = compileSellerNotes();

      const result = await synthesizeListingDraft({
        notes: compiledSellerNotes,
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
        <div ref={scrollContainerRef} className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* STEP 1: Ingestion */}
          {step === 1 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h3 className="text-base font-semibold text-white mb-1">
                  Step 1: Provenance Records & Raw Seller Notes
                </h3>
                <p className="text-xs text-slate-400">
                  Upload PDF inspection logs, service records, or photos of physical invoices. Paste your maintenance journal or click guidance headers to structure your intake notes.
                </p>
              </div>

              {/* Permanent Top-Mounted Vehicle Identification & Details */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                  <Car className="w-4 h-4" />
                  <span>Vehicle Identification & Details</span>
                </div>
                <p className="text-xs text-slate-400">
                  Confirm the vehicle details used to calibrate provenance questions and editorial copy.
                </p>

                {vehicleContextError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2.5 text-red-400 text-xs">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{vehicleContextError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {/* Column 1: Year */}
                  <div>
                    <label className="text-[11px] text-slate-300 uppercase font-semibold tracking-wider">
                      Year *
                    </label>
                    <select
                      value={selectedYear}
                      onChange={(e) => {
                        setSelectedYear(e.target.value);
                        if (vehicleContextError) setVehicleContextError(null);
                      }}
                      className="w-full mt-1.5 border border-slate-700 bg-slate-800/80 text-white rounded-lg px-3 py-2 text-sm focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80 focus:outline-none cursor-pointer"
                    >
                      <option value="">Select Year...</option>
                      {selectedYear && !YEARS.includes(selectedYear) && (
                        <option value={selectedYear}>{selectedYear}</option>
                      )}
                      {YEARS.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Column 2: Make */}
                  <div>
                    <label className="text-[11px] text-slate-300 uppercase font-semibold tracking-wider">
                      Make *
                    </label>
                    <select
                      value={selectedMake}
                      onChange={(e) => handleMakeChange(e.target.value)}
                      className="w-full mt-1.5 border border-slate-700 bg-slate-800/80 text-white rounded-lg px-3 py-2 text-sm focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80 focus:outline-none cursor-pointer"
                    >
                      <option value="">Select Make...</option>
                      {AVAILABLE_MAKES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                      <option value={TAXONOMY_OTHER_CUSTOM}>Other / Custom...</option>
                    </select>
                    {selectedMake === TAXONOMY_OTHER_CUSTOM && (
                      <input
                        type="text"
                        placeholder="Enter custom make..."
                        value={customMake}
                        onChange={(e) => {
                          setCustomMake(e.target.value);
                          if (vehicleContextError) setVehicleContextError(null);
                        }}
                        className="w-full mt-2 border border-slate-700 bg-slate-800/80 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80 focus:outline-none"
                      />
                    )}
                  </div>

                  {/* Column 3: Model */}
                  <div>
                    <label className="text-[11px] text-slate-300 uppercase font-semibold tracking-wider">
                      Model *
                    </label>
                    {selectedMake === TAXONOMY_OTHER_CUSTOM ? (
                      <input
                        type="text"
                        placeholder="Enter custom model..."
                        value={customModel}
                        onChange={(e) => {
                          setCustomModel(e.target.value);
                          setSelectedGeneration(TAXONOMY_OTHER_CUSTOM);
                          setCustomGeneration('');
                          if (vehicleContextError) setVehicleContextError(null);
                        }}
                        className="w-full mt-1.5 border border-slate-700 bg-slate-800/80 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80 focus:outline-none"
                      />
                    ) : (
                      <div>
                        <select
                          value={selectedModel}
                          onChange={(e) => handleModelChange(e.target.value)}
                          disabled={!selectedMake}
                          className={`w-full mt-1.5 border border-slate-700 bg-slate-800/80 text-white rounded-lg px-3 py-2 text-sm focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80 focus:outline-none ${
                            !selectedMake ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                          }`}
                        >
                          <option value="">{selectedMake ? 'Select Model...' : 'Select Make first...'}</option>
                          {availableModels.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                          {selectedMake && (
                            <option value={TAXONOMY_OTHER_CUSTOM}>Other / Custom...</option>
                          )}
                        </select>
                        {selectedModel === TAXONOMY_OTHER_CUSTOM && (
                          <input
                            type="text"
                            placeholder="Enter custom model..."
                            value={customModel}
                            onChange={(e) => {
                              setCustomModel(e.target.value);
                              setSelectedGeneration(TAXONOMY_OTHER_CUSTOM);
                              setCustomGeneration('');
                              if (vehicleContextError) setVehicleContextError(null);
                            }}
                            className="w-full mt-2 border border-slate-700 bg-slate-800/80 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80 focus:outline-none"
                          />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Column 4: Generation / Chassis Code */}
                  <div>
                    <label className="text-[11px] text-slate-300 uppercase font-semibold tracking-wider">
                      Generation / Chassis Code
                    </label>
                    {!selectedMake || (!selectedModel && selectedMake !== TAXONOMY_OTHER_CUSTOM) ? (
                      <select
                        disabled
                        className="w-full mt-1.5 border border-slate-700 bg-slate-800/80 text-slate-500 rounded-lg px-3 py-2 text-sm opacity-50 cursor-not-allowed focus:outline-none"
                      >
                        <option value="">Select Model first...</option>
                      </select>
                    ) : selectedMake === TAXONOMY_OTHER_CUSTOM || selectedModel === TAXONOMY_OTHER_CUSTOM ? (
                      <input
                        type="text"
                        placeholder="Enter custom generation..."
                        value={customGeneration}
                        onChange={(e) => {
                          setCustomGeneration(e.target.value);
                          setSelectedGeneration(TAXONOMY_OTHER_CUSTOM);
                        }}
                        className="w-full mt-1.5 border border-slate-700 bg-slate-800/80 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80 focus:outline-none"
                      />
                    ) : availableGenerations.length === 0 ? (
                      <div>
                        <select
                          disabled
                          className="w-full mt-1.5 border border-slate-700 bg-slate-800/80 text-slate-500 rounded-lg px-3 py-2 text-sm opacity-50 cursor-not-allowed focus:outline-none"
                        >
                          <option value="">N/A (No generations defined)</option>
                        </select>
                        <input
                          type="text"
                          placeholder="Optional custom generation..."
                          value={customGeneration}
                          onChange={(e) => {
                            setCustomGeneration(e.target.value);
                            setSelectedGeneration(TAXONOMY_OTHER_CUSTOM);
                          }}
                          className="w-full mt-2 border border-slate-700 bg-slate-800/80 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80 focus:outline-none"
                        />
                      </div>
                    ) : (
                      <div>
                        <select
                          value={selectedGeneration}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSelectedGeneration(val);
                            if (val !== TAXONOMY_OTHER_CUSTOM) {
                              setCustomGeneration('');
                            }
                          }}
                          className="w-full mt-1.5 border border-slate-700 bg-slate-800/80 text-white rounded-lg px-3 py-2 text-sm focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80 focus:outline-none cursor-pointer"
                        >
                          <option value="">Select Generation...</option>
                          {availableGenerations.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                          <option value={TAXONOMY_OTHER_CUSTOM}>Other / Custom...</option>
                        </select>
                        {selectedGeneration === TAXONOMY_OTHER_CUSTOM && (
                          <input
                            type="text"
                            placeholder="Enter custom generation..."
                            value={customGeneration}
                            onChange={(e) => setCustomGeneration(e.target.value)}
                            className="w-full mt-2 border border-slate-700 bg-slate-800/80 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80 focus:outline-none"
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Middle: Seller Notes & Vehicle Provenance */}
              <div className="space-y-4">
                {/* Sticky Header Dock for Guided Provenance */}
                <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-md py-3 -mx-6 px-6 border-b border-slate-800/80 shadow-lg space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <label className="text-xs font-semibold text-slate-300">
                      Seller Notes &amp; Vehicle Provenance
                    </label>
                    <span className="text-[11px] text-slate-500">
                      Click guided headers to expand structured provenance drawers:
                    </span>
                  </div>

                  {/* Guided Provenance Accordion Category Pills */}
                  <div className="flex flex-wrap gap-2">
                    {PROVENANCE_CATEGORIES.map((cat) => {
                      const isOpen = activeDrawers[cat.key];
                      const hasContent = hasDrawerContent(cat.key);
                      const isHighlighted = isOpen || hasContent;

                      return (
                        <button
                          key={cat.key}
                          type="button"
                          onClick={() => toggleDrawer(cat.key)}
                          aria-expanded={isOpen}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                            isOpen
                              ? 'bg-amber-500/15 border border-amber-500/60 text-amber-300 ring-1 ring-amber-500/40'
                              : hasContent
                              ? 'bg-emerald-500/15 border border-emerald-500/60 text-emerald-300 ring-1 ring-emerald-500/40'
                              : 'bg-slate-800/80 border border-slate-700 hover:border-slate-600 text-slate-300'
                          }`}
                        >
                          {isHighlighted ? (
                            <Check
                              className={`w-3.5 h-3.5 stroke-[2.5] ${
                                isOpen ? 'text-amber-400' : 'text-emerald-400'
                              }`}
                            />
                          ) : (
                            <span className="text-slate-400 font-bold">+</span>
                          )}
                          <span>{cat.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Expandable Accordion Drawers */}
                <div className="space-y-3">
                  {/* Drawer 1: Ownership History */}
                  {activeDrawers.ownership && (
                    <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-4 mb-3 space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                            Ownership History
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleDrawer('ownership')}
                          className="text-[11px] text-slate-400 hover:text-slate-200 transition"
                        >
                          Collapse
                        </button>
                      </div>
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label
                              htmlFor="prov-prev-owners"
                              className="block text-xs font-medium text-slate-300"
                            >
                              Previous Owners
                            </label>
                            <input
                              id="prov-prev-owners"
                              type="text"
                              value={structuredProvenance.ownership.previousOwners}
                              onChange={(e) =>
                                updateProvenance('ownership', 'previousOwners', e.target.value)
                              }
                              placeholder="e.g., 2 registered owners in Ontario"
                              className="w-full mt-1.5 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-100 placeholder-slate-500 text-xs sm:text-sm focus:outline-none transition"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="prov-ownership-duration"
                              className="block text-xs font-medium text-slate-300"
                            >
                              Ownership Duration
                            </label>
                            <input
                              id="prov-ownership-duration"
                              type="text"
                              value={structuredProvenance.ownership.ownershipDuration}
                              onChange={(e) =>
                                updateProvenance('ownership', 'ownershipDuration', e.target.value)
                              }
                              placeholder="e.g., 6 years, acquired in 2020"
                              className="w-full mt-1.5 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-100 placeholder-slate-500 text-xs sm:text-sm focus:outline-none transition"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="prov-climate-storage"
                              className="block text-xs font-medium text-slate-300"
                            >
                              Storage &amp; Climate Exposure
                            </label>
                            <input
                              id="prov-climate-storage"
                              type="text"
                              value={structuredProvenance.ownership.climateStorage}
                              onChange={(e) =>
                                updateProvenance('ownership', 'climateStorage', e.target.value)
                              }
                              placeholder="e.g., Heated garage, summer use only, no winter driving"
                              className="w-full mt-1.5 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-100 placeholder-slate-500 text-xs sm:text-sm focus:outline-none transition"
                            />
                          </div>
                        </div>
                        <div>
                          <label
                            htmlFor="prov-odometer-integrity"
                            className="block text-xs font-medium text-slate-300"
                          >
                            Odometer Integrity &amp; Cluster Disclosures
                          </label>
                          <input
                            id="prov-odometer-integrity"
                            type="text"
                            value={structuredProvenance.ownership.odometerIntegrity}
                            onChange={(e) =>
                              updateProvenance('ownership', 'odometerIntegrity', e.target.value)
                            }
                            placeholder="e.g., True chassis mileage, original cluster; or replacement 6-digit cluster installed at 45,000 km with documentation (TMU)"
                            className="w-full mt-1.5 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-100 placeholder-slate-500 text-xs sm:text-sm focus:outline-none transition"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Drawer 2: Major Services & Invoices */}
                  {activeDrawers.services && (
                    <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-4 mb-3 space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                            Major Services &amp; Invoices
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleDrawer('services')}
                          className="text-[11px] text-slate-400 hover:text-slate-200 transition"
                        >
                          Collapse
                        </button>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label
                            htmlFor="prov-recent-summary"
                            className="block text-xs font-medium text-slate-300"
                          >
                            Recent Work Summary
                          </label>
                          <textarea
                            id="prov-recent-summary"
                            rows={2}
                            value={structuredProvenance.services.recentSummary}
                            onChange={(e) =>
                              updateProvenance('services', 'recentSummary', e.target.value)
                            }
                            placeholder="e.g., Major timing belt service, valve adjustment, fluid flush"
                            className="w-full mt-1.5 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-100 placeholder-slate-500 text-xs sm:text-sm focus:outline-none transition resize-y"
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label
                              htmlFor="prov-service-facility"
                              className="block text-xs font-medium text-slate-300"
                            >
                              Service Facility
                            </label>
                            <input
                              id="prov-service-facility"
                              type="text"
                              value={structuredProvenance.services.serviceFacility}
                              onChange={(e) =>
                                updateProvenance('services', 'serviceFacility', e.target.value)
                              }
                              placeholder="e.g., Independent marque specialist"
                              className="w-full mt-1.5 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-100 placeholder-slate-500 text-xs sm:text-sm focus:outline-none transition"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="prov-timing-mileage"
                              className="block text-xs font-medium text-slate-300"
                            >
                              Date &amp; Mileage
                            </label>
                            <input
                              id="prov-timing-mileage"
                              type="text"
                              value={structuredProvenance.services.timingMileage}
                              onChange={(e) =>
                                updateProvenance('services', 'timingMileage', e.target.value)
                              }
                              placeholder="e.g., May 2024 at 122,000 km ($4,800 CAD)"
                              className="w-full mt-1.5 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-100 placeholder-slate-500 text-xs sm:text-sm focus:outline-none transition"
                            />
                          </div>
                        </div>
                        <div>
                          <label
                            htmlFor="prov-mechanical-needs"
                            className="block text-xs font-medium text-slate-300"
                          >
                            Known Mechanical Needs / Deferred Items
                          </label>
                          <input
                            id="prov-mechanical-needs"
                            type="text"
                            value={structuredProvenance.services.mechanicalNeeds}
                            onChange={(e) =>
                              updateProvenance('services', 'mechanicalNeeds', e.target.value)
                            }
                            placeholder="e.g., AC blows cool but could use a recharge; slight valve cover seep noted at last inspection"
                            className="w-full mt-1.5 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-100 placeholder-slate-500 text-xs sm:text-sm focus:outline-none transition"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Drawer 3: Paint Meter & Flaws */}
                  {activeDrawers.flaws && (
                    <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-4 mb-3 space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                            Paint Meter &amp; Flaws
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleDrawer('flaws')}
                          className="text-[11px] text-slate-400 hover:text-slate-200 transition"
                        >
                          Collapse
                        </button>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label
                            htmlFor="prov-paint-readings"
                            className="block text-xs font-medium text-slate-300"
                          >
                            Paint Meter Readings
                          </label>
                          <input
                            id="prov-paint-readings"
                            type="text"
                            value={structuredProvenance.flaws.paintReadings}
                            onChange={(e) =>
                              updateProvenance('flaws', 'paintReadings', e.target.value)
                            }
                            placeholder="e.g., Consistent 4.0–5.5 mils across factory panels; rear quarter reads 8.0 mils"
                            className="w-full mt-1.5 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-100 placeholder-slate-500 text-xs sm:text-sm focus:outline-none transition"
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label
                              htmlFor="prov-known-flaws"
                              className="block text-xs font-medium text-slate-300"
                            >
                              Cosmetic Flaws
                            </label>
                            <input
                              id="prov-known-flaws"
                              type="text"
                              value={structuredProvenance.flaws.knownFlaws}
                              onChange={(e) =>
                                updateProvenance('flaws', 'knownFlaws', e.target.value)
                              }
                              placeholder="e.g., Minor stone chips on front valance, curb rash on rear right wheel"
                              className="w-full mt-1.5 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-100 placeholder-slate-500 text-xs sm:text-sm focus:outline-none transition"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="prov-imperfections"
                              className="block text-xs font-medium text-slate-300"
                            >
                              Imperfection Disclosures
                            </label>
                            <input
                              id="prov-imperfections"
                              type="text"
                              value={structuredProvenance.flaws.imperfectionDisclosures}
                              onChange={(e) =>
                                updateProvenance('flaws', 'imperfectionDisclosures', e.target.value)
                              }
                              placeholder="e.g., Light bolster wear on driver seat; clean underbody with zero corrosion"
                              className="w-full mt-1.5 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-100 placeholder-slate-500 text-xs sm:text-sm focus:outline-none transition"
                            />
                          </div>
                        </div>
                        <div>
                          <label
                            htmlFor="prov-accident-history"
                            className="block text-xs font-medium text-slate-300"
                          >
                            Accident, Incident &amp; Insurance Claims
                          </label>
                          <textarea
                            id="prov-accident-history"
                            rows={2}
                            value={structuredProvenance.flaws.accidentHistory}
                            onChange={(e) =>
                              updateProvenance('flaws', 'accidentHistory', e.target.value)
                            }
                            placeholder="e.g., Clean Carfax with zero claims; or minor $2,100 parking lot claim in 2019 (front bumper repainted, zero structural damage)"
                            className="w-full mt-1.5 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-100 placeholder-slate-500 text-xs sm:text-sm focus:outline-none transition resize-y"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Drawer 4: Factory Options & Modifications */}
                  {activeDrawers.modifications && (
                    <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-4 mb-3 space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                            Factory Options &amp; Modifications
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleDrawer('modifications')}
                          className="text-[11px] text-slate-400 hover:text-slate-200 transition"
                        >
                          Collapse
                        </button>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label
                            htmlFor="prov-factory-options"
                            className="block text-xs font-medium text-slate-300"
                          >
                            Notable Factory Options
                          </label>
                          <textarea
                            id="prov-factory-options"
                            rows={2}
                            value={structuredProvenance.modifications.factoryOptions}
                            onChange={(e) =>
                              updateProvenance('modifications', 'factoryOptions', e.target.value)
                            }
                            placeholder="e.g., Sport Chrono, LSD, heated sport seats, sunroof delete"
                            className="w-full mt-1.5 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-100 placeholder-slate-500 text-xs sm:text-sm focus:outline-none transition resize-y"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="prov-modifications"
                            className="block text-xs font-medium text-slate-300"
                          >
                            Aftermarket Modifications
                          </label>
                          <textarea
                            id="prov-modifications"
                            rows={2}
                            value={structuredProvenance.modifications.modifications}
                            onChange={(e) =>
                              updateProvenance('modifications', 'modifications', e.target.value)
                            }
                            placeholder="e.g., Fabspeed exhaust, Bilstein B6 dampers (OEM parts included)"
                            className="w-full mt-1.5 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-100 placeholder-slate-500 text-xs sm:text-sm focus:outline-none transition resize-y"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Freeform Notes & Pasted Records Textarea */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="freeform-seller-notes"
                    className="block text-xs font-semibold text-slate-300"
                  >
                    Additional Notes, Raw Invoices, or Freeform Summary (Optional)
                  </label>
                  <textarea
                    id="freeform-seller-notes"
                    value={freeformNotes}
                    onChange={(e) => setFreeformNotes(e.target.value)}
                    rows={4}
                    placeholder="Paste raw mechanic summaries, additional historical notes, or unstructured records here..."
                    className="w-full px-3.5 py-3 rounded-xl bg-slate-950/70 border border-slate-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 text-slate-200 text-xs sm:text-sm font-mono placeholder:font-sans placeholder:text-slate-500 transition resize-y focus:outline-none"
                  />
                </div>
              </div>

              {/* Bottom: Multimodal Document Dropzone */}
              <div className="space-y-4 pt-2 border-t border-slate-800/80">
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
                    Drag &amp; drop inspection PDFs, service invoices, or document photos
                  </p>
                  <p className="text-xs text-slate-400 mb-3">
                    or <span className="text-amber-400 underline decoration-amber-500/40 underline-offset-2">browse files</span> from your computer
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                      PDFs ≤ 3MB
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                      Doc Photos ≤ 2MB (Max 3MB Total)
                    </span>
                  </div>
                </div>

                {/* Section 5 Guidance Banner */}
                <div className="p-3 bg-slate-800/40 border border-slate-700/60 rounded-xl flex items-start gap-2.5 text-xs text-slate-400">
                  <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p>
                    <strong className="text-slate-300 font-medium">Note:</strong> Vehicle gallery photography is managed in Section 5 (Photo Gallery). Only upload documentation, service invoices, or photos of physical receipts here.
                  </p>
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
              </div>
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
                      {[effectiveVehicleContext.year, effectiveVehicleContext.make, effectiveVehicleContext.model, effectiveVehicleContext.generation ? `(${effectiveVehicleContext.generation})` : '']
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
                    Analyzing model history, vulnerable components, and collector nuances for {effectiveVehicleContext.make} {effectiveVehicleContext.model}.
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
                <span>Proceed to Chassis Interview →</span>
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
