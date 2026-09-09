import React, { useState, useEffect } from 'react';
import { Auction } from '../types';
import { useAuth } from '../context/AuthContext';
import { submitInquiry } from '../services/auctionService';
import { X, Mail, Send, CheckCircle, AlertTriangle, MessageSquare, ShieldCheck } from 'lucide-react';

interface ContactSellerModalProps {
  isOpen: boolean;
  onClose: () => void;
  auction: Auction;
}

export const ContactSellerModal: React.FC<ContactSellerModalProps> = ({
  isOpen,
  onClose,
  auction
}) => {
  const { user, profile } = useAuth();
  const [topic, setTopic] = useState<string>('Pre-Purchase Inspection (PPI) / In-Person Viewing');
  const [phone, setPhone] = useState<string>(profile?.phone || '');
  const [message, setMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter your message before sending.' });
      return;
    }

    setLoading(true);
    setStatusMessage(null);

    const senderName = profile?.displayName || user?.displayName || 'Registered Member';
    const senderEmail = profile?.email || user?.email || '';
    const vehicleTitle = auction.title || 'Wailtail Single-Car Listing';

    try {
      await submitInquiry({
        auctionId: auction.id,
        senderId: user?.uid || 'anonymous',
        senderName,
        senderEmail,
        senderPhone: phone.trim() || undefined,
        topic,
        message: message.trim(),
        vehicleTitle,
        sellerEmail: 'jeremy@theinnovativegroup.ca'
      });

      // Dispatch non-blocking serverless email notification to platform administrators
      try {
        const response = await fetch('/api/send-consignment-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            type: 'inquiry',
            name: senderName,
            email: senderEmail,
            phone: phone.trim() || undefined,
            topic,
            message: message.trim(),
            vehicleTitle
          })
        });

        if (!response.ok) {
          const errDetail = await response.text();
          console.error('[ContactSellerModal] Serverless email dispatch returned error status:', response.status, errDetail);
        }
      } catch (emailErr) {
        // Fallback Email Logging: ensure user inquiry still completes cleanly without UI errors
        console.error('[ContactSellerModal] Error dispatching inquiry email notification:', emailErr);
      }

      setStatusMessage({
        type: 'success',
        text: 'Inquiry submitted and delivered to consignor/admin!'
      });
      setMessage('');
      setTimeout(() => {
        onClose();
        setStatusMessage(null);
      }, 2500);
    } catch (err: any) {
      console.error('Error sending seller inquiry:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to send inquiry. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] mx-auto bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
      >
        {/* Header Bar */}
        <div className="bg-[#121619] text-white px-4 sm:px-6 py-4 flex items-center justify-between border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-700 flex items-center justify-center text-white flex-shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <span>Contact Consignor</span>
                <span className="px-1.5 py-0.2 rounded bg-red-950 text-red-300 text-[10px] uppercase font-bold border border-red-800">
                  Direct Inquiries
                </span>
              </h3>
              <p className="text-[11px] text-zinc-400">
                Direct inquiry to {auction.sellerName || 'the vehicle seller'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {statusMessage && (
          <div className={`p-4 text-xs font-semibold flex items-center gap-2 flex-shrink-0 ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200' 
              : 'bg-red-50 text-red-800 border-b border-red-200'
          }`}>
            {statusMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Modal Form with Scrollable Body and Fixed Action Footer */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-4 sm:p-6 space-y-4 text-xs overflow-y-auto flex-1 text-zinc-800">
            {/* Target Vehicle Summary */}
            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Listing Target</span>
                <span className="font-bold text-zinc-900 text-xs truncate max-w-xs block font-serif">
                  {auction.title}
                </span>
              </div>
              <span className="px-2 py-0.5 rounded bg-zinc-200 text-zinc-700 font-mono text-[10px] font-bold flex-shrink-0">
                CAD Auction
              </span>
            </div>

            {/* Sender Identity Preview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-zinc-700 mb-1">Your Name</label>
                <input
                  type="text"
                  disabled
                  value={profile?.displayName || user?.displayName || 'Registered Member'}
                  className="w-full p-2.5 rounded-lg border border-zinc-300 bg-zinc-100 text-zinc-600 font-medium text-base sm:text-sm cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-700 mb-1">Your Registered Email</label>
                <input
                  type="email"
                  disabled
                  value={profile?.email || user?.email || ''}
                  className="w-full p-2.5 rounded-lg border border-zinc-300 bg-zinc-100 text-zinc-600 font-mono text-base sm:text-sm cursor-not-allowed"
                />
              </div>
            </div>

            {/* Phone Number (Optional) */}
            <div>
              <label className="block font-bold text-zinc-700 mb-1">
                Contact Phone Number <span className="text-zinc-400 font-normal">(Optional, for phone/WhatsApp follow-up)</span>
              </label>
              <input
                type="tel"
                placeholder="+1 (604) 555-0199"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-zinc-300 focus:ring-2 focus:ring-red-600 focus:outline-none font-mono text-base sm:text-sm"
              />
            </div>

            {/* Inquiry Topic Dropdown */}
            <div>
              <label className="block font-bold text-zinc-700 mb-1">Inquiry Topic</label>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-zinc-300 bg-white font-semibold text-zinc-800 text-base sm:text-sm focus:ring-2 focus:ring-red-600 focus:outline-none cursor-pointer"
              >
                <option value="Pre-Purchase Inspection (PPI) / In-Person Viewing">
                  Pre-Purchase Inspection (PPI) / In-Person Viewing
                </option>
                <option value="Title Status, Registration & Documentation">
                  Title Status, Provincial Registration & Documentation
                </option>
                <option value="Vehicle History, Maintenance & Service Records">
                  Vehicle History, Maintenance & Service Records
                </option>
                <option value="Shipping, Cross-Border Logistics & Transport">
                  Shipping, Cross-Border Logistics & Enclosed Transport
                </option>
                <option value="General Vehicle Question">
                  General Vehicle Question
                </option>
              </select>
            </div>

            {/* Message Area */}
            <div>
              <label className="block font-bold text-zinc-700 mb-1">
                Your Message / Questions <span className="text-red-700">*</span>
              </label>
              <textarea
                rows={4}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Please describe your specific question or specify convenient dates if requesting a Pre-Purchase Inspection..."
                className="w-full p-2.5 rounded-lg border border-zinc-300 focus:ring-2 focus:ring-red-600 focus:outline-none text-zinc-800 placeholder:text-zinc-400 text-base sm:text-sm"
              />
            </div>

            {/* Trust Notice */}
            <div className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-600 text-[11px] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>Inquiries route directly to the vehicle consignor via Wailtail transactional notifications.</span>
            </div>
          </div>

          {/* Sticky Actions Footer */}
          <div className="p-3.5 sm:px-6 sm:py-3.5 border-t border-zinc-200 bg-zinc-50 flex items-center justify-end gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-lg text-zinc-600 hover:bg-zinc-200 font-bold transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading || !message.trim()}
              className={`min-h-[44px] px-5 py-2.5 rounded-lg font-bold text-white flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer ${
                loading || !message.trim()
                  ? 'bg-zinc-400 cursor-not-allowed'
                  : 'bg-red-700 hover:bg-red-800 active:scale-95'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>{loading ? 'Sending Inquiry...' : 'Submit Inquiry'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
