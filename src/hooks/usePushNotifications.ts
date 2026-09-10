import { useState, useEffect, useCallback } from 'react';
import { getToken, deleteToken } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, getMessagingInstance } from '../services/firebase';
import { useAuth } from '../context/AuthContext';

const FCM_TOKEN_STORAGE_KEY = 'wailtail_fcm_token';

export interface UsePushNotificationsReturn {
  isSupported: boolean;
  permission: NotificationPermission;
  token: string | null;
  loading: boolean;
  error: string | null;
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

  // Check support on mount
  useEffect(() => {
    const checkSupport = async () => {
      const hasNotification = typeof window !== 'undefined' && 'Notification' in window;
      const hasServiceWorker = typeof window !== 'undefined' && 'serviceWorker' in window;

      if (!hasNotification || !hasServiceWorker) {
        setIsSupportedState(false);
        return;
      }

      const msg = await getMessagingInstance();
      setIsSupportedState(Boolean(msg));

      setPermission(Notification.permission);

      // Verify token matching user profile
      const storedToken = localStorage.getItem(FCM_TOKEN_STORAGE_KEY);
      if (storedToken) {
        setToken(storedToken);
      } else if (userProfile?.fcmTokens && userProfile.fcmTokens.length > 0) {
        // Fallback: If user has a token registered, check if active
        setToken(userProfile.fcmTokens[0]);
      }
    };

    checkSupport();
  }, [userProfile?.fcmTokens]);

  const requestPushPermission = useCallback(async (): Promise<string | null> => {
    setError(null);
    setLoading(true);

    try {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        throw new Error('Push notifications are not supported by this browser.');
      }

      // Request native notification permission
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result !== 'granted') {
        if (result === 'denied') {
          setError('Notification permissions were denied in browser settings.');
        }
        setLoading(false);
        return null;
      }

      // Acquire FCM messaging instance
      const msg = await getMessagingInstance();
      if (!msg) {
        throw new Error('Firebase Cloud Messaging is unavailable or unsupported on this platform.');
      }

      // Ensure service worker registration (critical for iOS Safari PWA)
      let swRegistration: ServiceWorkerRegistration | undefined;
      if ('serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          swRegistration = registrations.find(r => r.active && r.active.scriptURL && r.active.scriptURL.includes('firebase-messaging-sw.js'));
          
          if (!swRegistration) {
            swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
              scope: '/'
            });
          }
        } catch (swErr) {
          console.warn('[usePushNotifications] Service worker registration notice:', swErr);
          swRegistration = await navigator.serviceWorker.ready.catch(() => undefined);
        }
      }

      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || undefined;
      const tokenOptions: { vapidKey?: string; serviceWorkerRegistration?: ServiceWorkerRegistration } = {};
      if (vapidKey) {
        tokenOptions.vapidKey = vapidKey;
      }
      if (swRegistration) {
        tokenOptions.serviceWorkerRegistration = swRegistration;
      }

      const currentToken = await getToken(msg, tokenOptions);

      if (currentToken) {
        setToken(currentToken);
        localStorage.setItem(FCM_TOKEN_STORAGE_KEY, currentToken);

        // Append token to user's Firestore document
        if (user?.uid) {
          try {
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, {
              fcmTokens: arrayUnion(currentToken)
            });
          } catch (dbErr) {
            console.warn('[usePushNotifications] Failed to sync FCM token to Firestore:', dbErr);
          }
        }

        setLoading(false);
        return currentToken;
      } else {
        throw new Error('No registration token available. Request permission to generate one.');
      }
    } catch (err: any) {
      console.error('[usePushNotifications] Error registering push notification:', err);
      setError(err?.message || 'Failed to enable push notifications');
      setLoading(false);
      return null;
    }
  }, [user?.uid]);

  const removePushPermission = useCallback(async (): Promise<void> => {
    setError(null);
    setLoading(true);

    try {
      const currentToken = token || localStorage.getItem(FCM_TOKEN_STORAGE_KEY);
      const msg = await getMessagingInstance();

      if (msg && currentToken) {
        try {
          await deleteToken(msg);
        } catch (delErr) {
          console.warn('[usePushNotifications] deleteToken warning:', delErr);
        }
      }

      // Remove from Firestore
      if (user?.uid && currentToken) {
        try {
          const userRef = doc(db, 'users', user.uid);
          await updateDoc(userRef, {
            fcmTokens: arrayRemove(currentToken)
          });
        } catch (dbErr) {
          console.warn('[usePushNotifications] Failed to remove FCM token from Firestore:', dbErr);
        }
      }

      localStorage.removeItem(FCM_TOKEN_STORAGE_KEY);
      setToken(null);
      setLoading(false);
    } catch (err: any) {
      console.error('[usePushNotifications] Error removing push permission:', err);
      setError(err?.message || 'Failed to disable push notifications');
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
    isEnabled,
    requestPushPermission,
    removePushPermission
  };
}
