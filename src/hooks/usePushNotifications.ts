import { useState, useEffect, useCallback } from 'react';
import { getToken, deleteToken, isSupported } from 'firebase/messaging';
import { doc, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, getMessagingInstance } from '../services/firebase';
import { useAuth } from '../context/AuthContext';

const FCM_TOKEN_STORAGE_KEY = 'wailtail_fcm_token';

export interface UsePushNotificationsReturn {
  isSupported: boolean;
  permission: NotificationPermission;
  token: string | null;
  loading: boolean;
  error: string | null;
  fcmErrorDetails: string | null;
  isEnabled: boolean;
  requestPushPermission: () => Promise<string | null>;
  removePushPermission: () => Promise<void>;
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const { user, userProfile } = useAuth();
  const [isSupportedState, setIsSupportedState] = useState<boolean>(false);
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(FCM_TOKEN_STORAGE_KEY);
    }
    return null;
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fcmErrorDetails, setFcmErrorDetails] = useState<string | null>(null);

  // Check support on mount
  useEffect(() => {
    const checkSupport = async () => {
      try {
        const hasNavigator = typeof navigator !== 'undefined';
        const hasServiceWorker = typeof window !== 'undefined' && 'serviceWorker' in navigator;

        const hasNotification = typeof window !== 'undefined' && 'Notification' in window;

        let messagingSupported = false;
        if (typeof window !== 'undefined') {
          try {
            messagingSupported = await isSupported();
          } catch (suppErr: any) {
            console.error('[FCM Error Details]:', suppErr);
          }
        }

        const rawVapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
        const hasVapidKey = Boolean(rawVapidKey && rawVapidKey.trim() !== '');

        if (!hasVapidKey) {
          console.warn('[FCM Setup] VITE_FIREBASE_VAPID_KEY is missing or empty');
          const missingKeyMsg = 'Missing VITE_FIREBASE_VAPID_KEY environment variable';
          setError(missingKeyMsg);
          setFcmErrorDetails(missingKeyMsg);
        }

        if (!hasNotification || !hasServiceWorker || !messagingSupported) {
          setIsSupportedState(false);
          return;
        }

        if ('serviceWorker' in navigator) {
          try {
            await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
            await navigator.serviceWorker.ready;
          } catch (swErr: any) {
            console.error('[FCM Error Details]:', swErr);
          }
        }

        const msg = await getMessagingInstance();
        setIsSupportedState(Boolean(msg));

        if (typeof window !== 'undefined' && 'Notification' in window) {
          setPermission(Notification.permission);
        }

        // Verify token matching user profile
        const storedToken = localStorage.getItem(FCM_TOKEN_STORAGE_KEY);
        if (storedToken) {
          setToken(storedToken);
        } else if (userProfile?.fcmTokens && userProfile.fcmTokens.length > 0) {
          // Fallback: If user has a token registered, check if active
          setToken(userProfile.fcmTokens[0]);
        }
      } catch (err: any) {
        console.error('[FCM Error Details]:', err);
        const codeOrMsg = err?.code || err?.message || 'Failed to initialize push notifications';
        setError(err?.message || codeOrMsg);
        setFcmErrorDetails(codeOrMsg);
        setIsSupportedState(false);
      }
    };

    checkSupport();
  }, [userProfile?.fcmTokens]);

  const requestPushPermission = useCallback(async (): Promise<string | null> => {
    setError(null);
    setFcmErrorDetails(null);
    setLoading(true);

    try {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        throw new Error('Push notifications are not supported by this browser.');
      }

      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
      if (!vapidKey || vapidKey.trim() === '') {
        console.warn('[FCM Setup] VITE_FIREBASE_VAPID_KEY is missing or empty');
        const missingKeyMsg = 'Missing VITE_FIREBASE_VAPID_KEY environment variable';
        setError(missingKeyMsg);
        setFcmErrorDetails(missingKeyMsg);
        return null;
      }

      // Request native notification permission
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result !== 'granted') {
        if (result === 'denied') {
          const deniedMsg = 'Notification permissions were denied in browser settings.';
          setError(deniedMsg);
          setFcmErrorDetails(deniedMsg);
        }
        return null;
      }

      // Acquire FCM messaging instance
      const msg = await getMessagingInstance();
      if (!msg) {
        const noMsgErr = new Error('Firebase Cloud Messaging is unavailable or unsupported on this platform.');
        (noMsgErr as any).code = 'messaging/unsupported-browser';
        throw noMsgErr;
      }

      // Ensure service worker registration at root scope and retrieve active registration
      let registration: ServiceWorkerRegistration | undefined;
      if ('serviceWorker' in navigator) {
        try {
          await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
            scope: '/'
          });
          registration = await navigator.serviceWorker.ready;
        } catch (swErr: any) {
          console.error('[FCM Error Details]:', swErr);
          console.warn('[usePushNotifications] Service worker registration notice:', swErr);
        }
      }

      const token = await getToken(msg, {
        vapidKey,
        serviceWorkerRegistration: registration
      });

      if (token) {
        setToken(token);
        localStorage.setItem(FCM_TOKEN_STORAGE_KEY, token);
        setError(null);
        setFcmErrorDetails(null);

        // Append token to user's Firestore document
        if (user?.uid) {
          try {
            const userRef = doc(db, 'users', user.uid);
            await setDoc(userRef, {
              fcmTokens: arrayUnion(token)
            }, { merge: true });
          } catch (dbErr: any) {
            console.error('[FCM Error Details]:', dbErr);
            console.warn('[usePushNotifications] Failed to sync FCM token to Firestore:', dbErr);
          }
        }

        return token;
      } else {
        throw new Error('No registration token available. Request permission to generate one.');
      }
    } catch (err: any) {
      console.error('[FCM Error Details]:', err);
      console.error('[usePushNotifications] Error registering push notification:', err);
      const code = err?.code;
      const message = err?.message || 'Failed to enable push notifications';
      setError(message);
      setFcmErrorDetails(code || message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  const removePushPermission = useCallback(async (): Promise<void> => {
    setError(null);
    setFcmErrorDetails(null);
    setLoading(true);

    try {
      const currentToken = token || localStorage.getItem(FCM_TOKEN_STORAGE_KEY);
      const msg = await getMessagingInstance();

      if (msg && currentToken) {
        try {
          await deleteToken(msg);
        } catch (delErr: any) {
          console.error('[FCM Error Details]:', delErr);
          console.warn('[usePushNotifications] deleteToken warning:', delErr);
        }
      }

      // Remove from Firestore
      if (user?.uid && currentToken) {
        try {
          const userRef = doc(db, 'users', user.uid);
          await setDoc(userRef, {
            fcmTokens: arrayRemove(currentToken)
          }, { merge: true });
        } catch (dbErr: any) {
          console.error('[FCM Error Details]:', dbErr);
          console.warn('[usePushNotifications] Failed to remove FCM token from Firestore:', dbErr);
        }
      }

      localStorage.removeItem(FCM_TOKEN_STORAGE_KEY);
      setToken(null);
      setError(null);
      setFcmErrorDetails(null);
    } catch (err: any) {
      console.error('[FCM Error Details]:', err);
      console.error('[usePushNotifications] Error removing push permission:', err);
      const code = err?.code;
      const message = err?.message || 'Failed to disable push notifications';
      setError(message);
      setFcmErrorDetails(code || message);
    } finally {
      setLoading(false);
    }
  }, [token, user?.uid]);

  const isEnabled = Boolean(permission === 'granted' && token);

  return {
    isSupported: isSupportedState,
    permission,
    token,
    loading,
    error,
    fcmErrorDetails,
    isEnabled,
    requestPushPermission,
    removePushPermission
  };
}
