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
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';
import { UserProfile } from '../types';

export const ADMIN_EMAILS = [
  'jeremygoodmurphy@gmail.com',
  'jeremy@theinnovativegroup.ca'
];

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isSeller: boolean;
  isEmailVerified: boolean;
  signInEmail: (email: string, pass: string) => Promise<void>;
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

  // Sync user and profile
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          const snap = await getDoc(userRef);
          const userEmail = (currentUser.email || '').toLowerCase();
          const isDesignatedAdmin = ADMIN_EMAILS.some(e => e.toLowerCase() === userEmail);
          
          if (snap.exists()) {
            const data = snap.data() as UserProfile;
            let updatedNeeded = false;
            const updates: Partial<UserProfile> = {};

            // Ensure role is assigned
            if (!data.role) {
              data.role = isDesignatedAdmin ? 'admin' : 'bidder';
              updates.role = data.role;
              updatedNeeded = true;
            }

            // Update email verified status if changed
            if (currentUser.emailVerified && !data.isEmailVerified) {
              updates.isEmailVerified = true;
              data.isEmailVerified = true;
              updatedNeeded = true;
            }

            if (updatedNeeded) {
              await updateDoc(userRef, updates).catch((err) => console.warn('User profile sync notice:', err));
            }
            setUserProfile(data);
          } else {
            // Create user profile in Firestore
            const initialRole: 'admin' | 'seller' | 'bidder' = isDesignatedAdmin ? 'admin' : 'bidder';
            const newProfile: UserProfile = {
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'Bidder'),
              role: initialRole,
              isEmailVerified: currentUser.emailVerified,
              registeredAt: Date.now(),
              totalBidsPlaced: 0,
              highestBidPlaced: 0
            };
            await setDoc(userRef, newProfile).catch((err) => console.warn('User profile creation notice:', err));
            setUserProfile(newProfile);
          }
        } catch (error) {
          console.error('Error fetching/creating user profile:', error);
          const userEmail = (currentUser.email || '').toLowerCase();
          const isDesignatedAdmin = ADMIN_EMAILS.some(e => e.toLowerCase() === userEmail);
          // Fallback profile if Firestore permission issue
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
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const isAdmin = Boolean(
    userProfile?.role === 'admin' ||
    (user?.email && ADMIN_EMAILS.some(adminEmail => adminEmail.toLowerCase() === user.email?.toLowerCase()))
  );

  const isSeller = Boolean(
    isAdmin || userProfile?.role === 'seller'
  );

  const isEmailVerified = Boolean(user?.emailVerified || userProfile?.isEmailVerified);

  const signInEmail = async (email: string, pass: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    await reload(cred.user);
  };

  const signUpEmail = async (email: string, pass: string, displayName: string, phone?: string) => {
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
    
    setUserProfile(newProfile);
  };

  const signInGoogle = async () => {
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
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const signOut = async () => {
    await fbSignOut(auth);
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
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        isAdmin,
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
