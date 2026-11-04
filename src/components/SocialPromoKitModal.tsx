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
import { Auction } from '../types';
import { formatCurrency } from '../utils/formatters';

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
  const [imageSlot1, setImageSlot1] = useState<string>('');
  const [imageSlot2, setImageSlot2] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<CopyTemplateId>('enthusiast_forum');
  const [copiedToast, setCopiedToast] = useState(false);
  const [showTips, setShowTips] = useState(true);
  const [isRenderingCanvas, setIsRenderingCanvas] = useState(false);
  const [canvasError, setCanvasError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Available vehicle photos
  const allPhotos = useMemo<string[]>(() => {
    if (!auction) return [];
    const photos: string[] = [];
    if (auction.leadHeroImage && auction.leadHeroImage.trim()) {
      photos.push(auction.leadHeroImage.trim());
    }
    if (Array.isArray(auction.heroImages)) {
      auction.heroImages.forEach((img) => {
        if (img && typeof img === 'string' && img.trim() && !photos.includes(img.trim())) {
          photos.push(img.trim());
        }
      });
    }
    return photos;
  }, [auction]);

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

      // Determine initial tagline
      const initialTagline = 
        auction.highlightsBadge?.trim() || 
        auction.subtitle?.trim() || 
        auction.title?.trim() || 
        'Collector-grade provenance, 0% buyer fees';
      setTagline(initialTagline);

      // Photos
      const photos = allPhotos;
      setImageSlot1(photos[0] || '');
      setImageSlot2(photos[1] || photos[0] || '');
      setCanvasError(null);
    }
  }, [isOpen, auction, allPhotos]);

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

  // Load image helper with CORS support
  const loadImageAsync = useCallback((url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      if (!url) {
        reject(new Error('Empty URL'));
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => {
        // Retry without crossOrigin if CORS headers are blocked
        const fallbackImg = new Image();
        fallbackImg.onload = () => resolve(fallbackImg);
        fallbackImg.onerror = (err) => reject(err);
        fallbackImg.src = url;
      };
      img.src = url;
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
      canvas.width = width;
      canvas.height = height;

      // 2. Base Fill: Deep Slate Gradient
      const baseGrad = ctx.createLinearGradient(0, 0, width, height);
      baseGrad.addColorStop(0, '#090d16');
      baseGrad.addColorStop(0.4, '#0f172a');
      baseGrad.addColorStop(1, '#0b1120');
      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, width, height);

      // 3. Subtle Technical Grid & Tread Accent Patterns
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y <= height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.restore();

      // Lower banner tire tread / technical chevron accents
      ctx.save();
      ctx.fillStyle = 'rgba(245, 158, 11, 0.04)';
      for (let i = 0; i < 24; i++) {
        ctx.beginPath();
        const startX = i * 55;
        ctx.moveTo(startX, 830);
        ctx.lineTo(startX + 25, 875);
        ctx.lineTo(startX + 15, 875);
        ctx.lineTo(startX - 10, 830);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // 4. Preload Dual Vehicle Photos
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

      // 5. Photo Slot 1 (Primary / Hero, Top-Right)
      const slot1X = 510;
      const slot1Y = 70;
      const slot1W = 630;
      const slot1H = 430;

      // Angular Amber Backdrop Panel for Slot 1
      ctx.save();
      ctx.fillStyle = '#ea580c';
      ctx.beginPath();
      ctx.moveTo(slot1X - 6, slot1Y - 6);
      ctx.lineTo(slot1X + slot1W + 6, slot1Y - 6);
      ctx.lineTo(slot1X + slot1W + 6, slot1Y + slot1H + 6);
      ctx.lineTo(slot1X + 44, slot1Y + slot1H + 6);
      ctx.lineTo(slot1X - 6, slot1Y + slot1H - 44);
      ctx.closePath();
      ctx.fill();

      // Subtle warm gradient accent glow
      const amberGlow = ctx.createLinearGradient(slot1X, slot1Y, slot1X + slot1W, slot1Y + slot1H);
      amberGlow.addColorStop(0, '#f59e0b');
      amberGlow.addColorStop(1, '#d97706');
      ctx.fillStyle = amberGlow;
      ctx.beginPath();
      ctx.moveTo(slot1X - 3, slot1Y - 3);
      ctx.lineTo(slot1X + slot1W + 3, slot1Y - 3);
      ctx.lineTo(slot1X + slot1W + 3, slot1Y + slot1H + 3);
      ctx.lineTo(slot1X + 40, slot1Y + slot1H + 3);
      ctx.lineTo(slot1X - 3, slot1Y + slot1H - 40);
      ctx.closePath();
      ctx.fill();

      // Clip and Draw Slot 1
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(slot1X, slot1Y);
      ctx.lineTo(slot1X + slot1W, slot1Y);
      ctx.lineTo(slot1X + slot1W, slot1Y + slot1H);
      ctx.lineTo(slot1X + 38, slot1Y + slot1H);
      ctx.lineTo(slot1X, slot1Y + slot1H - 38);
      ctx.closePath();
      ctx.clip();

      if (img1) {
        drawCoverImage(ctx, img1, slot1X, slot1Y, slot1W, slot1H);
      } else {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(slot1X, slot1Y, slot1W, slot1H);
        ctx.fillStyle = '#64748b';
        ctx.font = '600 22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Hero Vehicle Angle', slot1X + slot1W / 2, slot1Y + slot1H / 2);
      }
      ctx.restore();
      ctx.restore(); // restore Slot 1 backdrop

      // 6. Photo Slot 2 (Secondary / Detail, Bottom-Center-Right)
      const slot2X = 390;
      const slot2Y = 475;
      const slot2W = 390;
      const slot2H = 275;

      // Dark Slate & Orange Trim Border for Slot 2
      ctx.save();
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(slot2X - 5, slot2Y - 5, slot2W + 10, slot2H + 10);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.strokeRect(slot2X - 2, slot2Y - 2, slot2W + 4, slot2H + 4);

      // Clip and Draw Slot 2
      ctx.save();
      ctx.beginPath();
      ctx.rect(slot2X, slot2Y, slot2W, slot2H);
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
      ctx.restore();

      // 7. Branding (Top-Left): Whale-Tail Icon & Wailtail Logotype
      const brandX = 65;
      const brandY = 65;

      ctx.save();
      // Render Whale Tail Fluke SVG Path
      ctx.translate(brandX, brandY);
      ctx.scale(1.3, 1.3);
      ctx.fillStyle = '#ffffff';

      const flukePath = new Path2D(
        "M32.54 24.688a7.155 7.155 0 0 0-7.147-7.147c-0.04 0-0.079 0.005-0.119 0.006-2.995-0.044-5.002-0.687-5.795-1.879a2.593 2.593 0 0 1-0.309-2.052c9.13-0.245 9.452-8.8 9.455-8.888a0.549 0.549 0 0 0-0.544-0.563c-0.346-0.001-7.934-0.02-12.038 3.662C11.94 4.148 4.354 4.167 4.004 4.165a0.549 0.549 0 0 0-0.544 0.563c0.002 0.087 0.318 8.478 9.191 8.878-0.394 2.192-1.288 9.271 2.452 13.979 2.178 2.743 5.548 4.159 10.001 4.235 0.097 0.004 0.192 0.015 0.289 0.015 0.012 0 0.023-0.002 0.035-0.002 0.015 0 0.029 0.002 0.045 0.002 0.009 0 0.017-0.005 0.026-0.005A7.152 7.152 0 0 0 32.54 24.688ZM15.965 26.905c-4.047-5.091-2.132-13.624-2.112-13.709a0.549 0.549 0 0 0-0.536-0.673c-7.176 0-8.475-5.426-8.708-7.247 1.883 0.072 7.762 0.544 10.884 3.529v1.337a0.549 0.549 0 0 0 1.099 0V8.805c3.119-2.982 9.001-3.456 10.884-3.528-0.234 1.821-1.533 7.246-8.708 7.246a0.549 0.549 0 0 0-0.504 0.332 3.82 3.82 0 0 0 0.291 3.407 5.438 5.438 0 0 0 3.586 2.07 7.126 7.126 0 0 0-1.458 11.717A9.575 9.575 0 0 1 15.965 26.905Zm9.463 3.83c-0.1 0-0.193-0.01-0.293-0.012a6.042 6.042 0 0 1 0.149-12.078c0.105 0.001 0.2 0.009 0.307 0.009 0.006 0 0.011-0.003 0.018-0.003a6.044 6.044 0 0 1-0.181 12.084Z"
      );
      ctx.fill(flukePath);
      const ringPath = new Path2D(
        "M25.393 20.541a4.147 4.147 0 1 0 4.148 4.147A4.152 4.152 0 0 0 25.393 20.541Zm0 7.196a3.049 3.049 0 1 1 3.049-3.049A3.052 3.052 0 0 1 25.393 27.737Z"
      );
      ctx.fill(ringPath);
      ctx.restore();

      // Logotype Text
      ctx.save();
      ctx.font = '800 32px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('wailtail', brandX + 50, brandY + 30);
      ctx.fillStyle = '#f59e0b';
      ctx.fillText('.com', brandX + 160, brandY + 30);
      ctx.restore();

      // Platform Micro-Tagline
      ctx.save();
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('CANADIAN ENTHUSIAST & COLLECTOR AUCTIONS', brandX + 52, brandY + 48);
      ctx.restore();

      // 8. Dynamic Lifecycle Status Badge
      let badgeLabel = 'AUCTION IS LIVE';
      let badgeBg = '#10b981';
      let badgeTextColor = '#ffffff';

      if (stage === 'upcoming') {
        badgeLabel = 'UPCOMING AUCTION';
        badgeBg = '#ea580c';
      } else if (stage === 'ending_soon') {
        badgeLabel = 'ENDING TODAY — NO SNIPING';
        badgeBg = '#ef4444';
      }

      ctx.save();
      const badgeY = 150;
      ctx.font = '800 13px system-ui, sans-serif';
      const badgeTextMetrics = ctx.measureText(badgeLabel);
      const badgeWidth = badgeTextMetrics.width + 32;
      const badgeHeight = 32;

      // Badge Rounded Box
      ctx.fillStyle = badgeBg;
      ctx.beginPath();
      ctx.roundRect(brandX, badgeY, badgeWidth, badgeHeight, 6);
      ctx.fill();

      // Inner dot
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(brandX + 14, badgeY + badgeHeight / 2, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = badgeTextColor;
      ctx.fillText(badgeLabel, brandX + 26, badgeY + 21);
      ctx.restore();

      // 9. Vehicle Title Typography
      ctx.save();
      const vehicleTitle = `${auction.year || ''} ${auction.make || ''} ${auction.model || ''}${auction.generation ? ' ' + auction.generation : ''}`.trim().toUpperCase();
      ctx.font = '900 38px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#ffffff';
      const titleBottomY = drawWrappedText(ctx, vehicleTitle, brandX, 230, 420, 46, 2);
      ctx.restore();

      // 10. Subtitle / Custom Tagline (High Contrast White / Amber)
      if (tagline && tagline.trim()) {
        ctx.save();
        ctx.font = 'italic 600 20px system-ui, sans-serif';
        ctx.fillStyle = '#f8fafc';
        const taglineBottomY = drawWrappedText(ctx, `"${tagline.trim()}"`, brandX, titleBottomY + 14, 410, 28, 2);
        ctx.restore();

        // 11. Core Vehicle Feature Chips
        ctx.save();
        const chipsY = taglineBottomY + 24;
        const chips: string[] = [];
        if (auction.mileage) chips.push(`${auction.mileage} ${auction.distanceUnit || 'KM'}`);
        if (auction.engine) chips.push(auction.engine);
        if (auction.drivetrain) chips.push(auction.drivetrain);
        chips.push('0% BUYER PREMIUM');

        let chipX = brandX;
        let chipRowY = chipsY;
        ctx.font = '700 12px system-ui, sans-serif';

        chips.slice(0, 3).forEach((chip) => {
          const chipW = ctx.measureText(chip.toUpperCase()).width + 18;
          ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(chipX, chipRowY, chipW, 28, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#e2e8f0';
          ctx.fillText(chip.toUpperCase(), chipX + 9, chipRowY + 18);
          chipX += chipW + 10;
        });
        ctx.restore();
      }

      // 12. Bottom Left Bid / Pricing Panel
      ctx.save();
      const bottomY = 780;
      ctx.font = '700 12px system-ui, sans-serif';
      ctx.fillStyle = '#94a3b8';
      const bidHeader = stage === 'upcoming' ? 'STARTING BID' : 'CURRENT HIGH BID';
      ctx.fillText(bidHeader, brandX, bottomY);

      const bidVal = stage === 'upcoming' 
        ? (auction.startingBid || 0) 
        : (auction.currentBid || auction.startingBid || 0);

      ctx.font = '900 36px monospace';
      ctx.fillStyle = '#34d399'; // Emerald-400
      ctx.fillText(`${formatCurrency(bidVal)} CAD`, brandX, bottomY + 38);

      ctx.font = '700 11px system-ui, sans-serif';
      ctx.fillStyle = '#f59e0b';
      ctx.fillText('NO BUYER FEES — WINNING BID IS ACTUAL PRICE', brandX, bottomY + 60);
      ctx.restore();

      // 13. Bottom Right Call to Action Badge Container
      const ctaW = 380;
      const ctaH = 96;
      const ctaX = width - ctaW - 60;
      const ctaY = 745;

      ctx.save();
      // Panel Base
      const ctaGrad = ctx.createLinearGradient(ctaX, ctaY, ctaX + ctaW, ctaY + ctaH);
      ctaGrad.addColorStop(0, '#1e293b');
      ctaGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = ctaGrad;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(ctaX, ctaY, ctaW, ctaH, 12);
      ctx.fill();
      ctx.stroke();

      // CTA Sub-header
      ctx.font = '800 12px system-ui, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText('REGISTER TO BID & VIEW FULL DOSSIER', ctaX + ctaW / 2, ctaY + 34);

      // Main Domain URL
      ctx.font = '900 28px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('wailtail.com/auctions', ctaX + ctaW / 2, ctaY + 68);
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
    } catch (err: any) {
      console.error('Canvas export error:', err);
      setCanvasError('Canvas export restricted due to external image CORS restrictions.');
    }
  };

  // Engine 2: Copy Generator Templates
  const copyTemplates = useMemo(() => {
    if (!auction) return { enthusiast_forum: '', marketplace_pitch: '', x_thread: '' };

    const year = auction.year || '';
    const make = auction.make || '';
    const model = auction.model || '';
    const generation = auction.generation ? ` (${auction.generation})` : '';
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
    const stageLabel = stage === 'upcoming' ? 'scheduled to go live' : stage === 'ending_soon' ? 'ending today with anti-sniping protection' : 'now live for bidding';

    // 1. Enthusiast Group Deep-Dive
    const enthusiast_forum = [
      `Hey fellow ${make} enthusiasts,`,
      ``,
      `Decided it's time to pass the torch on my ${year} ${make} ${model}${generation}. Rather than dealing with flaky marketplace messages, lowballers, and joyriders, I have consigned it on Wailtail — Canada's dedicated enthusiast auction platform with 0% buyer fees.`,
      ``,
      `📋 VEHICLE OVERVIEW & SPECS:`,
      `• Year & Model: ${year} ${make} ${model}${generation}`,
      `• VIN: ${vin}`,
      `• Odometer: ${mileage}`,
      `• Powertrain: ${engine} | ${drivetrain}`,
      `• Exterior / Interior: ${exterior} / ${interior}`,
      `• Registration: ${titleStatus}`,
      `• Location: ${location}`,
      ``,
      `🔧 PROVENANCE & CONDITION HIGHLIGHTS:`,
      tagline ? `• Key Highlight: "${tagline}"` : `• Meticulously maintained and stored in climate-controlled garage`,
      `• Comprehensive high-resolution photo gallery with 4K walkaround video and mechanical inspection details on file.`,
      auction.serviceRecordsUrl ? `• Verified service records and provenance documentation attached to the lot.` : `• Clean title and verified ownership history.`,
      ``,
      `🔗 VIEW FULL LOT DETAILS & REGISTER TO BID:`,
      `${canonicalTrackingUrl}`,
      ``,
      `*(Note for prospective bidders: Wailtail charges 0% buyer premium, meaning your winning bid is the true Canadian hammer price with no added platform cut! Happy to answer any mechanical questions in the comments below).*`,
      ``,
      `*(Admins: If this post does not align with group guidelines, please feel free to remove it).*`
    ].join('\n');

    // 2. Marketplace & Short Pitch
    const marketplace_pitch = [
      `🏁 AUCTION SPOTLIGHT: ${year} ${make} ${model}${generation}`,
      ``,
      tagline ? `🔥 "${tagline}"\n` : ``,
      `Currently open for bidding on Wailtail — Canada's zero-buyer-fee collector car marketplace!`,
      ``,
      `• ${mileage} | ${exterior}`,
      `• ${engine} | ${drivetrain}`,
      `• Inspected, documented, with cold-start video and complete photo gallery`,
      `• Current High Bid: ${bidFormatted} CAD (No buyer's premium added)`,
      ``,
      `👉 View the full lot and submit your bid here:`,
      `${canonicalTrackingUrl}`,
      ``,
      `#Wailtail #${make.replace(/\s+/g, '')} #${model.replace(/\s+/g, '')} #ClassicCars #SportsCars #CarAuction #ZeroBuyerFee`
    ].join('\n');

    // 3. X / Twitter Thread
    const x_thread = [
      `🧵 1/3: Decided to list my ${year} ${make} ${model}${generation} on @wailtail — Canada's curated collector auction platform with 0% buyer fees.`,
      ``,
      tagline ? `Highlight: "${tagline}"\n` : ``,
      `🧵 2/3: Mechanical Health & Specs:`,
      `• ${mileage} | ${drivetrain}`,
      `• ${exterior} over ${interior}`,
      `• Full paint readings, high-res gallery, cold-start video, and complete documentation on file.`,
      ``,
      `🧵 3/3: The auction is ${stageLabel}. Transparent enthusiast bidding with anti-sniping protection:`,
      `👉 ${canonicalTrackingUrl}`
    ].join('\n');

    return { enthusiast_forum, marketplace_pitch, x_thread };
  }, [auction, stage, tagline, canonicalTrackingUrl]);

  // Handle Copy to Clipboard
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
              {/* Graphic Customization Form */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 bg-slate-950/40 p-4 rounded-xl border border-slate-800">
                {/* Custom Tagline Input */}
                <div className="md:col-span-1 space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>Custom Graphic Tagline</span>
                    <span className="text-[10px] text-slate-500 font-mono">Max 65 chars</span>
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

                {/* Slot 1 Photo Switcher */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span>Slot 1 (Hero Angle)</span>
                  </label>
                  <select
                    value={imageSlot1}
                    onChange={(e) => setImageSlot1(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-amber-400"
                  >
                    {allPhotos.length === 0 ? (
                      <option value="">No photos available</option>
                    ) : (
                      allPhotos.map((photo, i) => (
                        <option key={photo} value={photo}>
                          Photo #{i + 1} {i === 0 ? '(Lead Hero)' : ''}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Slot 2 Photo Switcher */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                    <span>Slot 2 (Detail/Cockpit)</span>
                  </label>
                  <select
                    value={imageSlot2}
                    onChange={(e) => setImageSlot2(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-amber-400"
                  >
                    {allPhotos.length === 0 ? (
                      <option value="">No photos available</option>
                    ) : (
                      allPhotos.map((photo, i) => (
                        <option key={photo} value={photo}>
                          Photo #{i + 1} {i === 1 ? '(Secondary Detail)' : ''}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Photo Thumbnail Tray */}
              {allPhotos.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Quick Select Media Tray ({allPhotos.length} available):</span>
                    <span className="text-[11px] text-slate-500">Click to set Slot 1 (Left-click) or Slot 2 (Right-click)</span>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
                    {allPhotos.map((photo, idx) => {
                      const isSlot1 = imageSlot1 === photo;
                      const isSlot2 = imageSlot2 === photo;
                      return (
                        <div
                          key={photo}
                          onClick={() => setImageSlot1(photo)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setImageSlot2(photo);
                          }}
                          className={`relative flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                            isSlot1
                              ? 'border-amber-400 ring-2 ring-amber-400/30'
                              : isSlot2
                              ? 'border-orange-500 ring-2 ring-orange-500/30'
                              : 'border-slate-800 hover:border-slate-600 opacity-70 hover:opacity-100'
                          }`}
                          title={`Photo #${idx + 1}. Click for Slot 1, Right-click for Slot 2`}
                        >
                          <img
                            src={photo}
                            alt={`Thumb ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          {(isSlot1 || isSlot2) && (
                            <span className="absolute bottom-0.5 right-0.5 px-1 py-0.2 bg-black/80 text-[9px] font-bold text-white rounded">
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
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <span className="text-slate-400 block font-semibold text-[11px]">Tracked Campaign URL:</span>
                  <span className="font-mono text-amber-400 truncate block text-xs" title={canonicalTrackingUrl}>
                    {canonicalTrackingUrl}
                  </span>
                </div>
                <a
                  href={canonicalTrackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center gap-1.5 text-xs font-bold transition-colors w-fit flex-shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Test URL</span>
                </a>
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
