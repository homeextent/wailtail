// Firebase Cloud Messaging Background Service Worker for Wailtail Auctions
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyCfNsFjLPai4Vr6NqsSlc4vLVpKLNJNymQ",
  authDomain: "studio-apps-483721.firebaseapp.com",
  projectId: "studio-apps-483721",
  storageBucket: "studio-apps-483721.firebasestorage.app",
  messagingSenderId: "767927725806",
  appId: "1:767927725806:web:c366ad85b6e13322628dff"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);

  const title = payload.notification?.title || payload.data?.title || 'Wailtail Alert';
  const body = payload.notification?.body || payload.data?.body || 'New auction update';
  const icon = payload.notification?.icon || payload.data?.icon || '/pwa-192x192.png';
  const badge = payload.notification?.badge || payload.data?.badge || '/icons/icon-192x192.png';
  const tag = payload.data?.tag || payload.notification?.tag || 'wailtail-auction-alert';
  const deepLink = payload.data?.url || payload.data?.click_action || '/';

  const notificationOptions = {
    body,
    icon,
    badge,
    tag,
    data: {
      ...(payload.data || {}),
      url: deepLink
    }
  };

  return self.registration.showNotification(title, notificationOptions);
});

// Fallback native push listener for synthetic DevTools tests and raw web push payloads
self.addEventListener('push', (event) => {
  console.log('[firebase-messaging-sw.js] Native push event received:', event);

  let title = 'Wailtail Alert';
  let body = 'New auction update';
  let icon = '/pwa-192x192.png';
  let badge = '/icons/icon-192x192.png';
  let tag = 'wailtail-auction-alert';
  let deepLink = '/';
  let customData = {};

  if (event.data) {
    try {
      const payload = event.data.json();
      if (payload && typeof payload === 'object') {
        title = payload.notification?.title || payload.data?.title || payload.title || title;
        body = payload.notification?.body || payload.data?.body || payload.body || body;
        icon = payload.notification?.icon || payload.data?.icon || payload.icon || icon;
        badge = payload.notification?.badge || payload.data?.badge || payload.badge || badge;
        tag = payload.data?.tag || payload.notification?.tag || payload.tag || tag;
        deepLink = payload.data?.url || payload.data?.click_action || payload.url || payload.click_action || deepLink;
        customData = payload.data || payload;
      }
    } catch (err) {
      try {
        const text = event.data.text();
        if (text && text.trim().length > 0) {
          body = text;
        }
      } catch (textErr) {
        // Safely ignore unparseable payload
      }
    }
  }

  const notificationOptions = {
    body,
    icon,
    badge,
    tag,
    data: {
      ...(typeof customData === 'object' ? customData : {}),
      url: deepLink
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, notificationOptions)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawUrl = event.notification.data?.url || event.notification.data?.click_action || '/';
  let targetUrl;
  try {
    targetUrl = new URL(rawUrl, self.location.origin).href;
  } catch (urlErr) {
    targetUrl = self.location.origin + '/';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing tab if URL matches exactly
      for (const client of windowClients) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // Focus existing app tab and navigate if available
      for (const client of windowClients) {
        if ('focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
