import React, { useState, useEffect } from 'react';
import { 
  X, 
  AlertTriangle, 
  Lightbulb, 
  MessageSquare, 
  CheckCircle, 
  Loader2, 
  Send,
  Info
} from 'lucide-react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

export type FeedbackCategory = 'bug' | 'suggestion' | 'general';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose }) => {
  const { user, userProfile } = useAuth();

  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [message, setMessage] = useState('');
  const [reporterName, setReporterName] = useState('');
  const [reporterEmail, setReporterEmail] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync authenticated user info or clear on open
  useEffect(() => {
    if (isOpen) {
      setIsSuccess(false);
      setErrorMessage(null);
      setMessage('');
      if (user) {
        setReporterName(userProfile?.displayName || user.displayName || '');
        setReporterEmail(userProfile?.email || user.email || '');
      } else {
        setReporterName('');
        setReporterEmail('');
      }
    }
  }, [isOpen, user, userProfile]);

  // Handle escape key listener
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

  // Lock body scroll when open
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

  const characterCount = message.length;
  const isMessageValid = characterCount >= 10 && characterCount <= 1500;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMessageValid || isSubmitting) return;

    const trimmedEmail = reporterEmail.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMessage('Please enter a valid email address or leave it blank.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    // Automatically capture diagnostic client metadata at submission time
    const clientPayload = {
      category,
      message: message.trim(),
      reporterName: reporterName.trim() || (user ? 'Authenticated User' : 'Visitor'),
      reporterEmail: trimmedEmail || null,
      url: window.location.href,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      userAgent: navigator.userAgent,
      timestamp: Date.now(),
      userId: user?.uid || null,
      userRole: userProfile?.role || 'GUEST',
      status: 'new'
    };

    try {
      // 1. Persist directly to Firestore feedback collection
      await addDoc(collection(db, 'feedback'), clientPayload);

      // 2. Dispatch non-blocking POST to /api/send-consignment-email
      fetch('/api/send-consignment-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'feedback_report',
          ...clientPayload
        })
      }).catch((emailErr) => {
        console.warn('[FeedbackModal] Non-blocking email dispatch latency/error:', emailErr);
      });

      // Show success state
      setIsSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      console.error('[FeedbackModal] Error submitting feedback:', err);
      setErrorMessage(err?.message || 'Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop with blur */}
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      {/* Modal Dialog Container */}
      <div 
        className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-10 text-slate-100 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              Feedback & Bug Report
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Help us refine Wailtail before our live auction events
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        {isSuccess ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">Thank you for helping us improve Wailtail!</h3>
              <p className="text-xs text-slate-400">
                Your report and diagnostics have been logged and routed to platform curation.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Close Now
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {errorMessage && (
              <div className="p-3 bg-red-950/50 border border-red-800/80 rounded-xl text-xs text-red-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Category Selector Tabs */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Category
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setCategory('bug')}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                    category === 'bug'
                      ? 'bg-red-500/10 border-red-500 text-red-400 shadow-sm'
                      : 'bg-slate-800/50 border-slate-750 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Technical Bug</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCategory('suggestion')}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                    category === 'suggestion'
                      ? 'bg-blue-500/10 border-blue-500 text-blue-400 shadow-sm'
                      : 'bg-slate-800/50 border-slate-750 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  <span>Suggestion</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCategory('general')}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                    category === 'general'
                      ? 'bg-amber-500/10 border-amber-500 text-amber-400 shadow-sm'
                      : 'bg-slate-800/50 border-slate-750 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>General</span>
                </button>
              </div>
            </div>

            {/* Feedback Description Textarea */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="feedback-message" className="font-semibold text-slate-300 uppercase tracking-wider">
                  Description <span className="text-red-400">*</span>
                </label>
                <span className={`font-mono text-[11px] ${characterCount > 1500 ? 'text-red-400' : 'text-slate-400'}`}>
                  {characterCount}/1,500
                </span>
              </div>
              <textarea
                id="feedback-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  category === 'bug'
                    ? "What went wrong? Steps to reproduce the issue..."
                    : category === 'suggestion'
                    ? "What feature or enhancement would you like to see?"
                    : "Share your thoughts or impressions about Wailtail..."
                }
                rows={4}
                maxLength={1500}
                className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all resize-y"
              />
              {characterCount > 0 && characterCount < 10 && (
                <p className="text-[11px] text-amber-400">
                  Please provide at least 10 characters so we have enough context.
                </p>
              )}
            </div>

            {/* Reporter Contact Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label htmlFor="reporter-name" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Your Name (Optional)
                </label>
                <input
                  id="reporter-name"
                  type="text"
                  value={reporterName}
                  onChange={(e) => setReporterName(e.target.value)}
                  placeholder="Collector / Enthusiast"
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="reporter-email" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Email (Optional, if you'd like a response)
                </label>
                <input
                  id="reporter-email"
                  type="email"
                  value={reporterEmail}
                  onChange={(e) => setReporterEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                />
              </div>
            </div>

            {/* Diagnostic Notice */}
            <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3 flex items-start gap-2 text-[11px] text-slate-400 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
              <span>
                To accelerate bug triage, your current page URL, browser type, and screen dimensions are automatically included with this report.
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isMessageValid || isSubmitting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 active:bg-red-800 text-white text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Submit Feedback</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
