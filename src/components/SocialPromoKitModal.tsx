import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  X, 
  Download, 
  Copy, 
  Check, 
  Sparkles, 
  Image as ImageIcon, 
  FileText, 
  Share2, 
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Info,
  Layers,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { Auction, MediaConfiguration } from '../types';
import { formatCurrency } from '../utils/formatters';
import { subscribeToMediaConfig } from '../services/auctionService';

export interface SocialPromoKitModalProps {
  isOpen: boolean;
  onClose: () => void;
  auction: Auction | null;
}

type LifecycleStage = 'upcoming' | 'live' | 'ending_soon';
type CopyTemplateId = 'enthusiast_forum' | 'marketplace_pitch' | 'x_thread';

export const SocialPromoKitModal: React.FC<SocialPromoKitModalProps> = ({
  isOpen,
  onClose,
  auction
}) => {
  const [activeTab, setActiveTab] = useState<'graphics' | 'copy'>('graphics');
  const [stage, setStage] = useState<LifecycleStage>('live');
  const [tagline, setTagline] = useState<string>('');
  const [activeSlot, setActiveSlot] = useState<1 | 2>(1);
  const [imageSlot1, setImageSlot1] = useState<string>('');
  const [imageSlot2, setImageSlot2] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<CopyTemplateId>('enthusiast_forum');
  const [copiedToast, setCopiedToast] = useState(false);
  const [copiedUrlToast, setCopiedUrlToast] = useState(false);
  const [exportToast, setExportToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showTips, setShowTips] = useState(true);
  const [isRenderingCanvas, setIsRenderingCanvas] = useState(false);
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const [mediaConfig, setMediaConfig] = useState<MediaConfiguration | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Subscribe to vehicle media configuration in real-time
  useEffect(() => {
    if (!isOpen || !auction?.id) {
      setMediaConfig(null);
      return;
    }

    const unsubscribe = subscribeToMediaConfig((config) => {
      setMediaConfig(config);
    }, auction.id);

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [isOpen, auction?.id]);

  // Available vehicle photos: compiled across leadHeroImage, heroImages, and fullGallery
  const allPhotos = useMemo<string[]>(() => {
    if (!auction) return [];
    const photos: string[] = [];

    const addPhoto = (url: unknown) => {
      if (typeof url !== 'string') return;
      const clean = url.trim();
      if (!clean) return;
      // Filter out PDFs and non-image formats
      const lower = clean.toLowerCase();
      if (lower.endsWith('.pdf') || lower.includes('.pdf?')) return;
      if (!photos.includes(clean)) {
        photos.push(clean);
      }
    };

    if (auction.leadHeroImage) {
      addPhoto(auction.leadHeroImage);
    }
    if (Array.isArray(auction.heroImages)) {
      auction.heroImages.forEach(addPhoto);
    }
    if (mediaConfig) {
      if (Array.isArray(mediaConfig.heroImages)) {
        mediaConfig.heroImages.forEach(addPhoto);
      }
      if (Array.isArray(mediaConfig.fullGallery)) {
        mediaConfig.fullGallery.forEach((item) => {
          if (item && !item.isPdf && item.url) {
            addPhoto(item.url);
          }
        });
      }
    }

    return photos;
  }, [auction, mediaConfig]);

  // Compute canonical tracking link
  const canonicalTrackingUrl = useMemo<string>(() => {
    if (!auction?.id) return 'https://www.wailtail.com/auctions';
    return `https://www.wailtail.com/auctions/${auction.id}?utm_source=seller_social&utm_medium=social_kit`;
  }, [auction?.id]);

  // Sync state when auction changes or modal opens
  useEffect(() => {
    if (isOpen && auction) {
      // Determine initial stage
      let initialStage: LifecycleStage = 'live';
      const st = auction.status?.toLowerCase();
      if (st === 'upcoming' || st === 'pending_review' || st === 'preview' || st === 'draft') {
        initialStage = 'upcoming';
      } else if (st === 'ending_soon') {
        initialStage = 'ending_soon';
      } else if (auction.endTime && auction.endTime > Date.now() && auction.endTime - Date.now() < 24 * 3600 * 1000) {
        initialStage = 'ending_soon';
      } else {
        initialStage = 'live';
      }
      setStage(initialStage);

      // Determine initial tagline: prioritize Row 3 Subtitle (auction.subtitle) first
      const fullVehicleName = `${auction.year || ''} ${auction.make || ''} ${auction.model || ''}${auction.generation ? ' ' + auction.generation : ''}`.toLowerCase().trim();
      const isBadgeRedundant = auction.highlightsBadge?.toLowerCase().trim() === fullVehicleName || auction.highlightsBadge?.toLowerCase().trim() === auction.title?.toLowerCase().trim();

      const defaultTagline = auction.subtitle?.trim() || (!isBadgeRedundant ? auction.highlightsBadge?.trim() : null) || `${auction.engine ? auction.engine + ' • ' : ''}${auction.mileage ? auction.mileage + ' ' + (auction.distanceUnit || 'km') + ' • ' : ''}Zero Buyer Fees`;

      setTagline(defaultTagline);
      setCanvasError(null);
    }
  }, [isOpen, auction]);

  // Hydrate photo slots when allPhotos populates/changes
  useEffect(() => {
    if (allPhotos.length > 0) {
      setImageSlot1((prev) => (prev && allPhotos.includes(prev) ? prev : (allPhotos[0] || '')));
      setImageSlot2((prev) => (prev && allPhotos.includes(prev) ? prev : (allPhotos.length > 1 ? allPhotos[1] : allPhotos[0] || '')));
    }
  }, [allPhotos]);

  // Keyboard Escape listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when modal is active
  useEffect(() => {
    if (isOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev || '';
      };
    }
  }, [isOpen]);

  // Resilient direct image loader for canvas compositor:
  // Direct new Image() with cache-busting query param, anonymous crossOrigin,
  // and fallback load without crossOrigin so images still render visibly on canvas preview.
  const loadImageAsync = useCallback((url: string): Promise<HTMLImageElement> => {
    if (!url) {
      return Promise.reject(new Error('Empty URL'));
    }

    const safeUrl = url.includes('?') ? `${url}&wailtail_cors=1` : `${url}?wailtail_cors=1`;

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => resolve(img);

      img.onerror = () => {
        // Resilient fallback: attempt secondary load without crossOrigin so canvas preview still renders visibly
        const fallbackImg = new Image();
        fallbackImg.onload = () => resolve(fallbackImg);
        fallbackImg.onerror = (err) => reject(err);
        fallbackImg.src = safeUrl;
      };

      img.src = safeUrl;
    });
  }, []);

  // Helper: Draw image with cover aspect ratio inside a bounding box
  const drawCoverImage = useCallback((
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    x: number,
    y: number,
    w: number,
    h: number
  ) => {
    const imgRatio = img.width / img.height;
    const boxRatio = w / h;
    let sWidth = img.width;
    let sHeight = img.height;
    let sx = 0;
    let sy = 0;

    if (imgRatio > boxRatio) {
      sWidth = img.height * boxRatio;
      sx = (img.width - sWidth) / 2;
    } else {
      sHeight = img.width / boxRatio;
      sy = (img.height - sHeight) / 2;
    }

    ctx.drawImage(img, sx, sy, sWidth, sHeight, x, y, w, h);
  }, []);

  // Helper: Draw text wrapped
  const drawWrappedText = useCallback((
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
    maxLines: number = 3
  ): number => {
    const words = text.split(' ');
    let line = '';
    let currentY = y;
    let lineCount = 0;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line.trim(), x, currentY);
        line = words[n] + ' ';
        currentY += lineHeight;
        lineCount++;
        if (lineCount >= maxLines - 1) {
          // Truncate remaining
          const remainingWords = words.slice(n).join(' ');
          let truncated = remainingWords;
          while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
            truncated = truncated.slice(0, -1);
          }
          ctx.fillText((truncated + '...').trim(), x, currentY);
          return currentY + lineHeight;
        }
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), x, currentY);
    return currentY + lineHeight;
  }, []);

  // Compositor render trigger
  const renderCanvasGraphic = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !auction) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsRenderingCanvas(true);
    setCanvasError(null);

    try {
      // 1. Base Dimensions (1200 x 900)
      const width = 1200;
      const height = 900;
      const footerY = 790;
      canvas.width = width;
      canvas.height = height;

      // 2. Base Fill: Deep Dark Slate/Charcoal Background (#090d16 to #0d131f vertical gradient)
      const baseGrad = ctx.createLinearGradient(0, 0, 0, height);
      baseGrad.addColorStop(0, '#090d16');
      baseGrad.addColorStop(1, '#0d131f');
      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, width, height);

      // Subtle dark carbon grid patterning on the left (X <= 620)
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= 620; x += 35) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, footerY);
        ctx.stroke();
      }
      for (let y = 0; y <= footerY; y += 35) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(620, y);
        ctx.stroke();
      }
      ctx.restore();

      // Subtle geometric technical accents: diagonal speed lines / chevrons in the upper-right corner
      ctx.save();
      ctx.fillStyle = 'rgba(245, 158, 11, 0.04)';
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        const startX = 960 + i * 32;
        ctx.moveTo(startX, 0);
        ctx.lineTo(startX + 18, 0);
        ctx.lineTo(startX - 50, 140);
        ctx.lineTo(startX - 68, 140);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // 4. Preload Dual Vehicle Photos via in-memory blob URLs
      let img1: HTMLImageElement | null = null;
      let img2: HTMLImageElement | null = null;

      if (imageSlot1) {
        try {
          img1 = await loadImageAsync(imageSlot1);
        } catch (e) {
          console.warn('Canvas primary photo load fallback:', e);
        }
      }
      if (imageSlot2) {
        try {
          img2 = await loadImageAsync(imageSlot2);
        } catch (e) {
          console.warn('Canvas secondary photo load fallback:', e);
        }
      }

      // Reusable Wailtail Fluke Path
      const flukePath = new Path2D(
        "M32.54 24.688a7.155 7.155 0 0 0-7.147-7.147c-0.04 0-0.079 0.005-0.119 0.006-2.995-0.044-5.002-0.687-5.795-1.879a2.593 2.593 0 0 1-0.309-2.052c9.13-0.245 9.452-8.8 9.455-8.888a0.549 0.549 0 0 0-0.544-0.563c-0.346-0.001-7.934-0.02-12.038 3.662C11.94 4.148 4.354 4.167 4.004 4.165a0.549 0.549 0 0 0-0.544 0.563c0.002 0.087 0.318 8.478 9.191 8.878-0.394 2.192-1.288 9.271 2.452 13.979 2.178 2.743 5.548 4.159 10.001 4.235 0.097 0.004 0.192 0.015 0.289 0.015 0.012 0 0.023-0.002 0.035-0.002 0.015 0 0.029 0.002 0.045 0.002 0.009 0 0.017-0.005 0.026-0.005A7.152 7.152 0 0 0 32.54 24.688ZM15.965 26.905c-4.047-5.091-2.132-13.624-2.112-13.709a0.549 0.549 0 0 0-0.536-0.673c-7.176 0-8.475-5.426-8.708-7.247 1.883 0.072 7.762 0.544 10.884 3.529v1.337a0.549 0.549 0 0 0 1.099 0V8.805c3.119-2.982 9.001-3.456 10.884-3.528-0.234 1.821-1.533 7.246-8.708 7.246a0.549 0.549 0 0 0-0.504 0.332 3.82 3.82 0 0 0 0.291 3.407 5.438 5.438 0 0 0 3.586 2.07 7.126 7.126 0 0 0-1.458 11.717A9.575 9.575 0 0 1 15.965 26.905Zm9.463 3.83c-0.1 0-0.193-0.01-0.293-0.012a6.042 6.042 0 0 1 0.149-12.078c0.105 0.001 0.2 0.009 0.307 0.009 0.006 0 0.011-0.003 0.018-0.003a6.044 6.044 0 0 1-0.181 12.084Z"
      );
      const ringPath = new Path2D(
        "M25.393 20.541a4.147 4.147 0 1 0 4.148 4.147A4.152 4.152 0 0 0 25.393 20.541Zm0 7.196a3.049 3.049 0 1 1 3.049-3.049A3.052 3.052 0 0 1 25.393 27.737Z"
      );

      // 2. Primary Hero (Right Side): Diagonal clipping path (X: 48% at top to X: 56% at footerY)
      const topCutX = width * 0.48; // 576
      const bottomCutX = width * 0.56; // 672

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(topCutX, 0);
      ctx.lineTo(width, 0);
      ctx.lineTo(width, footerY);
      ctx.lineTo(bottomCutX, footerY);
      ctx.closePath();
      ctx.clip();

      const heroBoxX = Math.min(topCutX, bottomCutX);
      const heroBoxW = width - heroBoxX;
      if (img1) {
        drawCoverImage(ctx, img1, heroBoxX, 0, heroBoxW, footerY);
      } else {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(heroBoxX, 0, heroBoxW, footerY);
        ctx.fillStyle = '#64748b';
        ctx.font = '600 22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Hero Vehicle Angle', heroBoxX + heroBoxW / 2, footerY / 2);
      }
      ctx.restore();

      // 5px glowing orange gradient seam (#ff5e00 to #f59e0b)
      ctx.save();
      const seamGrad = ctx.createLinearGradient(topCutX, 0, bottomCutX, footerY);
      seamGrad.addColorStop(0, '#ff5e00');
      seamGrad.addColorStop(1, '#f59e0b');
      ctx.strokeStyle = seamGrad;
      ctx.lineWidth = 5;
      ctx.shadowColor = 'rgba(255, 94, 0, 0.5)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(topCutX, 0);
      ctx.lineTo(bottomCutX, footerY);
      ctx.stroke();
      ctx.restore();

      // 3. Secondary Photo (Lower-Left): Box at X: 60, Y: 460, W: 440, H: 270, r: 8px, 3px #f59e0b border, dark drop shadow
      const slot2X = 60;
      const slot2Y = 460;
      const slot2W = 440;
      const slot2H = 270;
      const slot2R = 8;

      // Dark drop shadow behind the box
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = '#0b1120';
      ctx.beginPath();
      ctx.roundRect(slot2X, slot2Y, slot2W, slot2H, slot2R);
      ctx.fill();
      ctx.restore();

      // Clip and draw image inside rounded box
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(slot2X, slot2Y, slot2W, slot2H, slot2R);
      ctx.clip();

      if (img2) {
        drawCoverImage(ctx, img2, slot2X, slot2Y, slot2W, slot2H);
      } else {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(slot2X, slot2Y, slot2W, slot2H);
        ctx.fillStyle = '#64748b';
        ctx.font = '600 18px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Cockpit / Detail Angle', slot2X + slot2W / 2, slot2Y + slot2H / 2);
      }
      ctx.restore();

      // 3px #f59e0b border
      ctx.save();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(slot2X, slot2Y, slot2W, slot2H, slot2R);
      ctx.stroke();
      ctx.restore();

      // 4. Top-Left Headline & Typography
      const brandX = 60;
      const brandY = 55;

      // Wailtail logo + wailtail.com + micro-tagline
      ctx.save();
      ctx.translate(brandX, brandY);
      ctx.scale(1.3, 1.3);
      ctx.fillStyle = '#ffffff';
      ctx.fill(flukePath);
      ctx.fill(ringPath);
      ctx.restore();

      ctx.save();
      ctx.font = '800 32px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('wailtail', brandX + 50, brandY + 30);
      ctx.fillStyle = '#f59e0b';
      ctx.fillText('.com', brandX + 160, brandY + 30);
      ctx.restore();

      ctx.save();
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('CANADIAN ENTHUSIAST & COLLECTOR AUCTIONS', brandX + 52, brandY + 48);
      ctx.restore();

      // Line 1: Stage text in italic 900 34px with #ff5e00 to #fbbf24 gradient
      let stageText = 'AUCTION IS LIVE';
      if (stage === 'upcoming') {
        stageText = 'UPCOMING AUCTION';
      } else if (stage === 'ending_soon') {
        stageText = 'ENDING TODAY — NO SNIPING';
      }

      ctx.save();
      ctx.font = 'italic 900 34px system-ui, -apple-system, sans-serif';
      const stageGrad = ctx.createLinearGradient(brandX, 0, brandX + 420, 0);
      stageGrad.addColorStop(0, '#ff5e00');
      stageGrad.addColorStop(1, '#fbbf24');
      ctx.fillStyle = stageGrad;
      ctx.fillText(stageText, brandX, 165);
      ctx.restore();

      // Line 2: Large bold white italic title (italic 900 42px), auto-scaling down to 28px to prevent overflow
      const vehicleTitle = `${auction.year || ''} ${auction.make || ''} ${auction.model || ''}${auction.generation ? ' ' + auction.generation : ''}`.trim().toUpperCase();
      const maxTitleWidth = 460;
      const titleWords = vehicleTitle.split(' ').filter(Boolean);

      let bestFontSize = 28;
      let bestTitleLines: string[] = [vehicleTitle];

      for (let fs = 42; fs >= 28; fs -= 2) {
        ctx.font = `italic 900 ${fs}px system-ui, -apple-system, sans-serif`;
        const testLines: string[] = [];
        let currLine = '';

        for (let i = 0; i < titleWords.length; i++) {
          const candidate = currLine ? `${currLine} ${titleWords[i]}` : titleWords[i];
          if (ctx.measureText(candidate).width <= maxTitleWidth) {
            currLine = candidate;
          } else {
            if (currLine) {
              testLines.push(currLine);
            }
            currLine = titleWords[i];
          }
        }
        if (currLine) {
          testLines.push(currLine);
        }

        if (testLines.length <= 2 && testLines.every((l) => ctx.measureText(l).width <= maxTitleWidth)) {
          bestFontSize = fs;
          bestTitleLines = testLines;
          break;
        }
        if (fs === 28) {
          bestFontSize = 28;
          bestTitleLines = testLines;
        }
      }

      ctx.save();
      ctx.font = `italic 900 ${bestFontSize}px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle = '#ffffff';
      const titleLineHeight = Math.round(bestFontSize * 1.15);
      let titleCurrentY = 215;
      for (const line of bestTitleLines) {
        ctx.fillText(line, brandX, titleCurrentY);
        titleCurrentY += titleLineHeight;
      }
      ctx.restore();

      // Line 3: Tagline/subtitle (italic 500 18px #e2e8f0)
      const displayTagline = (tagline && tagline.trim()) || auction.subtitle?.trim() || '';
      if (displayTagline) {
        ctx.save();
        ctx.font = 'italic 500 18px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#e2e8f0';
        drawWrappedText(ctx, displayTagline, brandX, titleCurrentY + 6, 440, 24, 2);
        ctx.restore();
      }

      // 5. Bottom Footer (Y: 790 to 900): Full-width slate footer with 2px amber pinstripe
      ctx.save();
      const footerGrad = ctx.createLinearGradient(0, footerY, 0, height);
      footerGrad.addColorStop(0, '#0a0f1d');
      footerGrad.addColorStop(1, '#070a14');
      ctx.fillStyle = footerGrad;
      ctx.fillRect(0, footerY, width, height - footerY);

      // 2px amber pinstripe
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(0, footerY, width, 2);

      // Left side: Starting/High Bid in emerald CAD (formatCurrency strictly once)
      const isUpcoming = stage === 'upcoming';
      const bidHeader = isUpcoming ? 'STARTING BID' : 'CURRENT HIGH BID';
      const bidVal = isUpcoming 
        ? (auction.startingBid || 0) 
        : (auction.currentBid || auction.startingBid || 0);

      ctx.textAlign = 'left';
      ctx.font = '700 12px system-ui, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(bidHeader, 60, footerY + 34);

      ctx.font = '900 36px monospace';
      ctx.fillStyle = '#10b981'; // Emerald CAD
      ctx.fillText(formatCurrency(bidVal), 60, footerY + 74);

      // Right side: REGISTER TO BID AT + wailtail.com/auctions + white whale-tail icon
      const rightMargin = width - 60; // 1140
      ctx.textAlign = 'right';
      ctx.font = '800 12px system-ui, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('REGISTER TO BID AT', rightMargin, footerY + 34);

      const urlText = 'wailtail.com/auctions';
      ctx.font = '900 28px system-ui, -apple-system, sans-serif';
      const urlMetrics = ctx.measureText(urlText);
      const urlWidth = urlMetrics.width;

      // Whale-tail icon to the left of the URL
      const footerIconScale = 1.1;
      const footerIconX = rightMargin - urlWidth - 44;
      const footerIconY = footerY + 48;

      ctx.save();
      ctx.translate(footerIconX, footerIconY);
      ctx.scale(footerIconScale, footerIconScale);
      ctx.fillStyle = '#ffffff';
      ctx.fill(flukePath);
      ctx.fill(ringPath);
      ctx.restore();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(urlText, rightMargin, footerY + 74);
      ctx.restore();

    } catch (err: any) {
      console.error('Error drawing social promo canvas:', err);
      setCanvasError('Failed to generate high-resolution canvas graphic.');
    } finally {
      setIsRenderingCanvas(false);
    }
  }, [auction, stage, tagline, imageSlot1, imageSlot2, loadImageAsync, drawCoverImage, drawWrappedText]);

  // Re-render canvas when tabs, stage, tagline, or selected photos change
  useEffect(() => {
    if (isOpen && activeTab === 'graphics' && auction) {
      renderCanvasGraphic();
    }
  }, [isOpen, activeTab, renderCanvasGraphic, auction]);

  // Handle Download Graphic (PNG)
  const handleDownloadGraphic = () => {
    const canvas = canvasRef.current;
    if (!canvas || !auction) return;
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `${auction.id || 'wailtail'}-social-promo.png`;
      link.href = dataUrl;
      link.click();
      setExportToast({ message: 'High-res graphic downloaded successfully!', type: 'success' });
      setTimeout(() => setExportToast(null), 3000);
    } catch (err: any) {
      console.error('Canvas export error:', err);
      setCanvasError('Canvas export restricted due to external image CORS restrictions. Right-click the canvas preview to save the image directly.');
      setExportToast({ message: 'Canvas export restricted by CORS. Right-click graphic to save.', type: 'error' });
      setTimeout(() => setExportToast(null), 4000);
    }
  };

  // Engine 2: Copy Generator Templates with Grounded Tone & Multi-Stage Reactivity
  const copyTemplates = useMemo(() => {
    if (!auction) return { enthusiast_forum: '', marketplace_pitch: '', x_thread: '' };

    const year = auction.year || '';
    const make = auction.make || '';
    const model = auction.model || '';
    const generation = auction.generation ? ` (${auction.generation})` : '';
    const vehicleFullName = `${year} ${make} ${model}${generation}`.trim();
    const vin = auction.vin || 'Available upon request';
    const mileage = `${auction.mileage || '—'} ${auction.distanceUnit || 'KM'}`;
    const engine = auction.engine || 'Factory Specification';
    const drivetrain = auction.drivetrain || 'Manual';
    const exterior = auction.exteriorColor || 'Factory Color';
    const interior = auction.interior || 'Factory Interior';
    const titleStatus = auction.titleStatus || 'Clean Registration';
    const location = auction.location || 'Canada';
    const currentBidVal = stage === 'upcoming' 
      ? (auction.startingBid || 0) 
      : (auction.currentBid || auction.startingBid || 0);
    const bidFormatted = formatCurrency(currentBidVal);

    // 1. Enthusiast Group Deep-Dive Template
    let forumStageIntro = '';
    let forumBidNote = '';
    let forumCta = '';

    if (stage === 'upcoming') {
      forumStageIntro = `The auction is scheduled to go live shortly. I'm sharing it early so community members can review the dossier, ask questions in the comments, and get set up with bidder registration ahead of launch.`;
      forumBidNote = `• Starting Bid: ${bidFormatted} (0% Buyer Premium)`;
      forumCta = [
        `🔗 PREVIEW DOSSIER & REGISTER EARLY:`,
        `${canonicalTrackingUrl}`,
        ``,
        `*(Note for bidders: Wailtail charges 0% buyer fees, so your winning bid is the actual hammer price in CAD with no added platform fees. Feel free to ask questions about maintenance, paint, or setup in the comments below — happy to chat cars and provide any additional details).*`,
        ``,
        `*(Admins: If this post doesn't align with group guidelines, please feel free to remove).*`
      ].join('\n');
    } else if (stage === 'ending_soon') {
      forumStageIntro = `The auction is entering its closing hours today!`;
      forumBidNote = `• Current High Bid: ${bidFormatted} (0% Buyer Premium)`;
      forumCta = [
        `🔗 VIEW LOT & PLACE CLOSING BIDS:`,
        `${canonicalTrackingUrl}`,
        ``,
        `*(Note for bidders: Wailtail uses a 2-minute soft-close anti-sniping rule — any bid placed in the final 2 minutes extends the clock by 2 minutes, ensuring fair closing bidding for everyone. 0% buyer fees apply, so your winning bid is the true CAD hammer price. I'll be monitoring the comments through the close).*`,
        ``,
        `*(Admins: If this post doesn't align with group guidelines, please feel free to remove).*`
      ].join('\n');
    } else {
      // Live Now
      forumStageIntro = `The auction is officially live for bidding.`;
      forumBidNote = `• Current High Bid: ${bidFormatted} (0% Buyer Premium)`;
      forumCta = [
        `🔗 VIEW FULL LOT DETAILS & BID:`,
        `${canonicalTrackingUrl}`,
        ``,
        `*(Note for bidders: Wailtail charges 0% buyer fees — your winning bid is the exact hammer price in CAD with no surprise commissions. Happy to answer any mechanical questions in the comments below).*`,
        ``,
        `*(Admins: If this post doesn't align with group guidelines, please feel free to remove).*`
      ].join('\n');
    }

    const enthusiast_forum = [
      `Hey everyone,`,
      ``,
      `After spending the last few years sorting this ${vehicleFullName}, the time has come to pass the keys to the next owner. I’ve put it up on Wailtail — a Canadian enthusiast platform with 0% buyer fees — so anyone interested can dig through the full photo gallery, walkaround videos, and complete service history in one spot.`,
      ``,
      forumStageIntro,
      ``,
      `📋 VEHICLE SPECS & DETAILS:`,
      `• Vehicle: ${vehicleFullName}`,
      `• VIN: ${vin}`,
      `• Mileage: ${mileage}`,
      `• Powertrain: ${engine} • ${drivetrain}`,
      `• Colors: ${exterior} (Exterior) / ${interior} (Interior)`,
      `• Registration: ${titleStatus}`,
      `• Location: ${location}`,
      forumBidNote,
      ``,
      `🔧 HIGHLIGHTS & CONDITION:`,
      tagline ? `• Key Highlight: ${tagline}` : `• Meticulously maintained and kept in climate-controlled storage`,
      `• Comprehensive high-resolution photo gallery with 4K walkaround video and mechanical inspection details on file.`,
      auction.serviceRecordsUrl ? `• Verified service records and provenance documentation attached to the lot.` : `• Clean title and verified ownership history.`,
      ``,
      forumCta
    ].join('\n');

    // 2. Marketplace & Short Pitch Template
    let pitchHeadline = '';
    let pitchStatusLine = '';
    let pitchBidLine = '';
    let pitchCta = '';

    if (stage === 'upcoming') {
      pitchHeadline = `🏁 PRE-AUCTION PREVIEW: ${vehicleFullName}`;
      pitchStatusLine = `Going live soon on Wailtail — Canada's enthusiast auction platform with 0% buyer fees!`;
      pitchBidLine = `• Starting Bid: ${bidFormatted} (Zero buyer fees added)`;
      pitchCta = `👉 Review the complete dossier & register to bid before launch:`;
    } else if (stage === 'ending_soon') {
      pitchHeadline = `⏳ CLOSING TODAY: ${vehicleFullName}`;
      pitchStatusLine = `The auction is closing today on Wailtail — Canada's 0% buyer fee enthusiast platform!`;
      pitchBidLine = `• Current Bid: ${bidFormatted} (Winning bid is the actual hammer price — no buyer premium)`;
      pitchCta = `👉 Closing soon! 2-minute soft-close anti-snipe active. Submit your final bids:`;
    } else {
      // Live Now
      pitchHeadline = `🏁 NOW LIVE: ${vehicleFullName}`;
      pitchStatusLine = `Currently open for bidding on Wailtail — Canada's enthusiast auction platform with 0% buyer fees!`;
      pitchBidLine = `• Current Bid: ${bidFormatted} (No buyer fees — what you bid is what you pay)`;
      pitchCta = `👉 View full photo gallery, walkaround video & submit your bid:`;
    }

    const marketplace_pitch = [
      pitchHeadline,
      ``,
      tagline ? `• ${tagline}\n` : ``,
      pitchStatusLine,
      ``,
      `• ${mileage} | ${exterior}`,
      `• ${engine} | ${drivetrain}`,
      `• Inspected, documented, with cold-start video and complete photo gallery`,
      pitchBidLine,
      ``,
      pitchCta,
      `${canonicalTrackingUrl}`,
      ``,
      `#Wailtail #${make.replace(/\s+/g, '')} #${model.replace(/\s+/g, '')} #CarAuction #ZeroBuyerFee #EnthusiastCars`
    ].filter(Boolean).join('\n');

    // 3. X / Twitter Thread Template
    let tweet1 = '';
    let tweet2 = '';
    let tweet3 = '';

    if (stage === 'upcoming') {
      tweet1 = `🧵 1/3: After spending the last few years sorting this ${vehicleFullName}, it's heading to auction on @wailtail — a Canadian enthusiast platform with 0% buyer fees.${tagline ? `\n\nHighlight: ${tagline}` : ''}`;
      tweet2 = `🧵 2/3: Mechanical Overview:\n• ${mileage} | ${drivetrain}\n• ${exterior} over ${interior}\n• Full high-res gallery, cold-start video, and complete service history on file.\n• Starting bid: ${bidFormatted}`;
      tweet3 = `🧵 3/3: Going live shortly! Dossier is open for pre-launch review, community questions, and early bidder registration:\n👉 ${canonicalTrackingUrl}`;
    } else if (stage === 'ending_soon') {
      tweet1 = `🧵 1/3: Final hours! The auction for my ${vehicleFullName} is closing today on @wailtail — Canada's 0% buyer fee enthusiast platform.${tagline ? `\n\nHighlight: ${tagline}` : ''}`;
      tweet2 = `🧵 2/3: Vehicle Snapshot:\n• ${mileage} | ${drivetrain}\n• ${exterior} over ${interior}\n• Current high bid: ${bidFormatted} (winning bid is the actual price; zero platform buyer fees).`;
      tweet3 = `🧵 3/3: Bidding closes today! Reminder: 2-minute soft-close anti-snipe rule is active (bids in final 2 mins extend the clock by 2 mins). Place final bids:\n👉 ${canonicalTrackingUrl}`;
    } else {
      // Live Now
      tweet1 = `🧵 1/3: After spending the last few years sorting this ${vehicleFullName}, it's officially live for bidding on @wailtail — Canada's enthusiast auction platform with 0% buyer fees.${tagline ? `\n\nHighlight: ${tagline}` : ''}`;
      tweet2 = `🧵 2/3: Mechanical Overview:\n• ${mileage} | ${drivetrain}\n• ${exterior} over ${interior}\n• High-res gallery, walkaround videos, and complete documentation on file.\n• Current bid: ${bidFormatted}`;
      tweet3 = `🧵 3/3: Auction is live! 0% buyer fees means your winning bid is the true Canadian hammer price. Check out the lot and bid:\n👉 ${canonicalTrackingUrl}`;
    }

    const x_thread = [tweet1, ``, tweet2, ``, tweet3].join('\n');

    return { enthusiast_forum, marketplace_pitch, x_thread };
  }, [auction, stage, tagline, canonicalTrackingUrl]);

  // Handle Copy Text to Clipboard
  const handleCopyText = async () => {
    const textToCopy = copyTemplates[selectedTemplate];
    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2400);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  // Handle Copy Tracked Campaign URL to Clipboard
  const handleCopyUrl = async () => {
    if (!canonicalTrackingUrl) return;

    try {
      await navigator.clipboard.writeText(canonicalTrackingUrl);
      setCopiedUrlToast(true);
      setTimeout(() => setCopiedUrlToast(false), 2400);
    } catch (err) {
      console.error('Failed to copy tracked URL:', err);
    }
  };

  if (!isOpen || !auction) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0">
              <Share2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
                  Seller Social Marketing Kit
                </h2>
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase">
                  1200x900 Compositor & Copy
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">
                {auction.year} {auction.make} {auction.model} &bull; Lot #{auction.id}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Selector & Lifecycle Stage Bar */}
        <div className="px-5 py-2.5 bg-slate-950/90 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('graphics')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'graphics'
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Canvas Graphic Generator</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('copy')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'copy'
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Enthusiast Copy Generator</span>
            </button>
          </div>

          {/* Lifecycle Stage Controls */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider hidden sm:inline">
              Campaign Stage:
            </span>
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setStage('upcoming')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                  stage === 'upcoming'
                    ? 'bg-amber-600 text-white font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Upcoming
              </button>
              <button
                type="button"
                onClick={() => setStage('live')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                  stage === 'live'
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Live Now
              </button>
              <button
                type="button"
                onClick={() => setStage('ending_soon')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                  stage === 'ending_soon'
                    ? 'bg-red-600 text-white font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Ending Soon
              </button>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-5">
          {/* TAB 1: CANVAS GRAPHIC GENERATOR */}
          {activeTab === 'graphics' && (
            <div className="space-y-5">
              {/* Graphic Controls Panel */}
              <div className="space-y-3.5 bg-slate-950/40 p-4 rounded-xl border border-slate-800">
                {/* Custom Tagline Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>Custom Graphic Tagline</span>
                    <span className="text-[10px] text-slate-500 font-mono">Max 75 chars</span>
                  </label>
                  <input
                    type="text"
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    placeholder="e.g., Canadian Spec, 6-Speed Manual, 1-Owner"
                    maxLength={75}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  />
                </div>

                {/* Visual Slot Cards (Replacing blind select dropdowns) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Slot 1 Card */}
                  <div
                    onClick={() => setActiveSlot(1)}
                    className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                      activeSlot === 1
                        ? 'ring-2 ring-amber-500 bg-amber-500/10 border-amber-500 shadow-md'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="relative w-16 h-12 rounded-lg overflow-hidden bg-slate-950 border border-slate-700/80 shrink-0">
                      {imageSlot1 ? (
                        <img src={imageSlot1} alt="Slot 1 Preview" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-500">
                          <ImageIcon className="w-4 h-4" />
                        </div>
                      )}
                      <span className="absolute bottom-0.5 right-0.5 px-1 py-0.2 bg-amber-500 text-black text-[9px] font-black rounded">
                        S1
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-white tracking-tight">Slot 1: Hero Angle</span>
                        {activeSlot === 1 && (
                          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider bg-amber-500/20 px-1.5 py-0.2 rounded border border-amber-500/30">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {imageSlot1 ? 'Hero angle assigned' : 'Click to select from tray'}
                      </p>
                    </div>
                  </div>

                  {/* Slot 2 Card */}
                  <div
                    onClick={() => setActiveSlot(2)}
                    className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                      activeSlot === 2
                        ? 'ring-2 ring-amber-500 bg-amber-500/10 border-amber-500 shadow-md'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="relative w-16 h-12 rounded-lg overflow-hidden bg-slate-950 border border-slate-700/80 shrink-0">
                      {imageSlot2 ? (
                        <img src={imageSlot2} alt="Slot 2 Preview" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-500">
                          <ImageIcon className="w-4 h-4" />
                        </div>
                      )}
                      <span className="absolute bottom-0.5 right-0.5 px-1 py-0.2 bg-orange-500 text-white text-[9px] font-black rounded">
                        S2
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-white tracking-tight">Slot 2: Cockpit / Detail</span>
                        {activeSlot === 2 && (
                          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider bg-amber-500/20 px-1.5 py-0.2 rounded border border-amber-500/30">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {imageSlot2 ? 'Detail angle assigned' : 'Click to select from tray'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Photo Thumbnail Tray */}
              {allPhotos.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-slate-300">Quick Select Media Tray ({allPhotos.length} available):</span>
                    <span className="text-[11px] text-amber-400/90 font-medium">
                      Active Target: <strong className="text-amber-300 font-bold">Slot {activeSlot}</strong> (Click photo to assign & toggle)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
                    {allPhotos.map((photo, idx) => {
                      const isSlot1 = imageSlot1 === photo;
                      const isSlot2 = imageSlot2 === photo;
                      return (
                        <div
                          key={photo}
                          onClick={() => {
                            if (activeSlot === 1) {
                              setImageSlot1(photo);
                              setActiveSlot(2);
                            } else {
                              setImageSlot2(photo);
                              setActiveSlot(1);
                            }
                          }}
                          className={`relative flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                            isSlot1 && isSlot2
                              ? 'border-amber-400 ring-2 ring-amber-400/50 shadow-md'
                              : isSlot1
                              ? 'border-amber-400 ring-2 ring-amber-400/40 shadow-sm'
                              : isSlot2
                              ? 'border-orange-500 ring-2 ring-orange-500/40 shadow-sm'
                              : 'border-slate-800 hover:border-slate-600 opacity-70 hover:opacity-100'
                          }`}
                          title={`Photo #${idx + 1}. Click to assign to Slot ${activeSlot} and auto-toggle`}
                        >
                          <img
                            src={photo}
                            alt={`Thumb ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          {(isSlot1 || isSlot2) && (
                            <span className={`absolute bottom-0.5 right-0.5 px-1 py-0.2 text-[9px] font-black rounded ${
                              isSlot1 && isSlot2
                                ? 'bg-amber-500 text-black'
                                : isSlot1
                                ? 'bg-amber-500 text-black'
                                : 'bg-orange-500 text-white'
                            }`}>
                              {isSlot1 && isSlot2 ? 'S1+S2' : isSlot1 ? 'S1' : 'S2'}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Canvas Preview Container */}
              <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 p-2 sm:p-4 flex flex-col items-center justify-center">
                <canvas
                  ref={canvasRef}
                  className="w-full max-w-full aspect-[4/3] rounded-xl shadow-2xl border border-slate-800/80 block"
                />

                {isRenderingCanvas && (
                  <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center gap-2 text-amber-300 text-xs font-bold">
                    <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                    <span>Rendering 1200x900 Graphic...</span>
                  </div>
                )}

                {canvasError && (
                  <div className="mt-3 p-3 rounded-lg bg-red-950/80 border border-red-800 text-xs text-red-200 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span>{canvasError}</span>
                  </div>
                )}
              </div>

              {/* Graphic Action Footer */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Fixed 1200x900 PNG &bull; Optimized for Facebook Groups, Forums, & Instagram Feed</span>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={renderCanvasGraphic}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    title="Refresh Graphic"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Refresh</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadGraphic}
                    className="flex-1 sm:flex-none px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-amber-950/40 transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Graphic (PNG)</span>
                  </button>
                </div>
              </div>

              {/* Export Toast Notification */}
              {exportToast && (
                <div className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 animate-in fade-in ${
                  exportToast.type === 'success'
                    ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-200'
                    : 'bg-red-950/80 border border-red-800 text-red-200'
                }`}>
                  {exportToast.type === 'success' ? (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  <span>{exportToast.message}</span>
                </div>
              )}

              {/* Tracked Campaign URL Card for Instant Sharing */}
              <div className="relative p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <span className="text-slate-400 block font-semibold text-[11px]">Tracked Campaign URL:</span>
                  <span className="font-mono text-amber-400 truncate block text-xs" title={canonicalTrackingUrl}>
                    {canonicalTrackingUrl}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer shadow-md"
                    title="Copy tracked campaign URL to clipboard"
                  >
                    {copiedUrlToast ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-black" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                  <a
                    href={canonicalTrackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center gap-1.5 text-xs font-bold transition-colors w-fit"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Test URL ↗</span>
                  </a>
                </div>

                {copiedUrlToast && (
                  <div className="absolute -top-3 right-4 bg-emerald-500 text-black text-[11px] font-bold px-2.5 py-1 rounded-md shadow-lg flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom-1 z-10">
                    <Check className="w-3 h-3 text-black stroke-[3]" />
                    <span>Tracked campaign link copied to clipboard!</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: MULTI-TEMPLATE COPY GENERATOR */}
          {activeTab === 'copy' && (
            <div className="space-y-5">
              {/* Template Selection Tabs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedTemplate('enthusiast_forum')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedTemplate === 'enthusiast_forum'
                      ? 'bg-amber-500/10 border-amber-500 text-amber-300'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-bold text-white flex items-center justify-between mb-1">
                    <span>1. Enthusiast Deep-Dive</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">Forums/Groups</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Rennlist, Bimmerpost, Facebook Groups. Specs breakdown, maintenance history & admin courtesy notice.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedTemplate('marketplace_pitch')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedTemplate === 'marketplace_pitch'
                      ? 'bg-amber-500/10 border-amber-500 text-amber-300'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-bold text-white flex items-center justify-between mb-1">
                    <span>2. Marketplace Pitch</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">FB/IG</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    High-energy punchy overview with current bid, 0% buyer premium highlight & auction link.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedTemplate('x_thread')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedTemplate === 'x_thread'
                      ? 'bg-amber-500/10 border-amber-500 text-amber-300'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-bold text-white flex items-center justify-between mb-1">
                    <span>3. X / Twitter Thread</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">3 Posts</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Sequential 3-tweet sequence breaking down provenance, mechanical specs, and live bidding link.
                  </p>
                </button>
              </div>

              {/* Copy Editor / Preview Card */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-300">Generated Copy Template</span>
                    <span className="text-[11px] text-slate-500 font-mono">UTM Campaign Tracked</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyText}
                    className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
                  >
                    {copiedToast ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-black" />
                        <span>Copied to Clipboard!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Text</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="relative">
                  <textarea
                    readOnly
                    value={copyTemplates[selectedTemplate]}
                    rows={12}
                    className="w-full p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono leading-relaxed focus:outline-none select-all"
                  />
                </div>
              </div>

              {/* Canonical UTM Link Card */}
              <div className="relative p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <span className="text-slate-400 block font-semibold text-[11px]">Tracked Campaign URL:</span>
                  <span className="font-mono text-amber-400 truncate block text-xs" title={canonicalTrackingUrl}>
                    {canonicalTrackingUrl}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer shadow-md"
                    title="Copy tracked campaign URL to clipboard"
                  >
                    {copiedUrlToast ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-black" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                  <a
                    href={canonicalTrackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center gap-1.5 text-xs font-bold transition-colors w-fit"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Test URL ↗</span>
                  </a>
                </div>

                {copiedUrlToast && (
                  <div className="absolute -top-3 right-4 bg-emerald-500 text-black text-[11px] font-bold px-2.5 py-1 rounded-md shadow-lg flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom-1 z-10">
                    <Check className="w-3 h-3 text-black stroke-[3]" />
                    <span>Tracked campaign link copied to clipboard!</span>
                  </div>
                )}
              </div>

              {/* Collapsible Enthusiast Posting Tips Card */}
              <div className="rounded-xl bg-slate-950/60 border border-slate-800 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowTips(!showTips)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left cursor-pointer hover:bg-slate-800/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Posting Tips for Best Conversion Results
                    </span>
                  </div>
                  {showTips ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>

                {showTips && (
                  <div className="px-4 pb-4 pt-1 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs border-t border-slate-800/60">
                    <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/60 space-y-1">
                      <span className="font-bold text-amber-400">1. Lead with Provenance</span>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Enthusiast groups love personal ownership history, maintenance logs, and reasons why you chose the car originally.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/60 space-y-1">
                      <span className="font-bold text-amber-400">2. Highlight 0% Buyer Fees</span>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Remind members that unlike traditional auction sites charging a 5% buyer fee, Wailtail charges 0% buyer premium.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/60 space-y-1">
                      <span className="font-bold text-amber-400">3. Engage in the Comments</span>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Answer questions directly and offer cold-start videos or paint meter readings. Quick, friendly engagement drives serious bids.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
