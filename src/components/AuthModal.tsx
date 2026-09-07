import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  X, 
  Mail, 
  Lock, 
  User, 
  Phone, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  KeyRound,
  ArrowLeft
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'signin' | 'signup' | 'verify' | 'forgot';
  onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'signin',
  onSuccess
}) => {
  const { 
    user, 
    isEmailVerified, 
    signInEmail, 
    signUpEmail, 
    signInGoogle, 
    resetPassword,
    resendVerificationEmail, 
    checkEmailVerification,
    manualVerifyForDemo 
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'signin' | 'signup' | 'verify' | 'forgot'>(
    user && !isEmailVerified ? 'verify' : initialTab
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const parseAuthError = (err: any): string => {
    if (!err) return 'An unexpected error occurred. Please try again.';
    const code = err.code || '';
    const msg = err.message || '';

    if (code === 'auth/operation-not-allowed' || msg.includes('operation-not-allowed') || code === 'auth/admin-restricted-operation') {
      return 'Email/Password authentication provider is not enabled in Firebase Console. You can sign in with Google or use the instant demo mode.';
    }
    if (code === 'auth/email-already-in-use') {
      return 'An account with this email address already exists. Please switch to Sign In or reset your password.';
    }
    if (code === 'auth/weak-password') {
      return 'Password should be at least 6 characters long.';
    }
    if (code === 'auth/invalid-email') {
      return 'Please enter a valid email address (e.g. name@domain.com).';
    }
    if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
      return 'Incorrect email or password. Please double check your credentials and try again.';
    }
    if (code === 'auth/popup-closed-by-user') {
      return 'Sign-in popup was closed before completing verification.';
    }
    if (code === 'auth/network-request-failed') {
      return 'Network connection issue. Please check your internet connection and retry.';
    }
    if (code === 'auth/too-many-requests') {
      return 'Access temporarily blocked due to multiple failed login attempts. Please wait a moment.';
    }

    return msg.replace(/^Firebase:\s*/, '') || 'Authentication failed. Please try again.';
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInEmail(email.trim(), password);
      setLoading(false);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setLoading(false);
      setError(parseAuthError(err));
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!displayName.trim()) {
      setError('Please provide a screen name or your full name.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      await signUpEmail(email.trim(), password, displayName.trim(), phone.trim());
      setLoading(false);
      setActiveTab('verify');
    } catch (err: any) {
      setLoading(false);
      setError(parseAuthError(err));
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address to receive password reset instructions.');
      return;
    }
    setError(null);
    setSuccessMessage(null);
    setLoading(true);
    try {
      await resetPassword(email.trim());
      setLoading(false);
      setSuccessMessage('Password reset link sent! Check your inbox or spam folder.');
    } catch (err: any) {
      setLoading(false);
      setError(parseAuthError(err));
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInGoogle();
      setLoading(false);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setLoading(false);
      setError(parseAuthError(err));
    }
  };

  const handleResend = async () => {
    setResendStatus(null);
    try {
      await resendVerificationEmail();
      setResendStatus('Verification email sent! Check your inbox or spam folder.');
    } catch (err: any) {
      setResendStatus('Error sending verification email: ' + err.message);
    }
  };

  const handleCheckVerified = async () => {
    setLoading(true);
    const verified = await checkEmailVerification();
    setLoading(false);
    if (verified) {
      if (onSuccess) onSuccess();
      onClose();
    } else {
      setError('Email is not verified yet. Please click the link in your inbox or use the instant demo verify.');
    }
  };

  const handleQuickDemoVerify = async () => {
    await manualVerifyForDemo();
    if (onSuccess) onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden"
      >
        {/* Modal Header */}
        <div className="bg-[#121619] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-red-700 flex items-center justify-center font-black text-sm">
              WT
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">
                {activeTab === 'verify' 
                  ? 'Bidder Email Verification' 
                  : activeTab === 'forgot'
                  ? 'Reset Your Password'
                  : 'Bidder Authentication'}
              </h2>
              <p className="text-xs text-zinc-400">Private Single-Car Auction</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector (Sign In vs Register) */}
        {activeTab !== 'verify' && activeTab !== 'forgot' && (
          <div className="grid grid-cols-2 border-b border-zinc-200 bg-zinc-50 text-xs font-bold">
            <button
              onClick={() => {
                setActiveTab('signin');
                setError(null);
                setSuccessMessage(null);
              }}
              className={`py-3 text-center transition-colors border-b-2 ${
                activeTab === 'signin'
                  ? 'border-zinc-900 text-zinc-900 bg-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setActiveTab('signup');
                setError(null);
                setSuccessMessage(null);
              }}
              className={`py-3 text-center transition-colors border-b-2 ${
                activeTab === 'signup'
                  ? 'border-zinc-900 text-zinc-900 bg-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              Register to Bid
            </button>
          </div>
        )}

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* TAB 1: SIGN IN */}
          {activeTab === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('forgot');
                      setError(null);
                      setSuccessMessage(null);
                    }}
                    className="text-xs text-red-700 hover:text-red-800 font-semibold hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-zinc-900 hover:bg-black text-white text-sm font-bold shadow transition-all flex items-center justify-center gap-2"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                <span>Sign In</span>
              </button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-200"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-zinc-400 font-semibold">Or continue with</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg border border-zinc-300 hover:bg-zinc-50 text-zinc-700 text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M12 5c1.7 0 3 .7 3.9 1.5l2.9-2.9C17 2 14.7 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.6 2.8C6.4 7.2 8.9 5 12 5z" />
                  <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.6 2.8c2.1-2 3.8-5 3.8-8.7z" />
                  <path fill="#FBBC05" d="M5.5 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.4C.7 9.8 0 12 0 14.5s.7 4.7 1.9 7.1l3.6-2.8z" />
                  <path fill="#34A853" d="M12 23.5c3.2 0 6-1.1 8-3l-3.6-2.8c-1.1.7-2.5 1.2-4.4 1.2-3.1 0-5.6-2.2-6.5-5.1L1.9 16.6C3.7 20.3 7.5 23.5 12 23.5z" />
                </svg>
                <span>Sign In with Google</span>
              </button>
            </form>
          )}

          {/* TAB: FORGOT PASSWORD */}
          {activeTab === 'forgot' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="text-center pb-2">
                <div className="w-10 h-10 rounded-full bg-red-100 text-red-700 mx-auto flex items-center justify-center mb-2">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-zinc-900">Reset Your Password</h3>
                <p className="text-xs text-zinc-500 mt-1">
                  Enter your registered email address and we'll send you a password reset link.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
                  Registered Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-sm font-bold shadow transition-all flex items-center justify-center gap-2"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                <span>Send Password Reset Email</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('signin');
                  setError(null);
                  setSuccessMessage(null);
                }}
                className="w-full py-2 text-zinc-600 hover:text-zinc-900 text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Sign In</span>
              </button>
            </form>
          )}

          {/* TAB 2: REGISTER */}
          {activeTab === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
                  Full Name or Screen Handle
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Klaus_RSR"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  A verification link will be sent to this email address.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
                  Contact Phone (Private for settlement)
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 000-0000"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
                  Password (6+ characters)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
              </div>

              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-[11px] text-zinc-600 space-y-1">
                <div className="font-semibold text-zinc-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Private Direct Auction Standards</span>
                </div>
                <p>
                  No buyer fees. Winning bidder contact details are shared directly with the owner for offline funds settlement.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-sm font-bold shadow transition-all flex items-center justify-center gap-2"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                <span>Create Registered Account</span>
              </button>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg border border-zinc-300 hover:bg-zinc-50 text-zinc-700 text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <span>Register with Google (Instant Verified)</span>
              </button>
            </form>
          )}

          {/* TAB 3: EMAIL VERIFICATION NOTICE */}
          {activeTab === 'verify' && (
            <div className="space-y-4 text-center">
              <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 mx-auto flex items-center justify-center">
                <Mail className="w-6 h-6" />
              </div>

              <div>
                <h3 className="text-base font-bold text-zinc-900">
                  Verify Your Email Address
                </h3>
                <p className="text-xs text-zinc-600 mt-1 max-w-sm mx-auto">
                  To ensure legitimate bids and preserve auction integrity, all bidders must verify their email before placing a bid.
                </p>
                {user?.email && (
                  <p className="text-xs font-mono font-bold text-zinc-800 bg-zinc-100 py-1 px-2 rounded mt-2 inline-block">
                    {user.email}
                  </p>
                )}
              </div>

              {resendStatus && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg">
                  {resendStatus}
                </div>
              )}

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={handleCheckVerified}
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  <span>I've Verified — Check Status</span>
                </button>

                <button
                  type="button"
                  onClick={handleResend}
                  className="w-full py-2 rounded-lg border border-zinc-300 hover:bg-zinc-50 text-zinc-700 text-xs font-semibold"
                >
                  Resend Verification Email
                </button>

                <div className="pt-3 border-t border-zinc-200">
                  <button
                    type="button"
                    onClick={handleQuickDemoVerify}
                    className="w-full py-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold border border-zinc-300 flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span>Instant Demo Verification</span>
                  </button>
                  <p className="text-[10px] text-zinc-400 mt-1">
                    Demo helper to test bidding immediately without opening email.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

