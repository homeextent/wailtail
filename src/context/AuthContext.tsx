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
import { sendWelcomeBidderEmail, setUserEmailVerified } from '../services/auctionService';
import {
  ADMIN_EMAILS as DESIGNATED_ADMIN_EMAILS_LIST,
  isDesignatedAdminEmail,
  normalizeEmail
} from '../config/adminConfig';

export const ADMIN_EMAILS = DESIGNATED_ADMIN_EMAILS_LIST;

let isRegistrationInProgress = false;

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isGoogleSigningIn: boolean;
  isAdmin: boolean;
  isSeller: boolean;
  isEmailVerified: boolean;
  signInEmail: (email: string, pass: string) => Promise<User>;
  signUpEmail: (email: string, pass: string, displayName: string, phone?: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  resendVerificationEmail: (emailForResend?: string, passForResend?: string) => Promise<void>;
  checkEmailVerification: (emailForCheck?: string, passForCheck?: string) => Promise<boolean>;
  manualVerifyForDemo: (emailForDemo?: string, passForDemo?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  /**
   * Trusted Server-Side Consignor Authorization (Milestone M2.0B)
   * Requests server-side verification and authorization from /api/authorize-approved-consignor.
   * If authorized by the server, returns the refreshed canonical user profile from Firestore.
   */
  const requestServerConsignorAuthorization = async (
    currentUser: User
  ): Promise<UserProfile | null> => {
    try {
      if (!currentUser.emailVerified) {
        return null;
      }
      const token = await currentUser.getIdToken();
      if (!token) return null;

      const res = await fetch('/api/authorize-approved-consignor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        return null;
      }

      const data = await res.json();
      if (data && data.success && data.authorized) {
        const freshSnap = await getDoc(doc(db, 'users', currentUser.uid));
        if (freshSnap.exists()) {
          const freshData = { uid: freshSnap.id, ...freshSnap.data() } as UserProfile;
          setUserProfile(freshData);
          setUser((prev: User | null) => {
            if (prev) {
              (prev as any).role = freshData.role;
            }
            return prev;
          });
          return freshData;
        }
      }
      return null;
    } catch (err) {
      console.warn('[AuthContext] Notice during server consignor authorization:', err);
      return null;
    }
  };

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
        if (isRegistrationInProgress) {
          setLoading(false);
          return;
        }
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          let snap = await getDoc(userRef);

          if (!snap.exists()) {
            await new Promise((resolve) => setTimeout(resolve, 800));
            snap = await getDoc(userRef);
          }

          if (snap.exists()) {
            const data = snap.data() as UserProfile;

            if (data.isBanned || data.bannedFromBidding) {
              console.warn(`[AuthContext] Banned user detected for uid: ${currentUser.uid}. Enforcing signOut.`);
              await fbSignOut(auth).catch(() => {});
              setUser(null);
              setUserProfile(null);
              setToastMessage('Your bidding privileges have been revoked by an administrator.');
              setLoading(false);
              return;
            }

            const isVerified = Boolean(currentUser.emailVerified || data.isEmailVerified);

            // Strict Unverified Session Enforcement: If both are false, prevent session login hydration and execute signOut(auth)
            if (!isVerified) {
              console.warn(`[AuthContext] Unverified session detected for uid: ${currentUser.uid}. Enforcing signOut.`);
              await fbSignOut(auth).catch(() => {});
              setUser(null);
              setUserProfile(null);
              setLoading(false);
              return;
            }

            let updatedNeeded = false;
            const updates: Partial<UserProfile> = {};

            const userEmail = normalizeEmail(currentUser.email);
            const isDesignatedAdmin = isDesignatedAdminEmail(userEmail);
            
            // Ensure role is assigned
            if (isDesignatedAdmin && data.role !== 'admin') {
              data.role = 'admin';
              updates.role = 'admin';
              updatedNeeded = true;
            } else if (!data.role) {
              data.role = isDesignatedAdmin ? 'admin' : 'bidder';
              if (isDesignatedAdmin) {
                updates.role = 'admin';
                updatedNeeded = true;
              }
            }

            // Update email verified status if changed
            if (currentUser.emailVerified && !data.isEmailVerified) {
              updates.isEmailVerified = true;
              data.isEmailVerified = true;
              updatedNeeded = true;
              setUserEmailVerified(currentUser.uid, true).catch((err) => console.warn('User profile sync notice:', err));
            }

            if (updatedNeeded) {
              await updateDoc(userRef, updates).catch((err) => console.warn('User profile sync notice:', err));
            }

            // Defer welcome email dispatch until email verification is confirmed
            if (isVerified && currentUser.email && data.welcomeEmailSent !== true) {
              console.log(`[Welcome Email] Dispatching welcome email in onAuthStateChanged for ${currentUser.email} (${currentUser.uid})`);
              sendWelcomeBidderEmail(currentUser.uid, currentUser.email, data.displayName || currentUser.email.split('@')[0])
                .then((sent) => {
                  if (sent) data.welcomeEmailSent = true;
                })
                .catch((err: any) => {
                  console.warn('[Welcome Email] Automatic verified welcome email dispatch notice:', err);
                });
            } else if (data.welcomeEmailSent === true) {
              console.log(`[Welcome Email] Skipped welcome email in onAuthStateChanged: welcomeEmailSent sentinel is true for ${currentUser.uid}`);
            }

            (currentUser as any).role = data.role;
            setUser(currentUser);
            setUserProfile(data);
          } else {
            // Profile is missing from Firestore - orphaned session (account deleted by administrator)
            if (!isRegistrationInProgress) {
              console.warn(`[AuthContext] Account profile users/${currentUser.uid} missing. Revoking orphaned session.`);
              await fbSignOut(auth).catch((err) => console.warn('Forced sign-out notice:', err));
              setUser(null);
              setUserProfile(null);
              setToastMessage('This account has been deleted by an administrator.');
              if (typeof window !== 'undefined' && window.location.pathname !== '/') {
                window.location.href = '/';
              }
            }
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
          if (!isRegistrationInProgress) {
            await fbSignOut(auth).catch(() => {});
            setUser(null);
            setUserProfile(null);
          }
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
    const currentAuthUser = auth.currentUser || user;
    if (!currentAuthUser || isRegistrationInProgress) return;

    const userRef = doc(db, 'users', currentAuthUser.uid);
    const unsub = onSnapshot(userRef, async (snap) => {
      const firebaseUser = auth.currentUser;
      if (firebaseUser && !isRegistrationInProgress) {
        if (!snap.exists()) {
          console.warn(`[AuthContext] Active session user doc users/${firebaseUser.uid} removed. Revoking session.`);
          await fbSignOut(auth).catch(() => {});
          setUser(null);
          setUserProfile(null);
          setToastMessage('This account has been deleted by an administrator.');
          if (typeof window !== 'undefined' && window.location.pathname !== '/') {
            window.location.href = '/';
          }
        } else {
          const data = snap.data() as UserProfile;
          const isVerified = Boolean(firebaseUser.emailVerified || data.isEmailVerified);
          if (!isVerified) {
            console.warn(`[AuthContext] Real-time check: Session email unverified. Revoking session.`);
            await fbSignOut(auth).catch(() => {});
            setUser(null);
            setUserProfile(null);
          }
        }
      }
    }, (err) => {
      console.warn('Realtime profile watcher notice:', err);
    });
    return () => unsub();
  }, [user?.uid]);

  const isEmailVerified = Boolean(user?.emailVerified || userProfile?.isEmailVerified);

  // Administrative root of trust: Verified account state & explicit email allowlist ONLY.
  // Mutable profile roles (users/{uid}.role) must NEVER independently establish administrative authority.
  const isAdmin = Boolean(
    user?.email &&
    isDesignatedAdminEmail(user.email) &&
    isEmailVerified
  );

  const isSeller = Boolean(
    isAdmin || userProfile?.role === 'seller'
  );

  const signInEmail = async (email: string, pass: string): Promise<User> => {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    await reload(cred.user);

    // If cred.user.emailVerified is true, execute await setUserEmailVerified(cred.user.uid, true)
    if (cred.user.emailVerified) {
      try {
        await setUserEmailVerified(cred.user.uid, true);
      } catch (syncErr) {
        console.warn('Could not sync emailVerified to Firestore on signInEmail:', syncErr);
      }
    }

    // Check both Firebase Auth user.emailVerified and Firestore staff override userProfile.isEmailVerified
    let profileData: UserProfile | null = null;
    try {
      const snap = await getDoc(doc(db, 'users', cred.user.uid));
      if (snap.exists()) {
        profileData = { uid: snap.id, ...snap.data() } as UserProfile;
      }
    } catch {
      // ignore
    }

    const isProfileVerified = Boolean(profileData?.isEmailVerified);
    const isVerified = Boolean(cred.user.emailVerified || isProfileVerified);
    if (!isVerified) {
      await fbSignOut(auth).catch(() => {});
      setUser(null);
      setUserProfile(null);
      throw new Error('Email verification required. Please check your inbox to verify your email address before signing in.');
    }

    // Re-evaluate approved consignor role via trusted server authorization
    const userEmail = normalizeEmail(cred.user.email || email);
    const isDesignatedAdmin = isDesignatedAdminEmail(userEmail);
    if (!isDesignatedAdmin && isVerified) {
      try {
        const freshProfile = await requestServerConsignorAuthorization(cred.user);
        if (freshProfile) {
          profileData = freshProfile;
        }
      } catch (authErr) {
        console.warn('Could not complete consignor authorization on signInEmail:', authErr);
      }
    }

    // Ensure the user profile hydrated from Firestore reflects isEmailVerified: true before completing sign-in and returning cred.user
    if (profileData) {
      if (cred.user.emailVerified || isVerified) {
        profileData.isEmailVerified = true;
      }
      (cred.user as any).role = profileData.role;
      setUser(cred.user);
      setUserProfile(profileData);

      // Verify userProfile.welcomeEmailSent !== true in Firestore state instead of checking client localStorage
      if (isVerified && cred.user.email && profileData.welcomeEmailSent !== true) {
        console.log(`[Welcome Email] Dispatching welcome email in signInEmail for ${cred.user.email} (${cred.user.uid})`);
        sendWelcomeBidderEmail(
          cred.user.uid,
          cred.user.email,
          profileData.displayName || cred.user.displayName || cred.user.email.split('@')[0]
        ).then((sent) => {
          if (sent && profileData) profileData.welcomeEmailSent = true;
        }).catch((err) => {
          console.warn('[Welcome Email] signInEmail welcome email notice:', err);
        });
      } else if (profileData.welcomeEmailSent === true) {
        console.log(`[Welcome Email] Skipped welcome email in signInEmail: welcomeEmailSent sentinel is true for ${cred.user.uid}`);
      }
    }

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

      const userEmail = normalizeEmail(cred.user.email || email);
      const isDesignatedAdmin = isDesignatedAdminEmail(userEmail);
      let assignedRole: 'admin' | 'bidder' = isDesignatedAdmin ? 'admin' : 'bidder';
      const resolvedDisplayName = displayName || email.split('@')[0] || 'Member';

      // Create base user document in users/{uid} while authenticated
      const newProfile: UserProfile = {
        uid: cred.user.uid,
        email: cred.user.email || email,
        displayName: resolvedDisplayName,
        phone: phone || '',
        role: assignedRole,
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

      try {
        await setDoc(doc(db, 'bidders', cred.user.uid), newProfile);
      } catch (e) {
        console.warn('Error creating bidder doc:', e);
      }

      // Immediately execute signOut to prevent automatic Firebase client session auto-login.
      // Consignor role promotion occurs securely via server endpoint once email verification is completed.
      await fbSignOut(auth).catch(() => {});
      setUser(null);
      setUserProfile(null);
    } finally {
      isRegistrationInProgress = false;
    }
  };

  const signInGoogle = async () => {
    if (isGoogleSigningIn) return;
    setIsGoogleSigningIn(true);
    setLoading(true);
    try {
      let cred;
      try {
        cred = await signInWithPopup(auth, googleProvider);
      } catch (popupErr: any) {
        const code = popupErr?.code || '';
        const msg = popupErr?.message || '';
        if (msg.includes('INTERNAL ASSERTION FAILED') || msg.includes('internal assertion')) {
          console.warn('[AuthContext] Silenced internal assertion error during Google sign-in:', msg);
          return;
        }
        if (code === 'auth/popup-closed-by-user') {
          console.info('[AuthContext] Google sign-in popup closed by user.');
          const cleanError = new Error('Sign-in popup was closed before completing verification.');
          (cleanError as any).code = 'auth/popup-closed-by-user';
          throw cleanError;
        }
        throw popupErr;
      }

      if (!cred || !cred.user) {
        return;
      }

      const userRef = doc(db, 'users', cred.user.uid);
      const snap = await getDoc(userRef);
      const userEmail = normalizeEmail(cred.user.email);
      const isDesignatedAdmin = isDesignatedAdminEmail(userEmail);

      let profile: UserProfile;

      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        let updateNeeded = false;
        const updates: Partial<UserProfile> = {};

        if (isDesignatedAdmin && data.role !== 'admin') {
          data.role = 'admin';
          updates.role = 'admin';
          updateNeeded = true;
        } else if (!data.role) {
          data.role = isDesignatedAdmin ? 'admin' : 'bidder';
          if (isDesignatedAdmin) {
            updates.role = 'admin';
            updateNeeded = true;
          }
        }

        profile = { ...data, uid: cred.user.uid };

        // Check if user is an approved consignor via trusted server authorization
        if (!isDesignatedAdmin) {
          try {
            const freshProfile = await requestServerConsignorAuthorization(cred.user);
            if (freshProfile) {
              profile = freshProfile;
            }
          } catch (authErr) {
            console.warn('Could not check consignor authorization on Google sign in:', authErr);
          }
        }

        if (updateNeeded) {
          await updateDoc(userRef, updates).catch((err) => console.warn('Admin/user role sync notice:', err));
        }
      } else {
        const newProfile: UserProfile = {
          uid: cred.user.uid,
          email: cred.user.email || '',
          displayName: cred.user.displayName || (cred.user.email ? cred.user.email.split('@')[0] : 'Bidder'),
          role: isDesignatedAdmin ? 'admin' : 'bidder',
          isEmailVerified: true, // Google OAuth pre-verifies email addresses
          registeredAt: Date.now(),
          totalBidsPlaced: 0,
          highestBidPlaced: 0
        };
        await setDoc(userRef, newProfile).catch((err) => console.warn('Error storing Google user profile:', err));
        await setDoc(doc(db, 'bidders', cred.user.uid), newProfile).catch((err) => console.warn('Error storing Google bidder profile:', err));
        profile = newProfile;

        // Check if user is an approved consignor via trusted server authorization
        if (!isDesignatedAdmin) {
          try {
            const freshProfile = await requestServerConsignorAuthorization(cred.user);
            if (freshProfile) {
              profile = freshProfile;
            }
          } catch (authErr) {
            console.warn('Could not check consignor authorization on new Google profile:', authErr);
          }
        }
      }

      if (profile.isBanned || profile.bannedFromBidding) {
        await fbSignOut(auth).catch(() => {});
        setUser(null);
        setUserProfile(null);
        throw new Error('Your bidding privileges have been revoked by an administrator.');
      }

      (cred.user as any).role = profile.role;
      setUser(cred.user);
      setUserProfile(profile);

      // Verify userProfile.welcomeEmailSent !== true in Firestore state instead of checking client localStorage
      if (cred.user.email && profile.welcomeEmailSent !== true) {
        console.log(`[Welcome Email] Dispatching welcome email in signInGoogle for ${cred.user.email} (${cred.user.uid})`);
        sendWelcomeBidderEmail(
          cred.user.uid,
          cred.user.email,
          profile.displayName || cred.user.displayName || cred.user.email.split('@')[0]
        ).then((sent) => {
          if (sent) profile.welcomeEmailSent = true;
        }).catch((err: any) => {
          console.warn('[Welcome Email] Google sign-in welcome email dispatch notice:', err);
        });
      } else if (profile.welcomeEmailSent === true) {
        console.log(`[Welcome Email] Skipped welcome email in signInGoogle: welcomeEmailSent sentinel is true for ${cred.user.uid}`);
      }
    } catch (error: any) {
      const code = error?.code || '';
      const msg = error?.message || '';
      if (code === 'auth/popup-closed-by-user') {
        console.info('[AuthContext] Google sign-in popup closed by user.');
      } else if (msg.includes('INTERNAL ASSERTION FAILED') || msg.includes('internal assertion')) {
        console.warn('[AuthContext] Silenced internal assertion error during Google sign-in:', msg);
        return;
      } else {
        console.error('[AuthContext] Google sign-in error:', error);
      }
      throw error;
    } finally {
      setIsGoogleSigningIn(false);
      setLoading(false);
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

  const resendVerificationEmail = async (emailForResend?: string, passForResend?: string) => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
      return;
    }
    if (emailForResend && passForResend) {
      const cred = await signInWithEmailAndPassword(auth, emailForResend, passForResend);
      try {
        await sendEmailVerification(cred.user);
      } finally {
        await fbSignOut(auth).catch(() => {});
      }
    }
  };

  const checkEmailVerification = async (emailForCheck?: string, passForCheck?: string): Promise<boolean> => {
    let targetUser = auth.currentUser;
    let temporarySession = false;

    if (targetUser) {
      await reload(targetUser);
    } else if (emailForCheck) {
      if (!passForCheck) {
        throw new Error('Password is required to check email verification.');
      }
      try {
        const cred = await signInWithEmailAndPassword(auth, emailForCheck.trim(), passForCheck);
        targetUser = cred.user;
        temporarySession = true;
        await reload(targetUser);
      } catch (signInErr: any) {
        const code = signInErr?.code || '';
        let descriptiveMessage = signInErr?.message || 'Failed to authenticate for verification check.';
        if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
          descriptiveMessage = 'Incorrect password. Please verify your credentials and try again.';
        } else if (code === 'auth/user-not-found') {
          descriptiveMessage = 'No account found with this email. Please register first.';
        } else if (code === 'auth/invalid-email') {
          descriptiveMessage = 'Please enter a valid email address.';
        } else if (code === 'auth/too-many-requests') {
          descriptiveMessage = 'Access temporarily blocked due to multiple attempts. Please try again later.';
        }
        const customErr = new Error(descriptiveMessage);
        (customErr as any).code = code;
        throw customErr;
      }
    } else {
      return false;
    }

    if (!targetUser) {
      return false;
    }

    const isVerified = Boolean(targetUser.emailVerified);

    if (isVerified) {
      try {
        await setUserEmailVerified(targetUser.uid, true);
      } catch (syncErr) {
        console.warn('Could not sync emailVerified to Firestore in checkEmailVerification:', syncErr);
      }

      let profileData: UserProfile | null = null;
      try {
        const snap = await getDoc(doc(db, 'users', targetUser.uid));
        if (snap.exists()) {
          profileData = { uid: snap.id, ...snap.data(), isEmailVerified: true } as UserProfile;
        }
      } catch (fetchErr) {
        console.warn('Could not fetch user profile in checkEmailVerification:', fetchErr);
      }

      const userEmail = normalizeEmail(targetUser.email || emailForCheck);
      const isDesignatedAdmin = isDesignatedAdminEmail(userEmail);

      // Re-evaluate approved consignor role via trusted server authorization
      if (!isDesignatedAdmin) {
        try {
          const freshProfile = await requestServerConsignorAuthorization(targetUser);
          if (freshProfile) {
            profileData = freshProfile;
          }
        } catch (authErr) {
          console.warn('Could not authorize consignor on checkEmailVerification:', authErr);
        }
      }

      if (!profileData) {
        profileData = {
          uid: targetUser.uid,
          email: targetUser.email || emailForCheck || '',
          displayName: targetUser.displayName || (targetUser.email || emailForCheck || '').split('@')[0],
          role: isDesignatedAdmin ? 'admin' : 'bidder',
          isEmailVerified: true,
          registeredAt: Date.now(),
          totalBidsPlaced: 0,
          highestBidPlaced: 0
        };
      }

      (targetUser as any).role = profileData.role;
      setUser(targetUser);
      setUserProfile(profileData);

      // Trigger sendWelcomeBidderEmail (guarded against duplicates via Firestore welcomeEmailSent sentinel)
      const recipientEmail = (targetUser.email || profileData.email || '').trim();
      if (recipientEmail && profileData.welcomeEmailSent !== true) {
        console.log(`[Welcome Email] Dispatching welcome email in checkEmailVerification for ${recipientEmail} (${targetUser.uid})`);
        sendWelcomeBidderEmail(
          targetUser.uid,
          recipientEmail,
          profileData.displayName || recipientEmail.split('@')[0]
        ).then((sent) => {
          if (sent && profileData) profileData.welcomeEmailSent = true;
        }).catch((err) => {
          console.warn('[Welcome Email] Verification welcome email dispatch notice:', err);
        });
      } else if (profileData.welcomeEmailSent === true) {
        console.log(`[Welcome Email] Skipped welcome email in checkEmailVerification: welcomeEmailSent sentinel is true for ${targetUser.uid}`);
      }

      return true;
    } else {
      if (temporarySession) {
        await fbSignOut(auth).catch(() => {});
      }
      return false;
    }
  };

  const manualVerifyForDemo = async (emailForDemo?: string, passForDemo?: string) => {
    let targetUser = auth.currentUser;
    if (!targetUser && emailForDemo && passForDemo) {
      try {
        const cred = await signInWithEmailAndPassword(auth, emailForDemo.trim(), passForDemo);
        targetUser = cred.user;
      } catch (err) {
        console.warn('Demo verify sign-in error:', err);
      }
    }

    if (!targetUser) return;

    try {
      await setUserEmailVerified(targetUser.uid, true);
    } catch (err) {
      console.warn(err);
    }

    let profileData: UserProfile | null = null;
    try {
      const snap = await getDoc(doc(db, 'users', targetUser.uid));
      if (snap.exists()) {
        profileData = { uid: snap.id, ...snap.data(), isEmailVerified: true } as UserProfile;
      }
    } catch {
      // ignore
    }

    if (!profileData && userProfile) {
      profileData = { ...userProfile, isEmailVerified: true };
    } else if (!profileData) {
      const userEmail = normalizeEmail(targetUser.email || emailForDemo);
      const isDesignatedAdmin = isDesignatedAdminEmail(userEmail);
      profileData = {
        uid: targetUser.uid,
        email: targetUser.email || emailForDemo || '',
        displayName: targetUser.displayName || (targetUser.email || emailForDemo || '').split('@')[0],
        role: isDesignatedAdmin ? 'admin' : 'bidder',
        isEmailVerified: true,
        registeredAt: Date.now(),
        totalBidsPlaced: 0,
        highestBidPlaced: 0
      };
    }

    setUser(targetUser);
    setUserProfile(profileData);

    const recipientEmail = (targetUser.email || profileData?.email || '').trim();
    if (recipientEmail && profileData?.welcomeEmailSent !== true) {
      console.log(`[Welcome Email] Dispatching welcome email in manualVerifyForDemo for ${recipientEmail} (${targetUser.uid})`);
      sendWelcomeBidderEmail(
        targetUser.uid,
        recipientEmail,
        profileData?.displayName || recipientEmail.split('@')[0]
      ).then((sent) => {
        if (sent && profileData) profileData.welcomeEmailSent = true;
      }).catch((err) => {
        console.warn('[Welcome Email] Demo welcome email dispatch notice:', err);
      });
    } else if (profileData?.welcomeEmailSent === true) {
      console.log(`[Welcome Email] Skipped welcome email in manualVerifyForDemo: welcomeEmailSent sentinel is true for ${targetUser.uid}`);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        isGoogleSigningIn,
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
