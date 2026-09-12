import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as fbSignOut, 
  signInWithPopup, 
  sendEmailVerification, 
  sendPasswordResetEmail,
  updateProfile,
  reload
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { AlertCircle, X } from 'lucide-react';
import { auth, db, googleProvider } from '../firebase';
import { UserProfile } from '../types';
import { sendWelcomeBidderEmail } from '../services/auctionService';

export const ADMIN_EMAILS = [
  'jeremygoodmurphy@gmail.com',
  'jeremy@theinnovativegroup.ca'
];

let isRegistrationInProgress = false;

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isSeller: boolean;
  isEmailVerified: boolean;
  signInEmail: (email: string, pass: string) => Promise<User>;
  signUpEmail: (email: string, pass: string, displayName: string, phone?: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  checkEmailVerification: () => Promise<boolean>;
  manualVerifyForDemo: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Sync user and profile with orphaned session revocation guard
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          let snap = await getDoc(userRef);

          if (!snap.exists() && isRegistrationInProgress) {
            await new Promise((resolve) => setTimeout(resolve, 800));
            snap = await getDoc(userRef);
          }

          if (snap.exists()) {
            const data = snap.data() as UserProfile;
            let updatedNeeded = false;
            const updates: Partial<UserProfile> = {};

            const userEmail = (currentUser.email || '').toLowerCase();
            const isDesignatedAdmin = ADMIN_EMAILS.some(e => e.toLowerCase() === userEmail);
            
            // Ensure role is assigned
            if (!data.role) {
              data.role = isDesignatedAdmin ? 'admin' : 'bidder';
              updates.role = data.role;
              updatedNeeded = true;
            }

            // Update email verified status if changed
            const isVerified = Boolean(currentUser.emailVerified || data.isEmailVerified);
            if (currentUser.emailVerified && !data.isEmailVerified) {
              updates.isEmailVerified = true;
              data.isEmailVerified = true;
              updatedNeeded = true;
            }

            if (updatedNeeded) {
              await updateDoc(userRef, updates).catch((err) => console.warn('User profile sync notice:', err));
            }

            // Defer welcome email dispatch until email verification is confirmed
            if (isVerified && currentUser.email) {
              const key = `wailtail_welcome_sent_${currentUser.uid}`;
              try {
                if (typeof window !== 'undefined' && !localStorage.getItem(key)) {
                  localStorage.setItem(key, 'true');
                  sendWelcomeBidderEmail(currentUser.email, data.displayName || currentUser.email.split('@')[0]).catch((err: any) => {
                    console.warn('Automatic verified welcome email dispatch notice:', err);
                  });
                }
              } catch {
                // Ignore localStorage errors
              }
            }

            setUser(currentUser);
            setUserProfile(data);
          } else {
            // Profile is missing from Firestore - orphaned session (account deleted by administrator)
            console.warn(`[AuthContext] Account profile users/${currentUser.uid} missing. Revoking session.`);
            await fbSignOut(auth).catch((err) => console.warn('Forced sign-out notice:', err));
            setUser(null);
            setUserProfile(null);
            setToastMessage('This account has been deleted by an administrator.');
            if (typeof window !== 'undefined' && window.location.pathname !== '/') {
              window.location.href = '/';
            }
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
          const userEmail = (currentUser.email || '').toLowerCase();
          const isDesignatedAdmin = ADMIN_EMAILS.some(e => e.toLowerCase() === userEmail);
          // Fallback profile if Firestore permission issue
          setUser(currentUser);
          setUserProfile({
            uid: currentUser.uid,
            email: currentUser.email || '',
            displayName: currentUser.displayName || 'Bidder',
            role: isDesignatedAdmin ? 'admin' : 'bidder',
            isEmailVerified: currentUser.emailVerified,
            registeredAt: Date.now()
          });
        }
      } else {
        setUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Real-time listener for active user profile revocation (if account is deleted during an active session)
  useEffect(() => {
    if (!user || isRegistrationInProgress) return;
    const userRef = doc(db, 'users', user.uid);
    const unsub = onSnapshot(userRef, async (snap) => {
      if (!snap.exists() && !isRegistrationInProgress) {
        console.warn(`[AuthContext] Active session user doc users/${user.uid} removed. Revoking session.`);
        await fbSignOut(auth).catch(() => {});
        setUser(null);
        setUserProfile(null);
        setToastMessage('This account has been deleted by an administrator.');
        if (typeof window !== 'undefined' && window.location.pathname !== '/') {
          window.location.href = '/';
        }
      }
    }, (err) => {
      console.warn('Realtime profile watcher notice:', err);
    });
    return () => unsub();
  }, [user?.uid]);

  const isAdmin = Boolean(
    userProfile?.role === 'admin' ||
    (user?.email && ADMIN_EMAILS.some(adminEmail => adminEmail.toLowerCase() === user.email?.toLowerCase()))
  );

  const isSeller = Boolean(
    isAdmin || userProfile?.role === 'seller'
  );

  const isEmailVerified = Boolean(user?.emailVerified || userProfile?.isEmailVerified);

  const signInEmail = async (email: string, pass: string): Promise<User> => {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    await reload(cred.user);
    return cred.user;
  };

  const signUpEmail = async (email: string, pass: string, displayName: string, phone?: string) => {
    isRegistrationInProgress = true;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, { displayName });
      
      // Send verification email
      try {
        await sendEmailVerification(cred.user);
      } catch (e) {
        console.warn('Could not send verification email:', e);
      }

      const userEmail = (cred.user.email || email).toLowerCase();
      const isDesignatedAdmin = ADMIN_EMAILS.some(e => e.toLowerCase() === userEmail);
      const assignedRole: 'admin' | 'seller' | 'bidder' = isDesignatedAdmin ? 'admin' : 'bidder';

      const newProfile: UserProfile = {
        uid: cred.user.uid,
        email: cred.user.email || email,
        displayName: displayName || email.split('@')[0],
        phone: phone || '',
        role: assignedRole, // Standard new users are strictly 'bidder'
        isEmailVerified: cred.user.emailVerified,
        registeredAt: Date.now(),
        totalBidsPlaced: 0,
        highestBidPlaced: 0
      };

      try {
        await setDoc(doc(db, 'users', cred.user.uid), newProfile);
      } catch (e) {
        console.warn('Error creating user doc:', e);
      }
      
      setUser(cred.user);
      setUserProfile(newProfile);
    } finally {
      isRegistrationInProgress = false;
    }
  };

  const signInGoogle = async () => {
    isRegistrationInProgress = true;
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const userRef = doc(db, 'users', cred.user.uid);
      const snap = await getDoc(userRef);
      const userEmail = (cred.user.email || '').toLowerCase();
      const isDesignatedAdmin = ADMIN_EMAILS.some(e => e.toLowerCase() === userEmail);
      
      if (!snap.exists()) {
        const newProfile: UserProfile = {
          uid: cred.user.uid,
          email: cred.user.email || '',
          displayName: cred.user.displayName || 'Bidder',
          role: isDesignatedAdmin ? 'admin' : 'bidder',
          isEmailVerified: true, // Google logins have pre-verified email
          registeredAt: Date.now(),
          totalBidsPlaced: 0,
          highestBidPlaced: 0
        };
        await setDoc(userRef, newProfile).catch((err) => console.warn('Error storing Google user profile:', err));
        setUserProfile(newProfile);
      }
    } finally {
      isRegistrationInProgress = false;
    }
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const signOut = async () => {
    await fbSignOut(auth);
    setUser(null);
    setUserProfile(null);
  };

  const resendVerificationEmail = async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    }
  };

  const checkEmailVerification = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await reload(auth.currentUser);
    const verified = auth.currentUser.emailVerified;
    if (verified && userProfile) {
      const updated = { ...userProfile, isEmailVerified: true };
      setUserProfile(updated);
      try {
        await updateDoc(doc(db, 'users', auth.currentUser.uid), { isEmailVerified: true });
      } catch (err) {
        console.warn('Could not update verified flag in DB:', err);
      }
      // Trigger deferred welcome email once email is confirmed
      const key = `wailtail_welcome_sent_${auth.currentUser.uid}`;
      try {
        if (typeof window !== 'undefined' && !localStorage.getItem(key)) {
          localStorage.setItem(key, 'true');
          sendWelcomeBidderEmail(auth.currentUser.email || userProfile.email, userProfile.displayName).catch((err) => {
            console.warn('Welcome email dispatch notice:', err);
          });
        }
      } catch {
        // ignore
      }
    }
    return verified;
  };

  const manualVerifyForDemo = async () => {
    if (!auth.currentUser) return;
    if (userProfile) {
      const updated = { ...userProfile, isEmailVerified: true };
      setUserProfile(updated);
      try {
        await updateDoc(doc(db, 'users', auth.currentUser.uid), { isEmailVerified: true });
      } catch (err) {
        console.warn(err);
      }
      // Trigger deferred welcome email once email is confirmed
      const key = `wailtail_welcome_sent_${auth.currentUser.uid}`;
      try {
        if (typeof window !== 'undefined' && !localStorage.getItem(key)) {
          localStorage.setItem(key, 'true');
          sendWelcomeBidderEmail(auth.currentUser.email || userProfile.email, userProfile.displayName).catch((err) => {
            console.warn('Welcome email dispatch notice:', err);
          });
        }
      } catch {
        // ignore
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        isAdmin,
        isSeller,
        isEmailVerified,
        signInEmail,
        signUpEmail,
        signInGoogle,
        resetPassword,
        signOut,
        resendVerificationEmail,
        checkEmailVerification,
        manualVerifyForDemo
      }}
    >
      {children}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-[9999] max-w-md animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="p-4 rounded-xl shadow-2xl border bg-red-950/95 border-red-700 text-red-100 flex items-center justify-between gap-3 text-xs font-semibold">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{toastMessage}</span>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="text-red-300 hover:text-white p-0.5 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
